import { describe, it, expect, vi, beforeEach } from 'vitest';
import { creerFrom, journalVierge, type JournalPostgrest, type TableStub } from '@/lib/testing/postgrest';
import { NextRequest } from 'next/server';

// ============================================================
// P2 -- « DETACHER » ET « RESILIER » SONT DEUX ROUTES DISTINCTES.
//
// Les confondre serait le defaut le plus couteux possible : un marchand qui
// veut retirer son domaine d'un site perdrait le domaine lui-meme.
// ============================================================

const updateAutoRenewMock = vi.fn();
const getUserMock = vi.fn();
let tables: Record<string, TableStub>;
let journal: JournalPostgrest;

vi.mock('@/lib/domains/porkbun', () => ({ updateAutoRenew: (...a: unknown[]) => updateAutoRenewMock(...a) }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } } }));
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: (t: string) => creerFrom(tables, journal)(t) } }));
vi.mock('@/lib/anomaly', () => ({ logAnomaly: vi.fn() }));

import { POST } from '../route';

const SITE = { id: 'site-1', slug: 'boutique', owner_id: 'user-1', owner_email: 'o@t.com', custom_domain: 'client.com' };
const LIGNE = { id: 'dom-1', status: 'sitemap_submitted', auto_renew: true, renews_at: '2027-07-23T00:00:00.000Z', renewal_sync_error: null };

const SANS_SLUG = Symbol('sans');
const req = (slug: string | typeof SANS_SLUG = 'boutique', h: Record<string, string> = { authorization: 'Bearer jeton' }) => {
  const u = new URL('https://deribfy.test/api/domains/renewal');
  if (slug !== SANS_SLUG) u.searchParams.set('slug', slug);
  return new NextRequest(u, { method: 'POST', headers: h });
};

beforeEach(() => {
  journal = journalVierge();
  tables = {
    sites: { reponse: { data: SITE, error: null } },
    site_domains: { reponse: { data: LIGNE, error: null } },
    site_domain_events: { reponse: { data: null, error: null } },
  };
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'user-1', email: 'o@t.com' } }, error: null });
  updateAutoRenewMock.mockReset().mockResolvedValue({ ok: true });
});

describe('P2 — résilier est une opération distincte', () => {
  it('résiliation légitime -> 200 et le registraire est appelé', async () => {
    const res = await POST(req());
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.ok).toBe(true);
    expect(updateAutoRenewMock).toHaveBeenCalledWith('client.com', false);
  });

  it('la réponse ne promet JAMAIS une suppression — seulement un arrêt de renouvellement', async () => {
    // L'API du registraire n'a aucun endpoint de suppression. Promettre une
    // suppression serait une affirmation invérifiable.
    const j = await (await POST(req())).json();
    expect(j.message).toMatch(/renouvellement/i);
    expect(j.message.toLowerCase()).not.toMatch(/supprim|efface|detruit/);
    expect(j.expireLe).toBe('2027-07-23T00:00:00.000Z');
  });

  it('le domaine n’est JAMAIS fourni par l’appelant — il vient du site possédé', async () => {
    // Accepter un identifiant de domaine du client serait une voie directe
    // vers la resiliation du domaine d'autrui.
    await POST(req());
    expect(journal.filtres.site_domains).toContainEqual(['eq', 'site_id', 'site-1']);
    expect(journal.filtres.site_domains).toContainEqual(['eq', 'domain', 'client.com']);
  });
});

describe('P2 — aucun faux succès côté interface', () => {
  it('échec du registraire -> 502, jamais 200', async () => {
    updateAutoRenewMock.mockRejectedValue(new Error('registraire indisponible'));
    const res = await POST(req());
    expect(res.status).toBe(502);
    expect((await res.json()).raison).toBe('registraire');
  });

  it('aucun domaine acheté -> 404, AUCUN appel registraire', async () => {
    tables.site_domains = { reponse: { data: null, error: null } };
    const res = await POST(req());
    expect(res.status).toBe(404);
    expect(updateAutoRenewMock).not.toHaveBeenCalled();
  });

  it('aucun domaine connecté au site -> 400, AUCUN appel registraire', async () => {
    tables.sites = { reponse: { data: { ...SITE, custom_domain: null }, error: null } };
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(updateAutoRenewMock).not.toHaveBeenCalled();
  });
});

describe('P2 — propriété', () => {
  it('aucun jeton -> 401, AUCUN appel registraire', async () => {
    const res = await POST(req('boutique', {}));
    expect(res.status).toBe(401);
    expect(updateAutoRenewMock).not.toHaveBeenCalled();
  });

  it('site d’un AUTRE compte -> refusé, AUCUN appel registraire', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'intrus', email: 'i@x.com' } }, error: null });
    const res = await POST(req());
    expect([401, 403, 404]).toContain(res.status);
    expect(updateAutoRenewMock).not.toHaveBeenCalled();
  });

  it('slug manquant -> 400', async () => {
    expect((await POST(req(SANS_SLUG))).status).toBe(400);
  });
});

describe('P2 — idempotence côté route', () => {
  it('déjà résilié -> 200 avec `dejaResilie`, AUCUN appel registraire', async () => {
    tables.site_domains = { reponse: { data: { ...LIGNE, auto_renew: false }, error: null } };
    const j = await (await POST(req())).json();
    expect(j).toMatchObject({ ok: true, dejaResilie: true });
    expect(updateAutoRenewMock).not.toHaveBeenCalled();
  });

  it('double soumission -> même réponse, un seul effet', async () => {
    await POST(req());
    tables.site_domains = { reponse: { data: { ...LIGNE, auto_renew: false }, error: null } };
    updateAutoRenewMock.mockClear();
    const j = await (await POST(req())).json();
    expect(j.dejaResilie).toBe(true);
    expect(updateAutoRenewMock).not.toHaveBeenCalled();
  });
});
