import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// LOT 6 -- LE HARNAIS OBSERVE LES FILTRES REELLEMENT POSES.
//
// Un mock qui rend `b.eq = () => b` rendrait le perimetre INVISIBLE : retirer
// `.eq('site_id', ...)` ne casserait aucun test, et la limite d'un site
// fermerait la route de tout le parc sans que rien ne bronche. Les filtres
// sont donc CAPTURES, et les mutations de perimetre sont observables.
// ============================================================

const filtres: [string, string, unknown][] = [];
let reponse: { count: number | null; error: unknown } = { count: 0, error: null };
const logAnomalyMock = vi.fn();

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      filtres.push(['from', table, null]);
      const b: any = {};
      b.select = (cols: string, opts?: unknown) => { filtres.push(['select', cols, opts]); return b; };
      b.eq = (c: string, v: unknown) => { filtres.push(['eq', c, v]); return b; };
      b.is = (c: string, v: unknown) => { filtres.push(['is', c, v]); return b; };
      b.gte = (c: string, v: unknown) => { filtres.push(['gte', c, v]); return b; };
      b.then = (res: (r: unknown) => unknown) => Promise.resolve(reponse).then(res);
      return b;
    },
  },
}));
vi.mock('@/lib/anomaly', () => ({ logAnomaly: (...a: unknown[]) => logAnomalyMock(...a) }));

import { consommerJeton } from '../rateLimit';

beforeEach(() => {
  filtres.length = 0;
  reponse = { count: 0, error: null };
  logAnomalyMock.mockReset().mockResolvedValue(undefined);
});

const appel = (o: Partial<Parameters<typeof consommerJeton>[0]> = {}) =>
  consommerJeton({ type: 'sonde', siteId: 'site-1', fenetreMs: 60_000, plafond: 3, ...o });

describe('consommerJeton — sous le plafond', () => {
  it('autorise et CONSOMME un jeton', async () => {
    reponse = { count: 2, error: null };
    const v = await appel();
    expect(v).toEqual({ ok: true });
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sonde', severity: 'info', siteId: 'site-1' })
    );
  });

  it("l'enregistrement est en severity `info` — un compteur n'alerte jamais", async () => {
    await appel();
    expect(logAnomalyMock.mock.calls[0][0].severity).toBe('info');
  });
});

describe('consommerJeton — au plafond', () => {
  it('plafond atteint -> 429, et AUCUN jeton consommé', async () => {
    reponse = { count: 3, error: null };
    const v = await appel();
    expect(v).toEqual({ ok: false, statut: 429, erreur: expect.any(String) });
    expect(logAnomalyMock).not.toHaveBeenCalled();
  });

  it('plafond dépassé -> 429', async () => {
    reponse = { count: 99, error: null };
    expect((await appel()) as { statut: number }).toMatchObject({ ok: false, statut: 429 });
  });

  it('le message de refus est celui demandé', async () => {
    reponse = { count: 3, error: null };
    const v = await appel({ message: 'Trop de variantes.' });
    expect(v).toMatchObject({ erreur: 'Trop de variantes.' });
  });
});

describe('consommerJeton — LE POINT CENTRAL : la panne FERME', () => {
  it('erreur du compteur -> 503, jamais une autorisation', async () => {
    // C'EST LA REGRESSION QUE CE TEST EXISTE POUR EMPECHER. Les quatre copies
    // historiques ne lisaient pas `error` : PostgREST rendait `count: null`,
    // `(null ?? 0) >= N` valait false, et la depense passait pendant la panne.
    reponse = { count: null, error: { message: 'db down' } };
    const v = await appel();
    expect(v).toEqual({ ok: false, statut: 503, erreur: expect.any(String) });
    expect(logAnomalyMock).not.toHaveBeenCalled();
  });

  it('count null SANS erreur est traité comme zéro — le cas nominal head:true', async () => {
    reponse = { count: null, error: null };
    expect(await appel()).toEqual({ ok: true });
  });
});

describe('consommerJeton — le périmètre est réellement posé', () => {
  it('compte UNIQUEMENT sur ce site, ce type et cette fenêtre', async () => {
    await appel();
    expect(filtres).toContainEqual(['from', 'checkout_anomalies', null]);
    expect(filtres).toContainEqual(['eq', 'type', 'sonde']);
    expect(filtres).toContainEqual(['eq', 'site_id', 'site-1']);
    expect(filtres.some(([k, c]) => k === 'gte' && c === 'created_at')).toBe(true);
  });

  it('la fenêtre est bien un instant PASSÉ, jamais l’epoch ni le futur', async () => {
    const avant = Date.now();
    await appel({ fenetreMs: 60_000 });
    const borne = filtres.find(([k, c]) => k === 'gte' && c === 'created_at')![2] as string;
    const t = Date.parse(borne);
    expect(t).toBeGreaterThan(avant - 61_000);
    expect(t).toBeLessThanOrEqual(avant);
  });

  it('siteId null s’exprime par `is`, jamais par `eq` — sinon PostgREST ne filtre rien', async () => {
    await appel({ siteId: null });
    expect(filtres).toContainEqual(['is', 'site_id', null]);
    expect(filtres.some(([k, c]) => k === 'eq' && c === 'site_id')).toBe(false);
  });

  it('le comptage est un `head` exact — jamais un chargement de lignes', async () => {
    await appel();
    expect(filtres).toContainEqual(['select', 'id', { count: 'exact', head: true }]);
  });
});
