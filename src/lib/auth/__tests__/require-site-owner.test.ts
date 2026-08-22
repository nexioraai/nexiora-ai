import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit Mode 3/POD BRAND, lot mockups : requireSiteOwner() est le garde-fou
// central déjà réutilisé par catalog/enhance, catalog/curate, et désormais
// generate-mockups -- jamais testé isolément avant ce lot malgré son rôle
// de sécurité transversal (bloquer une action facturée/écrite sur la
// boutique de quelqu'un d'autre).

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

const siteSelectMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      const c: any = {};
      c.select = () => c;
      c.eq = () => c;
      c.maybeSingle = async () => siteSelectMock();
      return c;
    }),
  },
}));

import { requireSiteOwner } from '../require-site-owner';

function req(token?: string) {
  return new Request('https://x.test/api/whatever', {
    headers: token ? { authorization: 'Bearer ' + token } : {},
  });
}

beforeEach(() => {
  getUserMock.mockReset();
  siteSelectMock.mockReset();
});

describe('requireSiteOwner', () => {
  it('aucun token -> 401, aucune lecture de site tentée', async () => {
    const result = await requireSiteOwner(req(), 'shop-a');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(siteSelectMock).not.toHaveBeenCalled();
  });

  it('token invalide (auth.getUser échoue) -> 401', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
    const result = await requireSiteOwner(req('bad-token'), 'shop-a');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("site introuvable -> 404", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@test.com' } }, error: null });
    siteSelectMock.mockResolvedValue({ data: null, error: null });
    const result = await requireSiteOwner(req('good-token'), 'unknown-shop');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
  });

  it("utilisateur authentifié mais PAS propriétaire de ce site (owner_id différent) -> 403, l'action ne doit jamais s'exécuter sur la boutique d'un autre", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'attacker-id', email: 'attacker@test.com' } }, error: null });
    siteSelectMock.mockResolvedValue({ data: { id: 'site-b', owner_id: 'real-owner-id' }, error: null });
    const result = await requireSiteOwner(req('attacker-token'), 'shop-b');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('utilisateur authentifié ET propriétaire réel -> autorisé, renvoie le site', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'owner-id', email: 'owner@test.com' } }, error: null });
    siteSelectMock.mockResolvedValue({ data: { id: 'site-a', owner_id: 'owner-id' }, error: null });
    const result = await requireSiteOwner(req('owner-token'), 'shop-a');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.site.id).toBe('site-a');
      expect(result.email).toBe('owner@test.com');
    }
  });

  // Audit Mode 3/POD BRAND, perfectionnement -- cause racine : owner_id
  // (supabase/sql/sites_owner_id_step1_add_column.sql) est additive SANS
  // backfill pour les sites reels preexistants (aucune migration "step2"
  // dans ce repo). Comparer uniquement owner_id aurait renvoye 403 a TOUT
  // proprietaire legitime d'un site preexistant sur generate-mockups,
  // catalog/curate, catalog/enhance, catalog/selections, sites/[slug]/archive,
  // stripe/portal -- une regression fonctionnelle reelle sur le coeur de
  // POD BRAND, jamais couverte par les 5 tests ci-dessus (qui supposent
  // tous owner_id deja renseigne).
  it("site preexistant (owner_id NULL, jamais backfille) + owner_email correspondant -> autorise via le repli", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'real-owner-id', email: 'owner@test.com' } }, error: null });
    siteSelectMock.mockResolvedValue({ data: { id: 'site-legacy', owner_id: null, owner_email: 'owner@test.com' }, error: null });
    const result = await requireSiteOwner(req('owner-token'), 'shop-legacy');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.site.id).toBe('site-legacy');
  });

  it("site preexistant (owner_id NULL) + owner_email different -> 403, le repli ne doit jamais autoriser un tiers", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'attacker-id', email: 'attacker@test.com' } }, error: null });
    siteSelectMock.mockResolvedValue({ data: { id: 'site-legacy', owner_id: null, owner_email: 'real-owner@test.com' }, error: null });
    const result = await requireSiteOwner(req('attacker-token'), 'shop-legacy');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("site deja migre (owner_id renseigne) MAIS different de l'utilisateur -> 403 meme si owner_email correspondrait par coincidence (owner_id prioritaire, jamais de repli une fois renseigne)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'other-id', email: 'shared@test.com' } }, error: null });
    siteSelectMock.mockResolvedValue({ data: { id: 'site-b', owner_id: 'real-owner-id', owner_email: 'shared@test.com' }, error: null });
    const result = await requireSiteOwner(req('other-token'), 'shop-b');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });
});
