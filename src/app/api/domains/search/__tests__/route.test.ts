import { describe, it, expect, vi, beforeEach } from 'vitest';
import { creerFrom, journalVierge, type JournalPostgrest, type TableStub } from '@/lib/testing/postgrest';
import { NextRequest } from 'next/server';

// ============================================================
// D-04 -- CE QUI EST PROUVE ICI : LE REGISTRAIRE N'EST PAS APPELE.
//
// `checkDomain` est un espion. Toute admission refusee -- verrou occupe,
// verrou en panne, quota de compte epuise, compteur en panne -- doit le
// laisser a zero appel. Un test qui se contenterait du code de statut ne
// prouverait rien : c'est l'appel externe qui est l'enjeu.
//
// Le harnais honore la projection et capture les filtres (lib/testing/
// postgrest) : neutraliser le perimetre par compte devient observable.
// ============================================================

const checkDomainMock = vi.fn();
const getReqMock = vi.fn();
const getUserMock = vi.fn();
let tables: Record<string, TableStub>;
let journal: JournalPostgrest;

vi.mock('@/lib/domains/porkbun', () => ({
  checkDomain: (...a: unknown[]) => checkDomainMock(...a),
  getRegistrationRequirements: (...a: unknown[]) => getReqMock(...a),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (t: string) => creerFrom(tables, journal)(t) },
}));
const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({ logAnomaly: (...a: unknown[]) => logAnomalyMock(...a) }));

import { POST } from '../route';

const req = (body: unknown = { domain: 'exemple-libre.com' }, headers: Record<string, string> = { authorization: 'Bearer jeton' }) =>
  new NextRequest('https://woorri.test/api/domains/search', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

const VERROU_LIBRE = { data: { value: { at: Date.now() - 3_600_000 } }, error: null };

beforeEach(() => {
  journal = journalVierge();
  tables = {
    site_domains: { reponse: { data: null, error: null } },
    cron_state: { reponse: VERROU_LIBRE },
    checkout_anomalies: { reponse: { count: 0, error: null } as never },
  };
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.c' } }, error: null });
  checkDomainMock.mockReset().mockResolvedValue({ available: true, registrationCents: 1200, sellRenewalUsd: 25 });
  getReqMock.mockReset().mockResolvedValue({ apiRegisterable: true, registrationDurationYears: 1 });
  logAnomalyMock.mockReset().mockResolvedValue(undefined);
});

describe('D-04 — verrou disponible', () => {
  it('recherche légitime -> 200, le registraire est interrogé UNE fois', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(checkDomainMock).toHaveBeenCalledTimes(1);
    expect(checkDomainMock).toHaveBeenCalledWith('exemple-libre.com');
  });

  it('un appel admis CONSOMME un jeton sur CE compte', async () => {
    await POST(req());
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'domain_search_request', severity: 'info', details: { user_id: 'user-1' } })
    );
  });
});

describe('D-04 — verrou déjà détenu', () => {
  it('un appel il y a 2 s -> 429 avec le délai restant, AUCUN appel registraire', async () => {
    tables.cron_state = { reponse: { data: { value: { at: Date.now() - 2_000 } }, error: null } };
    const res = await POST(req());
    const j = await res.json();
    expect(res.status).toBe(429);
    expect(j.retryAfterMs).toBeGreaterThan(0);
    expect(j.retryAfterMs).toBeLessThanOrEqual(10_000);
    expect(checkDomainMock).not.toHaveBeenCalled();
  });

  it('un refus par le verrou global ne consomme AUCUN jeton de compte', async () => {
    tables.cron_state = { reponse: { data: { value: { at: Date.now() - 1_000 } }, error: null } };
    await POST(req());
    expect(logAnomalyMock).not.toHaveBeenCalled();
  });
});

describe('D-04 — LE POINT CENTRAL : la panne FERME', () => {
  it('lecture du verrou EN ERREUR -> 503, AUCUN appel registraire', async () => {
    // C'EST LA REGRESSION QUE CE TEST EXISTE POUR EMPECHER. `error` n'etait
    // pas lu : `data` valait null, `last` valait 0, l'ecart depuis 1970
    // depassait toujours le seuil, et le verrou s'ouvrait EN PANNE.
    tables.cron_state = { reponse: { data: null, error: { message: 'db down' } } };
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(checkDomainMock).not.toHaveBeenCalled();
  });

  it('compteur de quota EN PANNE -> 503, AUCUN appel registraire', async () => {
    tables.checkout_anomalies = { reponse: { count: null, error: { message: 'db down' } } as never };
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(checkDomainMock).not.toHaveBeenCalled();
  });

  it('verrou JAMAIS initialisé (aucune ligne) -> autorisé, c’est le cas nominal', async () => {
    tables.cron_state = { reponse: { data: null, error: null } };
    const res = await POST(req());
    expect(res.status).toBe(200);
  });
});

describe('D-04 — quota par compte', () => {
  it('plafond atteint -> 429, AUCUN appel registraire', async () => {
    tables.checkout_anomalies = { reponse: { count: 10, error: null } as never };
    const res = await POST(req());
    expect(res.status).toBe(429);
    expect(checkDomainMock).not.toHaveBeenCalled();
  });

  it('le quota porte sur CE COMPTE — sinon un abuseur affame tout le parc', async () => {
    await POST(req());
    expect(journal.filtres.checkout_anomalies).toContainEqual(['eq', 'details->>user_id', 'user-1']);
    expect(journal.filtres.checkout_anomalies).toContainEqual(['eq', 'type', 'domain_search_request']);
  });

  it('deux comptes distincts ne partagent PAS le même quota', async () => {
    await POST(req());
    const premier = journal.filtres.checkout_anomalies.find(([o, c]) => o === 'eq' && c === 'details->>user_id')![2];
    journal = journalVierge();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-2', email: 'x@y.z' } }, error: null });
    await POST(req());
    const second = journal.filtres.checkout_anomalies.find(([o, c]) => o === 'eq' && c === 'details->>user_id')![2];
    expect(premier).toBe('user-1');
    expect(second).toBe('user-2');
  });
});

describe('D-04 — admission préalable', () => {
  it('aucun jeton -> 401, AUCUN appel registraire', async () => {
    const res = await POST(req({ domain: 'x.com' }, {}));
    expect(res.status).toBe(401);
    expect(checkDomainMock).not.toHaveBeenCalled();
  });

  it('jeton refusé -> 401, AUCUN appel registraire', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(checkDomainMock).not.toHaveBeenCalled();
  });

  it('domaine malformé -> 400, AUCUN appel registraire', async () => {
    const res = await POST(req({ domain: 'pas-un-domaine' }));
    expect(res.status).toBe(400);
    expect(checkDomainMock).not.toHaveBeenCalled();
  });

  it('domaine déjà réservé -> réponse immédiate, AUCUN appel registraire', async () => {
    tables.site_domains = { reponse: { data: { id: 'd-1' }, error: null } };
    const res = await POST(req());
    const j = await res.json();
    expect(j.available).toBe(false);
    expect(j.reason).toBe('deja_reserve');
    expect(checkDomainMock).not.toHaveBeenCalled();
  });
});

describe('D-04 — marquage du verrou', () => {
  it('un appel admis MARQUE le verrou pour les suivants', async () => {
    await POST(req());
    expect(journal.ecritures.cron_state?.length).toBeGreaterThan(0);
  });

  it('une panne du registraire marque quand même le verrou (la tentative compte)', async () => {
    checkDomainMock.mockRejectedValue(new Error('registrar down'));
    const res = await POST(req());
    expect(res.status).toBe(502);
    expect(journal.ecritures.cron_state?.length).toBeGreaterThan(0);
  });
});
