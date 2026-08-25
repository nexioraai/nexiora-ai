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

// DETTE 6c — les colonnes REELLEMENT demandees. Sans cette capture, on ne
// pourrait pas distinguer « la fiche expose forSale » de « la requete ramene
// la colonne » : un select ampute rendrait la lecture aveugle en silence.
const selectsAppeles: string[] = [];

function chain(resolveValue: { data: any; error: any }) {
  const b: any = {};
  const self = () => b;
  b.select = (cols?: string) => { if (typeof cols === 'string') selectsAppeles.push(cols); return b; };
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
  selectsAppeles.length = 0;
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

// ============================================================
// DETTE 6c — LA FICHE PRODUIT APPLIQUE LA MEME REGLE QUE LA VITRINE.
//
// Trois etats distincts, qu'il ne faut jamais confondre :
//   `published` decide si cette page EXISTE (filtre de la requete) ;
//   `inStock`   decide s'il en reste ;
//   `forSale`   decide si le marchand accepte de le vendre.
// Avant cette dette, la fiche ne lisait meme pas `for_sale` : elle affichait
// un bouton d'achat sur un produit que le checkout refuse ensuite (409).
// ============================================================

function ligneShop(over: Record<string, unknown> = {}) {
  return {
    id: 'p-1', site_id: 'site-1', name: 'Bougie', description: 'Cire',
    price: 24.5, currency: 'CAD', images: [], stock: 5, published: true,
    for_sale: true, ...over,
  };
}

describe('DETTE 6c — la fiche produit expose l’achetabilité', () => {
  it('la requête DEMANDE `for_sale`', async () => {
    productResult = { data: ligneShop(), error: null };
    const { fetchProduct } = await import('../fetchProduct');
    await fetchProduct('my-shop', 'p-1');
    expect(selectsAppeles.some((c) => c.includes('for_sale'))).toBe(true);
  });

  it('`for_sale: false` -> `forSale: false`, mais la page EXISTE toujours', async () => {
    productResult = { data: ligneShop({ for_sale: false }), error: null };
    const { fetchProduct } = await import('../fetchProduct');
    const p = await fetchProduct('my-shop', 'p-1');
    expect(p).not.toBeNull();               // retiré de la vente ≠ dépublié
    expect(p!.name).toBe('Bougie');
    expect(p!.forSale).toBe(false);
  });

  it('`for_sale: true` -> `forSale: true`', async () => {
    productResult = { data: ligneShop({ for_sale: true }), error: null };
    const { fetchProduct } = await import('../fetchProduct');
    expect((await fetchProduct('my-shop', 'p-1'))!.forSale).toBe(true);
  });

  it('champ ABSENT -> `forSale: true` : la barrière stricte est au checkout', async () => {
    const l = ligneShop(); delete (l as Record<string, unknown>).for_sale;
    productResult = { data: l, error: null };
    const { fetchProduct } = await import('../fetchProduct');
    expect((await fetchProduct('my-shop', 'p-1'))!.forSale).toBe(true);
  });

  it('`forSale` et `inStock` restent INDÉPENDANTS — les 4 combinaisons', async () => {
    const { fetchProduct } = await import('../fetchProduct');
    for (const for_sale of [true, false]) {
      for (const stock of [0, 5]) {
        productResult = { data: ligneShop({ for_sale, stock }), error: null };
        const p = await fetchProduct('my-shop', 'p-1');
        expect(p!.forSale, `for_sale=${for_sale} stock=${stock}`).toBe(for_sale);
        expect(p!.inStock, `for_sale=${for_sale} stock=${stock}`).toBe(stock > 0);
      }
    }
  });

  it('un produit de CATALOGUE fournisseur vaut `forSale: true` — comportement inchangé', async () => {
    selectionResult = {
      data: {
        sell_price: null, custom_name: null, custom_description: null,
        catalog_product_id: 'abc',
        catalog_products: { name: 'Mug', description: '', price: 10, currency: 'CAD', images: [], in_stock: true },
      },
      error: null,
    };
    const { fetchProduct } = await import('../fetchProduct');
    expect((await fetchProduct('my-shop', 'catalog-abc'))!.forSale).toBe(true);
  });
});
