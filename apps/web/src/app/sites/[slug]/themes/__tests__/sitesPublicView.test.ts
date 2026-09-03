import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit Mode 3/POD BRAND, LOT 1 -- fetchSite/fetchSiteByDomain/
// fetchSiteBrandByDomain interrogeaient directement `sites` avec le client
// anon : RLS protégeait les LIGNES (published=true OR owner_id=auth.uid())
// mais aucune restriction de colonne n'existait -- select=* direct exposait
// owner_email/stripe_customer_id/payment_account_id/owner_id à quiconque
// pour un site publié. Corrigé via la vue `sites_public` (colonnes
// PUBLIC_COLS uniquement, published=true AND archived_at IS NULL déjà
// appliqués par la vue). Ces tests verrouillent la bonne table interrogée
// et l'absence de régression sur le pricing POD Brand (cj_margin_percent/
// cj_round_mode/pod_designs doivent rester présents -- décision explicite
// de ne PAS les retirer, démontrée non régressive dans l'audit).

const fromCalls: string[] = [];
function makeQueryBuilder(resolveValue: { data: any; error: any }) {
  const b: any = {};
  const self = () => b;
  b.select = self;
  b.eq = self;
  b.order = () => Promise.resolve(resolveValue); // shop_products/site_catalog_selections : résolu directement après .order()
  b.single = async () => resolveValue;
  b.maybeSingle = async () => resolveValue;
  return b;
}

let siteResult: { data: any; error: any };
let shopProductsResult: { data: any; error: any };
let catalogSelectionsResult: { data: any; error: any };

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      fromCalls.push(table);
      if (table === 'sites_public') return makeQueryBuilder(siteResult);
      if (table === 'shop_products') return makeQueryBuilder(shopProductsResult);
      if (table === 'site_catalog_selections') return makeQueryBuilder(catalogSelectionsResult);
      if (table === 'sites') return makeQueryBuilder(siteResult); // fetchSitePreview, ne doit JAMAIS être appelé ici
      throw new Error('unexpected table: ' + table);
    },
  },
}));

const SITE_ROW = {
  id: 'site-1',
  slug: 'my-pod-brand-shop',
  name: 'My POD Shop',
  mode: 3,
  dropship_type: 'pod_brand',
  cj_margin_percent: 40,
  cj_round_mode: 'up',
  pod_designs: [{ url: 'https://x.test/design.png', mockups: [{ product_id: 1, variant_id: 2, mockup_url: 'https://x.test/mockup.png', price: 10, currency: 'USD' }] }],
  custom_domain: null,
  published: true,
  archived_at: null,
};

beforeEach(() => {
  fromCalls.length = 0;
  siteResult = { data: { ...SITE_ROW }, error: null };
  shopProductsResult = { data: [], error: null };
  catalogSelectionsResult = { data: [], error: null };
});

describe('fetchSite — interroge sites_public, pas sites directement', () => {
  it("appelle .from('sites_public'), jamais .from('sites')", async () => {
    const { fetchSite } = await import('../shared');
    await fetchSite('my-pod-brand-shop');
    expect(fromCalls).toContain('sites_public');
    expect(fromCalls).not.toContain('sites');
  });

  it('préserve cj_margin_percent, cj_round_mode et pod_designs sur l\'objet retourné -- non régression pricing POD Brand', async () => {
    const { fetchSite } = await import('../shared');
    const site = await fetchSite('my-pod-brand-shop');
    expect(site).not.toBeNull();
    expect(site!.cj_margin_percent).toBe(40);
    expect((site as any).cj_round_mode).toBe('up');
    expect((site as any).pod_designs).toEqual(SITE_ROW.pod_designs);
  });

  it('site introuvable via la vue (non publié ou archivé) -> null, comportement inchangé', async () => {
    siteResult = { data: null, error: { message: 'no rows' } };
    const { fetchSite } = await import('../shared');
    const site = await fetchSite('unknown-or-unpublished');
    expect(site).toBeNull();
  });
});

describe('fetchSiteByDomain — interroge sites_public', () => {
  it("appelle .from('sites_public'), résout le slug pour un domaine publié", async () => {
    siteResult = { data: { slug: 'my-pod-brand-shop' }, error: null };
    const { fetchSiteByDomain } = await import('../shared');
    const slug = await fetchSiteByDomain('mycustomdomain.com');
    expect(fromCalls).toContain('sites_public');
    expect(slug).toBe('my-pod-brand-shop');
  });

  it('domaine ne correspondant à aucun site publié -> null', async () => {
    siteResult = { data: null, error: { message: 'no rows' } };
    const { fetchSiteByDomain } = await import('../shared');
    const slug = await fetchSiteByDomain('inconnu.com');
    expect(slug).toBeNull();
  });
});

describe('fetchSiteBrandByDomain — interroge sites_public, jamais owner_email/id', () => {
  it("appelle .from('sites_public')", async () => {
    siteResult = { data: { slug: 'my-shop', name: 'My Shop', primary_color: '#111', theme: 'editorial', lang: 'fr' }, error: null };
    const { fetchSiteBrandByDomain } = await import('../shared');
    const brand = await fetchSiteBrandByDomain('mycustomdomain.com');
    expect(fromCalls).toContain('sites_public');
    expect(brand).toEqual({ slug: 'my-shop', name: 'My Shop', primaryColor: '#111', theme: 'editorial', lang: 'fr' });
  });
});

describe('fetchSitePreview — reste sur la table de base `sites` (propriétaire, protégé par RLS resserrée)', () => {
  it("continue d'appeler .from('sites'), PAS sites_public -- régression volontairement vérifiée", async () => {
    siteResult = { data: { ...SITE_ROW, owner_email: 'owner@test.com' }, error: null };
    const { fetchSitePreview } = await import('../shared');
    await fetchSitePreview('my-pod-brand-shop', 'owner@test.com');
    expect(fromCalls).toContain('sites');
  });
});
