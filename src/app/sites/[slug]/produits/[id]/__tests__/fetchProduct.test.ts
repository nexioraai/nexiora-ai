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

// LOT 2 -- LES FILTRES SONT DESORMAIS CAPTURES. Sans cela, l'isolation
// inter-locataires (`site_id`) et la condition de publication
// (`merchant_approved`) n'etaient VERIFIABLES par aucune assertion : les
// retirer du code ne cassait rien (mutations B3 et B4, survivantes). Ajout
// pur -- aucune assertion anterieure ne change de sens.
const filtres: [string, string, unknown][] = [];

function chain(resolveValue: { data: any; error: any }, table = '') {
  const b: any = {};
  const self = () => b;
  b.select = (cols?: string) => { if (typeof cols === 'string') selectsAppeles.push(cols); return b; };
  b.eq = (col: string, val: unknown) => { filtres.push([table, col, val]); return b; };
  b.maybeSingle = async () => resolveValue;
  return b;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      fromCalls.push(table);
      if (table === 'sites_public') return chain(siteResult, table);
      if (table === 'site_catalog_selections') return chain(selectionResult, table);
      if (table === 'shop_products') return chain(productResult, table);
      if (table === 'sites') return chain(siteResult, table); // ne doit jamais être appelé
      throw new Error('unexpected table: ' + table);
    },
  },
}));

beforeEach(() => {
  fromCalls.length = 0;
  selectsAppeles.length = 0;
  filtres.length = 0;
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

// ============================================================
// LOT 2 -- L'ADMISSION, L'ISOLATION ET LE PARSING DE LA FICHE PRODUIT.
//
// TROIS DEFAUTS SUR LA MEME BRANCHE, ET AUCUN N'ETAIT COUVERT :
//   * aucune admission -- la seule porte etait la DONNEE, jamais une REGLE ;
//   * `.eq('site_id', ...)` -- l'isolation inter-locataires d'une surface
//     PUBLIQUE -- retirable sans casser un seul test (mutation B4) ;
//   * `.eq('merchant_approved', true)` -- idem (mutation B3) ;
//   * un `slice()` brut la ou cinq autres couches font `split('::')`.
// ============================================================

import { fetchProduct as fp } from '../fetchProduct';

const SEL_OK = {
  data: {
    sell_price: null, custom_name: null, custom_description: null,
    catalog_product_id: 'cp-1',
    catalog_products: { name: 'Bracelet', description: '', price: 10, currency: 'usd', images: [], in_stock: true },
  },
  error: null,
};

describe('LOT 2 — fetchProduct : admission au mecanisme de selection', () => {
  it.each([
    ['Mode 1 vitrine', { mode: 1, dropship_type: null }],
    ['Mode 2 boutique', { mode: 2, dropship_type: null }],
    ['Mode 3 pod_brand', { mode: 3, dropship_type: 'pod_brand' }],
    ['Mode 3 sans sous-type', { mode: 3, dropship_type: null }],
    ['Mode 3 sous-type inconnu', { mode: 3, dropship_type: 'legacy_x' }],
  ])('%s -> null, et `site_catalog_selections` n\'est JAMAIS interrogee', async (_l, over) => {
    siteResult = { data: { ...siteResult.data, ...over }, error: null };
    selectionResult = SEL_OK; // la donnee existe : seule la REGLE doit refuser
    expect(await fp('my-shop', 'catalog-cp-1')).toBeNull();
    expect(fromCalls).not.toContain('site_catalog_selections');
  });

  it.each(['reseller', 'pod_custom'])('Mode 3 %s -> la fiche est servie (chemin visiteur legitime)', async (t) => {
    siteResult = { data: { ...siteResult.data, dropship_type: t }, error: null };
    selectionResult = SEL_OK;
    const p = await fp('my-shop', 'catalog-cp-1');
    expect(p?.name).toBe('Bracelet');
  });

  it('aucune garde de PROPRIETE n\'est introduite : la fiche reste une surface publique', async () => {
    // Elle ne lit que `sites_public` (published + non archivé) et n'exige
    // aucun jeton. Une garde propriétaire ici casserait la vitrine.
    selectionResult = SEL_OK;
    expect(await fp('my-shop', 'catalog-cp-1')).not.toBeNull();
    expect(fromCalls).toContain('sites_public');
    expect(fromCalls).not.toContain('sites');
  });
});

describe('LOT 2 — INVARIANT G : l\'isolation inter-locataires est enfin assertee', () => {
  it('la selection est filtree par `site_id` — mutation B4', async () => {
    selectionResult = SEL_OK;
    await fp('my-shop', 'catalog-cp-1');
    expect(filtres).toContainEqual(['site_catalog_selections', 'site_id', 'site-1']);
  });

  it('INVARIANT H : `merchant_approved` reste la condition de publication — mutation B3', async () => {
    selectionResult = SEL_OK;
    await fp('my-shop', 'catalog-cp-1');
    expect(filtres).toContainEqual(['site_catalog_selections', 'merchant_approved', true]);
  });

  it('le produit marchand est lui aussi borne au site et a `published`', async () => {
    productResult = { data: { id: 'p1', name: 'X', description: '', price: 5, currency: 'usd', images: [], stock: 1, published: true, for_sale: true }, error: null };
    await fp('my-shop', 'p1');
    expect(filtres).toContainEqual(['shop_products', 'site_id', 'site-1']);
    expect(filtres).toContainEqual(['shop_products', 'published', true]);
  });
});

describe('LOT 2 / INVARIANT I — le parsing rejoint les cinq autres couches', () => {
  it('un id porteur d\'une variante interroge le PRODUIT, pas `uuid::variant`', async () => {
    selectionResult = SEL_OK;
    await fp('my-shop', 'catalog-cp-1::vid-42');
    expect(filtres).toContainEqual(['site_catalog_selections', 'catalog_product_id', 'cp-1']);
    expect(filtres.some(([, c, v]) => c === 'catalog_product_id' && String(v).includes('::'))).toBe(false);
  });

  it('un id sans variante est inchange — aucune regression', async () => {
    selectionResult = SEL_OK;
    await fp('my-shop', 'catalog-cp-1');
    expect(filtres).toContainEqual(['site_catalog_selections', 'catalog_product_id', 'cp-1']);
  });
});

// ============================================================
// LOT 4 / R4-01 -- « CETTE LIGNE CATALOGUE EXIGE-T-ELLE UNE VARIANTE ? »
//
// La regle est LUE DE LA DONNEE, pas du fournisseur. Mesure sur les 33 580
// lignes reelles de `catalog_products` :
//   cj       : 25 006 lignes, 100 % `supplier_parent_id IS NULL`  -> PRODUIT
//   printful :  8 392 lignes,   0 % NULL                          -> VARIANTE
//   gelato   :    182 lignes,   0 % NULL                          -> VARIANTE
// Une ligne sans parent EST un produit : son `supplier_product_id` ne peut
// pas tenir lieu de variante. C'est ce qui preserve `pod_brand`/`pod_custom`,
// dont le LOT 3 a deliberement retire le suffixe d'identifiant.
// ============================================================
describe('LOT 4 — fetchProduct expose de quoi choisir une variante', () => {
  const SEL = (cpOver: Record<string, unknown>) => ({
    data: {
      sell_price: null, custom_name: null, custom_description: null,
      catalog_product_id: 'cp-1',
      catalog_products: {
        name: 'Bracelet', description: '', price: 10, currency: 'usd', images: [], in_stock: true,
        supplier_id: 'cj', supplier_product_id: 'cj-pid-1', supplier_parent_id: null, ...cpOver,
      },
    },
    error: null,
  });

  it('ligne SANS parent (CJ) -> `requiresVariant` vrai, et le fournisseur est transmis', async () => {
    selectionResult = SEL({});
    const p = await fp('my-shop', 'catalog-cp-1');
    expect(p?.requiresVariant).toBe(true);
    expect(p?.supplierId).toBe('cj');
    expect(p?.supplierProductId).toBe('cj-pid-1');
  });

  it.each(['printful', 'gelato'])(
    'ligne AVEC parent (%s) -> `requiresVariant` faux : elle EST deja une variante',
    async (fournisseur) => {
      selectionResult = SEL({ supplier_id: fournisseur, supplier_product_id: 'sp-1', supplier_parent_id: 'parent-1' });
      const p = await fp('my-shop', 'catalog-cp-1');
      expect(p?.requiresVariant).toBe(false);
    }
  );

  it('la requete DEMANDE `supplier_parent_id` -- sans quoi la regle serait aveugle', async () => {
    selectionResult = SEL({});
    await fp('my-shop', 'catalog-cp-1');
    expect(selectsAppeles.join(' ')).toContain('supplier_parent_id');
  });

  it('un produit du marchand n\'exige jamais de variante -- comportement inchange', async () => {
    productResult = { data: { id: 'p1', name: 'X', description: '', price: 5, currency: 'usd', images: [], stock: 1, published: true, for_sale: true }, error: null };
    const p = await fp('my-shop', 'p1');
    expect(p?.requiresVariant).toBe(false);
    expect(p?.supplierId).toBeNull();
  });
});
