import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit Mode 3/POD BRAND, LOT 1 -- sitemap.ts interrogeait `sites`
// directement pour la liste des sites publiés (colonnes sensibles
// exposables via select=*), ET utilisait un embed PostgREST
// `sites!inner(slug, published)` sur shop_products/site_catalog_selections
// -- cet embed aurait échoué silencieusement une fois la RLS de `sites`
// resserrée (SELECT réservé au propriétaire), faisant disparaître les
// routes produits du sitemap sans aucune erreur visible. Corrigé par une
// résolution via sites_public (expose `id`) + filtrage applicatif, sans
// dépendre du comportement d'embedding de PostgREST au travers d'une vue.

const fromCalls: string[] = [];
let sitesPublicResult: { data: any; error: any };
let blogPostsResult: { data: any; error: any };
let shopProductsResult: { data: any; error: any };
let catalogSelsResult: { data: any; error: any };

function chain(resolveValue: { data: any; error: any }) {
  const b: any = {};
  b.select = () => b;
  b.eq = () => b;
  b.then = (resolve: any) => resolve(resolveValue);
  return b;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      fromCalls.push(table);
      if (table === 'sites_public') return chain(sitesPublicResult);
      if (table === 'blog_posts') return chain(blogPostsResult);
      if (table === 'shop_products') return chain(shopProductsResult);
      if (table === 'site_catalog_selections') return chain(catalogSelsResult);
      if (table === 'sites') return chain(sitesPublicResult); // ne doit jamais être appelé
      throw new Error('unexpected table: ' + table);
    },
  },
}));

beforeEach(() => {
  fromCalls.length = 0;
  sitesPublicResult = { data: [{ id: 'site-1', slug: 'my-shop', created_at: '2026-01-01T00:00:00Z' }], error: null };
  blogPostsResult = { data: [], error: null };
  shopProductsResult = { data: [], error: null };
  catalogSelsResult = { data: [], error: null };
});

describe('sitemap — interroge sites_public, pas sites directement', () => {
  it("appelle .from('sites_public'), jamais .from('sites')", async () => {
    const mod = await import('../sitemap');
    await mod.default();
    expect(fromCalls).toContain('sites_public');
    expect(fromCalls).not.toContain('sites');
  });

  it('inclut bien le site publié dans les routes générées', async () => {
    const mod = await import('../sitemap');
    const routes = await mod.default();
    expect(routes.some((r: any) => r.url.includes('/sites/my-shop'))).toBe(true);
  });

  it("un produit shop_products d'un site publié apparaît (résolution via idToSlug, pas via embed sites!inner)", async () => {
    shopProductsResult = { data: [{ id: 'prod-1', created_at: '2026-01-02T00:00:00Z', site_id: 'site-1' }], error: null };
    const mod = await import('../sitemap');
    const routes = await mod.default();
    expect(routes.some((r: any) => r.url.includes('/sites/my-shop/produits/prod-1'))).toBe(true);
  });

  it("un produit dont le site_id ne correspond à AUCUN site publié est exclu (site non publié/archivé, filtré applicativement)", async () => {
    shopProductsResult = { data: [{ id: 'prod-orphan', created_at: '2026-01-02T00:00:00Z', site_id: 'site-not-public' }], error: null };
    const mod = await import('../sitemap');
    const routes = await mod.default();
    expect(routes.some((r: any) => r.url.includes('prod-orphan'))).toBe(false);
  });

  it('une sélection catalogue approuvée apparaît via idToSlug', async () => {
    catalogSelsResult = { data: [{ catalog_product_id: 'cat-1', site_id: 'site-1' }], error: null };
    const mod = await import('../sitemap');
    const routes = await mod.default();
    expect(routes.some((r: any) => r.url.includes('/produits/catalog-cat-1'))).toBe(true);
  });

  it('erreur ou absence de données sur sites_public -> ne casse pas, retombe sur les routes statiques', async () => {
    sitesPublicResult = { data: null, error: { message: 'boom' } };
    const mod = await import('../sitemap');
    const routes = await mod.default();
    expect(Array.isArray(routes)).toBe(true);
    expect(routes.length).toBeGreaterThan(0);
  });
});
