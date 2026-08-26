import { describe, it, expect, vi, beforeEach } from 'vitest';
import { creerFrom, journalVierge, type JournalPostgrest, type TableStub } from '@/lib/testing/postgrest';
import { NextRequest } from 'next/server';

// ============================================================
// D-02 -- LA VERIFICATION BYOD NE SE DECLENCHAIT JAMAIS.
//
// `verifyVercelDomain` n'existait que dans le parcours d'achat. Un client
// BYOD qui posait correctement son DNS pouvait rester bloque indefiniment :
// rien ne demandait jamais a l'hebergeur de relire la zone.
//
// CE QUI EST PROUVE ICI : `POST` declenche REELLEMENT la re-verification,
// `GET` ne la declenche JAMAIS, et la propriete garde les deux verbes.
// ============================================================

const verifyMock = vi.fn();
const statusMock = vi.fn();
const getUserMock = vi.fn();
let tables: Record<string, TableStub>;
let journal: JournalPostgrest;

vi.mock('@/lib/domains/vercel', () => ({
  verifyVercelDomain: (...a: unknown[]) => verifyMock(...a),
  getVercelDomainStatus: (...a: unknown[]) => statusMock(...a),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (t: string) => creerFrom(tables, journal)(t) },
}));
const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({ logAnomaly: (...a: unknown[]) => logAnomalyMock(...a) }));

import { GET, POST } from '../route';

const SITE = {
  id: 'site-1',
  slug: 'boutique',
  owner_id: 'user-1',
  owner_email: 'owner@test.com',
  custom_domain: 'client.com',
  custom_domain_google_status: null,
  custom_domain_google_token: null,
  custom_domain_google_attempts: null,
  custom_domain_google_last_attempt_at: null,
  custom_domain_google_last_error: null,
};

const url = (slug?: string) => {
  const u = new URL('https://deribfy.test/api/domains/status');
  if (slug) u.searchParams.set('slug', slug);
  return u;
};
const reqGet = (slug = 'boutique', h: Record<string, string> = { authorization: 'Bearer jeton' }) =>
  new NextRequest(url(slug), { headers: h });
// `undefined` declencherait la valeur par defaut de JavaScript : le cas
// « slug absent » serait alors teste avec un slug present. Sentinelle
// explicite plutot que valeur par defaut.
const SANS_SLUG = Symbol('sans-slug');
const reqPost = (
  slug: string | typeof SANS_SLUG = 'boutique',
  h: Record<string, string> = { authorization: 'Bearer jeton' }
) => new NextRequest(url(slug === SANS_SLUG ? undefined : slug), { method: 'POST', headers: h });

beforeEach(() => {
  journal = journalVierge();
  tables = {
    sites: { reponse: { data: SITE, error: null } },
    site_domains: { reponse: { data: null, error: null } },
    checkout_anomalies: { reponse: { count: 0, error: null } as never },
  };
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'user-1', email: 'owner@test.com' } }, error: null });
  verifyMock.mockReset().mockResolvedValue(true);
  statusMock.mockReset().mockResolvedValue({ attached: true, verified: false, verification: [] });
  logAnomalyMock.mockReset().mockResolvedValue(undefined);
});

describe('D-02 — GET reste une LECTURE PURE', () => {
  it('GET ne déclenche JAMAIS de re-vérification', async () => {
    const res = await GET(reqGet());
    expect(res.status).toBe(200);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('GET rend bien l’état du domaine', async () => {
    const j = await (await GET(reqGet())).json();
    expect(j.customDomain).toBe('client.com');
    expect(j.byodVerification).toEqual({ attached: true, verified: false });
  });
});

describe('D-02 — POST déclenche RÉELLEMENT la vérification', () => {
  it('un clic sur « Vérifier » appelle l’hébergeur pour CE domaine', async () => {
    const res = await POST(reqPost());
    expect(res.status).toBe(200);
    expect(verifyMock).toHaveBeenCalledTimes(1);
    expect(verifyMock).toHaveBeenCalledWith('client.com');
  });

  it('domaine déjà valide -> `verifie: true`, et l’état complet est rendu', async () => {
    verifyMock.mockResolvedValue(true);
    statusMock.mockResolvedValue({ attached: true, verified: true, verification: [] });
    const j = await (await POST(reqPost())).json();
    expect(j.verifie).toBe(true);
    expect(j.byodVerification.verified).toBe(true);
    expect(j.customDomain).toBe('client.com');
  });

  it('DNS pas encore propagé -> `verifie: false`, JAMAIS une erreur', async () => {
    verifyMock.mockResolvedValue(false);
    const res = await POST(reqPost());
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.verifie).toBe(false);
  });

  it('erreur EXTERNE -> 200 avec l’erreur exposée, jamais un 500 opaque', async () => {
    // Un client doit voir « l'hebergeur n'a pas repondu », pas une page cassee.
    verifyMock.mockRejectedValue(new Error('hote indisponible'));
    const res = await POST(reqPost());
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.verifie).toBe(false);
    expect(j.erreurExterne).toContain('hote indisponible');
  });

  it('aucun domaine connecté -> 400, AUCUN appel externe', async () => {
    tables.sites = { reponse: { data: { ...SITE, custom_domain: null }, error: null } };
    const res = await POST(reqPost());
    expect(res.status).toBe(400);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('slug manquant -> 400, AUCUN appel externe', async () => {
    const res = await POST(reqPost(SANS_SLUG));
    expect(res.status).toBe(400);
    expect(verifyMock).not.toHaveBeenCalled();
  });
});

describe('D-02 — le bouton ne peut pas devenir une boucle', () => {
  it('plafond atteint -> 429, AUCUN appel externe', async () => {
    tables.checkout_anomalies = { reponse: { count: 6, error: null } as never };
    const res = await POST(reqPost());
    expect(res.status).toBe(429);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('compteur EN PANNE -> 503, AUCUN appel externe (jamais fail-open)', async () => {
    tables.checkout_anomalies = { reponse: { count: null, error: { message: 'db down' } } as never };
    const res = await POST(reqPost());
    expect(res.status).toBe(503);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('la borne porte sur CE site', async () => {
    await POST(reqPost());
    expect(journal.filtres.checkout_anomalies).toContainEqual(['eq', 'site_id', 'site-1']);
    expect(journal.filtres.checkout_anomalies).toContainEqual(['eq', 'type', 'domain_verify_request']);
  });
});

describe('D-02 — la propriété garde les deux verbes', () => {
  it('aucun jeton -> 401 sur POST, AUCUN appel externe', async () => {
    const res = await POST(reqPost('boutique', {}));
    expect(res.status).toBe(401);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('jeton refusé -> 401 sur POST', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });
    const res = await POST(reqPost());
    expect(res.status).toBe(401);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('site d’un AUTRE compte -> refusé, AUCUN appel externe', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'intrus', email: 'intrus@x.com' } }, error: null });
    const res = await POST(reqPost());
    expect([401, 403, 404]).toContain(res.status);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('les DEUX verbes projettent les mêmes colonnes — sinon l’état Google devient aveugle', async () => {
    await GET(reqGet());
    const projGet = journal.projections.sites;
    journal = journalVierge();
    await POST(reqPost());
    expect(journal.projections.sites).toBe(projGet);
    expect(projGet).toContain('custom_domain_google_status');
  });
});
