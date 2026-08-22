import { describe, it, expect, vi, beforeEach } from 'vitest';

// DEBT-028 -- premiere couverture de cette route.
// Elle est publique, non authentifiee, et confirme en une requete si un code
// promo existe pour un site donne : c'est un oracle d'enumeration, les codes
// marchands etant courts et devinables (ETE20, NOEL10...).
//
// Ces tests verrouillent surtout la propriete qui a leve mon objection au
// correctif : limiter par site ouvrirait un deni de service cible, SAUF si la
// garde est placee de sorte qu'un code VALIDE ne passe jamais par le
// compteur. Le test « compteur sature + code valide -> 200 » est le coeur du
// fichier ; sans lui, le correctif serait une regression deguisee.

const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({
  logAnomaly: (...a: unknown[]) => logAnomalyMock(...a),
}));

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...(a as [string])) },
}));

import { POST } from '../route';

type Result = { data?: unknown; error?: unknown; count?: number | null };

function chain(result: Result) {
  const c: Record<string, unknown> = {};
  const self = () => c;
  c.select = vi.fn(self);
  c.eq = vi.fn(self);
  c.gte = vi.fn(self);
  c.single = vi.fn(() => Promise.resolve(result));
  c.maybeSingle = vi.fn(() => Promise.resolve(result));
  c.then = (resolve: (v: Result) => void) => resolve(result);
  return c;
}

const SITE = { data: { id: 'site-1' }, error: null };
const PROMO_VALIDE = {
  data: { id: 'promo-1', code: 'ETE20', discount_type: 'percent', discount_value: 20,
          min_order: 0, max_uses: null, used_count: 0, expires_at: null },
  error: null,
};

/** `failures` = nombre d'echecs deja journalises dans la derniere minute. */
function setup(promo: Result, failures = 0) {
  const tables: Record<string, Result> = {
    sites: SITE,
    promo_codes: promo,
    checkout_anomalies: { count: failures, data: null, error: null },
  };
  const built: Record<string, ReturnType<typeof chain>> = {};
  fromMock.mockImplementation((table: string) => {
    built[table] = chain(tables[table] ?? { data: null, error: null });
    return built[table];
  });
  return built;
}

function req(body: unknown) {
  return new Request('https://woorri.test/api/shop/promo/validate', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as never;
}

const call = (code = 'ETE20') => POST(req({ slug: 'boutique', code, subtotal: 100 }));

beforeEach(() => {
  fromMock.mockReset();
  logAnomalyMock.mockReset();
});

describe('POST /api/shop/promo/validate — code valide', () => {
  it('retourne la remise et ne journalise AUCUN echec', async () => {
    setup(PROMO_VALIDE);
    const json = await (await call()).json();
    expect(json.valid).toBe(true);
    expect(json.discount).toBe(20);
    expect(logAnomalyMock).not.toHaveBeenCalled();
  });

  it("PROPRIETE CENTRALE : meme avec le compteur SATURE, un code valide passe -- la saturation ne peut pas bloquer un acheteur legitime", async () => {
    setup(PROMO_VALIDE, 9999);
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).valid).toBe(true);
  });
});

describe('POST /api/shop/promo/validate — limitation de debit (DEBT-028)', () => {
  it('code introuvable sous le seuil -> valid:false et echec journalise en severity info (aucun email admin)', async () => {
    setup({ data: null, error: null }, 3);
    const json = await (await call('INCONNU')).json();
    expect(json.valid).toBe(false);
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'promo_validate_not_found', severity: 'info' })
    );
  });

  it('10 echecs deja enregistres dans la minute -> 429, et plus rien n’est journalise (croissance de checkout_anomalies bornee)', async () => {
    setup({ data: null, error: null }, 10);
    const res = await call('INCONNU');
    expect(res.status).toBe(429);
    expect(logAnomalyMock).not.toHaveBeenCalled();
  });

  it('le comptage porte sur CE site et sur le type dedie, pas sur toutes les anomalies', async () => {
    const built = setup({ data: null, error: null }, 0);
    await call('INCONNU');
    const eqCalls = (built.checkout_anomalies.eq as ReturnType<typeof vi.fn>).mock.calls;
    expect(eqCalls).toContainEqual(['site_id', 'site-1']);
    expect(eqCalls).toContainEqual(['type', 'promo_validate_not_found']);
  });
});

describe('POST /api/shop/promo/validate — cas qui ne doivent PAS etre comptes', () => {
  // Ces codes EXISTENT : ce n'est pas un signal d'enumeration, et les compter
  // penaliserait de vrais acheteurs.
  it('code expire -> valid:false sans journalisation', async () => {
    setup({ data: { ...(PROMO_VALIDE.data as object), expires_at: '2000-01-01T00:00:00Z' }, error: null });
    const json = await (await call()).json();
    expect(json.valid).toBe(false);
    expect(json.reason).toBe('expired');
    expect(logAnomalyMock).not.toHaveBeenCalled();
  });

  it('code epuise -> valid:false sans journalisation', async () => {
    setup({ data: { ...(PROMO_VALIDE.data as object), max_uses: 5, used_count: 5 }, error: null });
    const json = await (await call()).json();
    expect(json.valid).toBe(false);
    expect(json.reason).toBe('depleted');
    expect(logAnomalyMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/shop/promo/validate — isolation tenant (regression P-2)', () => {
  it('la recherche filtre par site_id resolu, par code EXACT et par active -- jamais un ILIKE', async () => {
    const built = setup(PROMO_VALIDE);
    await call('  ete20  ');
    const eqCalls = (built.promo_codes.eq as ReturnType<typeof vi.fn>).mock.calls;
    expect(eqCalls).toContainEqual(['site_id', 'site-1']);
    expect(eqCalls).toContainEqual(['code', 'ETE20']);   // normalise, non tronque
    expect(eqCalls).toContainEqual(['active', true]);
    expect(built.promo_codes.ilike).toBeUndefined();
  });
});
