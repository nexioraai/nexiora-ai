import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit Mode 3/POD BRAND, LOT 1 -- fetchProduct.ts interrogeait `sites`
// directement (colonnes sensibles exposées via select=* à quiconque pour un
// site publié). Corrigé via sites_public. Vérifie explicitement que le
// calcul de prix (cj_margin_percent/cj_round_mode) reste fonctionnel --
// c'est le chemin de non-régression le plus important de ce lot.

const fromCalls: string[] = [];
let siteResult: { data: any; error: any };
let selectionResult: { data: any; error: any };
let productResult: { data: any; error: any };

function chain(resolveValue: { data: any; error: any }) {
  const b: any = {};
  const self = () => b;
  b.select = self;
  b.eq = self;
  b.maybeSingle = async () => resolveValue;
  return b;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      fromCalls.push(table);
      if (table === 'sites_public') return chain(siteResult);
      if (table === 'site_catalog_selections') return chain(selectionResult);
      if (table === 'shop_products') return chain(productResult);
      if (table === 'sites') return chain(siteResult); // ne doit jamais être appelé
      throw new Error('unexpected table: ' + table);
    },
  },
}));

beforeEach(() => {
  fromCalls.length = 0;
  siteResult = {
    data: {
      id: 'site-1', name: 'My Shop', slug: 'my-shop', mode: 3, custom_domain: null,
      dropship_type: 'reseller', product_families: {}, cj_margin_percent: 50, cj_round_mode: 'up',
      primary_color: '#111', theme: 'editorial', lang: 'fr', shipping_flat: 0,
    },
    error: null,
  };
  selectionResult = { data: null, error: null };
  productResult = { data: null, error: null };
});

describe('fetchProduct — interroge sites_public, jamais sites', () => {
  it("appelle .from('sites_public'), jamais .from('sites')", async () => {
    const { fetchProduct } = await import('../fetchProduct');
    await fetchProduct('my-shop', 'catalog-abc');
    expect(fromCalls).toContain('sites_public');
    expect(fromCalls).not.toContain('sites');
  });

  it("calcule le prix catalogue avec la marge réelle du site (cj_margin_percent=50) -- pas de régression de pricing", async () => {
    selectionResult = {
      data: {
        sell_price: null, custom_name: null, custom_description: null, catalog_product_id: 'abc',
        catalog_products: { name: 'T-shirt', description: 'desc', price: 10, currency: 'USD', images: ['x.jpg'], in_stock: true },
      },
      error: null,
    };
    const { fetchProduct } = await import('../fetchProduct');
    const product = await fetchProduct('my-shop', 'catalog-abc');
    expect(product).not.toBeNull();
    // marge 50% arrondie 'up' sur un coût de 10 -> prix > 10, cohérent avec calcSellPrice
    expect(product!.priceNumber).toBeGreaterThan(10);
  });

  it('site introuvable via la vue (non publié) -> null', async () => {
    siteResult = { data: null, error: null };
    const { fetchProduct } = await import('../fetchProduct');
    const product = await fetchProduct('unpublished-shop', 'catalog-abc');
    expect(product).toBeNull();
  });
});
