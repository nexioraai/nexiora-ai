import { describe, it, expect, vi, beforeEach } from 'vitest';
import { creerFrom, journalVierge, type JournalPostgrest, type TableStub } from '@/lib/testing/postgrest';

// ============================================================
// D-06 -- UN SITE ARCHIVE NE DOIT RIEN LAISSER DERRIERE LUI.
//
// L'archivage ne touchait aucun domaine. Deux consequences mesurees :
//   * le rattachement restait actif chez l'hebergeur, pour un site que la vue
//     publique refuse desormais de servir ;
//   * le domaine restait vu par les deux controles d'unicite, donc
//     IRREVENDICABLE par quiconque, y compris par son proprietaire.
//
// CE QUI EST PROUVE ICI : le detachement a REELLEMENT lieu, il vient APRES
// l'archivage, son echec ne fait jamais echouer l'archivage, et un domaine
// ACHETE n'est jamais retire de l'hebergeur.
// ============================================================

const getUserMock = vi.fn();
const rpcMock = vi.fn();
const removeMock = vi.fn();
const logAnomalyMock = vi.fn();
let tables: Record<string, TableStub>;
let journal: JournalPostgrest;
const ordre: string[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (t: string) => creerFrom(tables, journal)(t),
    rpc: (...a: unknown[]) => { ordre.push('archive'); return rpcMock(...a); },
  },
}));
vi.mock('@/lib/domains/vercel', () => ({
  removeDomainFromVercel: (...a: unknown[]) => { ordre.push('detach'); return removeMock(...a); },
}));
vi.mock('@/lib/anomaly', () => ({ logAnomaly: (...a: unknown[]) => logAnomalyMock(...a) }));

import { POST } from '../route';

const SITE = {
  id: 'site-1',
  owner_id: 'user-1',
  owner_email: 'owner@test.com',
  slug: 'boutique',
  custom_domain: 'client.com',
};

const req = (h: Record<string, string> = { authorization: 'Bearer jeton' }) =>
  new Request('https://deribfy.test/api/sites/boutique/archive', { method: 'POST', headers: h });
const params = Promise.resolve({ slug: 'boutique' });

beforeEach(() => {
  journal = journalVierge();
  ordre.length = 0;
  tables = {
    sites: { reponse: { data: SITE, error: null } },
    site_domains: { reponse: { data: null, error: null } },
  };
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'user-1', email: 'owner@test.com' } }, error: null });
  rpcMock.mockReset().mockResolvedValue({ data: [{ all_archived: true }], error: null });
  removeMock.mockReset().mockResolvedValue({ ok: true, dejaAbsent: false });
  logAnomalyMock.mockReset().mockResolvedValue(undefined);
});

describe('D-06 — le domaine est détaché à l’archivage', () => {
  it('site BYOD -> archivé ET détaché de l’hébergeur', async () => {
    const res = await POST(req(), { params });
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.success).toBe(true);
    expect(j.domaineDetache).toBe(true);
    expect(removeMock).toHaveBeenCalledWith('client.com');
  });

  it('le pointeur `custom_domain` est effacé, ainsi que l’état de vérification', async () => {
    await POST(req(), { params });
    const ecritures = journal.ecritures.sites ?? [];
    const charge = (ecritures[0] as { charge?: Record<string, unknown> })?.charge;
    expect(charge?.custom_domain).toBeNull();
    expect(charge?.custom_domain_google_token).toBeNull();
  });

  it('L’ORDRE COMPTE : le détachement vient APRÈS l’archivage', async () => {
    await POST(req(), { params });
    expect(ordre).toEqual(['archive', 'detach']);
  });

  it('site SANS domaine -> archivé sans rien tenter', async () => {
    tables.sites = { reponse: { data: { ...SITE, custom_domain: null }, error: null } };
    const j = await (await POST(req(), { params })).json();
    expect(j.success).toBe(true);
    expect(j.domaineDetache).toBe(false);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('`custom_domain` est RÉELLEMENT projeté — sinon le détachement est aveugle', async () => {
    await POST(req(), { params });
    expect(journal.projections.sites).toContain('custom_domain');
  });
});

describe('D-06 — un domaine ACHETÉ n’est jamais retiré de l’hébergeur', () => {
  it('le pointeur est détaché mais l’hébergeur est laissé intact', async () => {
    // Deribfy n'a aucun pouvoir d'annuler un enregistrement paye : le retirer
    // couperait un domaine encore facture.
    tables.site_domains = { reponse: { data: { id: 'd1', status: 'sitemap_submitted' }, error: null } };
    const j = await (await POST(req(), { params })).json();
    expect(j.domaineDetache).toBe(true);
    expect(removeMock).not.toHaveBeenCalled();
  });
});

describe('D-06 — l’échec du détachement ne fait JAMAIS échouer l’archivage', () => {
  it('hébergeur indisponible -> archivage réussi, résidu signalé', async () => {
    removeMock.mockRejectedValue(new Error('hote indisponible'));
    const res = await POST(req(), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'domain_detach_host_failed' })
    );
  });

  it('lecture de l’achat en panne -> archivage réussi, anomalie signalée', async () => {
    tables.site_domains = { reponse: { data: null, error: { message: 'db down' } } };
    const res = await POST(req(), { params });
    expect(res.status).toBe(200);
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'domain_detach_on_archive_failed' })
    );
  });
});

describe('D-06 — un archivage REFUSÉ ne touche jamais le domaine', () => {
  it('commandes bloquantes -> 409, AUCUN détachement', async () => {
    rpcMock.mockResolvedValue({ data: [{ all_archived: false, blocking_statuses: ['paid'] }], error: null });
    const res = await POST(req(), { params });
    expect(res.status).toBe(409);
    expect(removeMock).not.toHaveBeenCalled();
    expect(journal.ecritures.sites ?? []).toHaveLength(0);
  });

  it('erreur de l’archivage -> 500, AUCUN détachement', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'rpc down' } });
    const res = await POST(req(), { params });
    expect(res.status).toBe(500);
    expect(removeMock).not.toHaveBeenCalled();
  });
});

describe('D-06 — idempotence et propriété', () => {
  it('archivage rejoué sur un site déjà sans domaine -> ni erreur ni faux succès', async () => {
    tables.sites = { reponse: { data: { ...SITE, custom_domain: null }, error: null } };
    const a = await (await POST(req(), { params })).json();
    const b = await (await POST(req(), { params })).json();
    expect(a).toEqual(b);
    expect(a.domaineDetache).toBe(false);
  });

  it('aucun jeton -> 401, AUCUN archivage, AUCUN détachement', async () => {
    const res = await POST(req({}), { params });
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('site d’un AUTRE compte -> refusé, AUCUN détachement', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'intrus', email: 'intrus@x.com' } }, error: null });
    const res = await POST(req(), { params });
    expect([401, 403, 404]).toContain(res.status);
    expect(removeMock).not.toHaveBeenCalled();
  });
});
