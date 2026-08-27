import { projeter } from '@/lib/testing/postgrest';
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

// LOT 2 -- LES FILTRES DE LA BRANCHE CATALOGUE SONT CAPTURES. Sans cela,
// `merchant_approved` -- la condition de publication -- n'etait assertee par
// rien : la retirer ne cassait aucun test (mutation A11). Ajout pur.
const filtresCatalogSels: [string, unknown][] = [];

// LOT 6 / CHAINE D -- la projection est HONOREE. `b.select = () => b`
// rendait le fixture entier : amputer la projection de `mode` ou de
// `dropship_type` -- les deux colonnes dont depend la garde
// `usesCatalogSelections` posee au LOT 2 -- restait strictement inobservable.
function chain(resolveValue: { data: any; error: any }, capture?: [string, unknown][]) {
  const b: any = {};
  let colonnes = '';
  b.select = (cols?: string) => { colonnes = typeof cols === 'string' ? cols : ''; return b; };
  b.eq = (col: string, val: unknown) => { capture?.push([col, val]); return b; };
  b.then = (resolve: any) => resolve({ ...resolveValue, data: projeter(resolveValue.data, colonnes) });
  return b;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      fromCalls.push(table);
      if (table === 'sites_public') return chain(sitesPublicResult);
      if (table === 'blog_posts') return chain(blogPostsResult);
      if (table === 'shop_products') return chain(shopProductsResult);
      if (table === 'site_catalog_selections') return chain(catalogSelsResult, filtresCatalogSels);
      if (table === 'sites') return chain(sitesPublicResult); // ne doit jamais être appelé
      throw new Error('unexpected table: ' + table);
    },
  },
}));

beforeEach(() => {
  fromCalls.length = 0;
  filtresCatalogSels.length = 0;
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
    // LOT 2 -- la fixture gagne `mode`/`dropship_type`. Elle decrivait un site
    // sans mode : une forme qui n'existe pas en base. Le sitemap interroge
    // desormais l'admission au mecanisme de selection ; sans ces champs, ce
    // cas ne testerait plus la publication mais le refus.
    sitesPublicResult = { data: [{ id: 'site-1', slug: 'shop', created_at: null, mode: 3, dropship_type: 'reseller' }], error: null };
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

// ============================================================
// LOT 2 -- LA BRANCHE CATALOGUE DU SITEMAP, ENFIN COUVERTE.
//
// Elle n'avait aucune assertion propre : retirer son filtre `idToSlug`
// (mutation B5) ou sa condition `merchant_approved` (mutation A11) ne
// cassait rien. Et elle n'avait AUCUNE garde de mode ni de sous-type.
// ============================================================
describe('LOT 2 — sitemap : la branche catalogue applique le mecanisme de selection', () => {
  const SEL = { data: [{ catalog_product_id: 'cat-1', site_id: 'site-1' }], error: null };
  const site = (over: Record<string, unknown>) => ({
    data: [{ id: 'site-1', slug: 'shop', created_at: null, mode: 3, dropship_type: 'reseller', ...over }],
    error: null,
  });
  const urls = async () => (await (await import('../sitemap')).default()).map((r: any) => r.url);

  it.each([
    ['Mode 1 vitrine', { mode: 1, dropship_type: null }],
    ['Mode 2 boutique', { mode: 2, dropship_type: null }],
    ['Mode 3 pod_brand', { dropship_type: 'pod_brand' }],
    ['Mode 3 sans sous-type', { dropship_type: null }],
    ['Mode 3 sous-type inconnu', { dropship_type: 'legacy_x' }],
  ])('%s -> AUCUNE URL de produit catalogue publiee', async (_l, over) => {
    sitesPublicResult = site(over);
    catalogSelsResult = SEL;
    expect(await urls()).not.toContain(
      expect.stringContaining('/produits/catalog-cat-1')
    );
    expect((await urls()).some((u: string) => u.includes('/produits/catalog-'))).toBe(false);
  });

  it.each(['reseller', 'pod_custom'])('Mode 3 %s -> l\'URL est publiee (chemin legitime)', async (t) => {
    sitesPublicResult = site({ dropship_type: t });
    catalogSelsResult = SEL;
    expect((await urls()).some((u: string) => u.includes('/produits/catalog-cat-1'))).toBe(true);
  });

  it('INVARIANT H — une selection NON approuvee n\'est jamais publiee (mutation A11)', async () => {
    // `merchant_approved === true` reste la condition de publication : c'est
    // la requete elle-meme qui la porte. On verifie qu'elle est bien posee.
    sitesPublicResult = site({});
    catalogSelsResult = SEL;
    await urls();
    expect(filtresCatalogSels).toContainEqual(['merchant_approved', true]);
  });

  it('une selection d\'un site inconnu ou non publie n\'est jamais publiee (mutation B5)', async () => {
    sitesPublicResult = site({});
    catalogSelsResult = { data: [{ catalog_product_id: 'cat-9', site_id: 'site-INCONNU' }], error: null };
    expect((await urls()).some((u: string) => u.includes('catalog-cat-9'))).toBe(false);
  });
});
