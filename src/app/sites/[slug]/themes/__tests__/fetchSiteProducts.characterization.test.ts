import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// ÉTAPE 8, VOLET C — CARACTÉRISATION DU REPLI JSONB, AVANT TOUT RETRAIT.
//
// CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS.
//
// Écrit en caractérisation AVANT le volet C, il fige désormais le contrat
// D'APRÈS. Les cas 2, 3 et 8 ont été révisés au retrait du repli — c'était
// leur fonction : ils ont rendu le changement mesurable au lieu de le laisser
// se produire en silence. Tout le reste (mapping, ordre, Mode 1, catalog-*)
// est inchangé mot pour mot, ce qui prouve que le retrait n'a rien débordé.
//
// POURQUOI ILS EXISTENT. Ces deux fonctions n'avaient AUCUN test de leur
// traitement des produits. `sitesPublicView.test.ts` vérifie quelle table est
// interrogée, jamais ce que devient `products`. Retirer un comportement qu'on
// n'a jamais figé, c'est ne pas pouvoir distinguer le retrait voulu d'une
// régression collatérale.
//
// LE REPLI, EN UNE LIGNE (shared.tsx:178 et :308, code identique) :
//   if (shopProducts && shopProducts.length > 0) { data.products = … }
// Le jsonb `sites.products` survit donc dès que `shop_products` ne rend
// aucune ligne publiée.
// ============================================================

const fromCalls: string[] = [];
const orderCalls: Array<[string, unknown]> = [];

function makeQueryBuilder(resolveValue: { data: any; error: any }) {
  const b: any = {};
  const self = () => b;
  b.select = self;
  b.eq = self;
  b.order = (col: string, opts: unknown) => {
    orderCalls.push([col, opts]);
    return Promise.resolve(resolveValue);
  };
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
      if (table === 'sites') return makeQueryBuilder(siteResult);          // fetchSitePreview
      if (table === 'shop_products') return makeQueryBuilder(shopProductsResult);
      if (table === 'site_catalog_selections') return makeQueryBuilder(catalogSelectionsResult);
      throw new Error('table inattendue : ' + table);
    },
  },
}));

/** Le catalogue jsonb tel que le Mode 1 l'écrit réellement : ni id, ni devise. */
const JSONB = [
  { name: 'Café Latte', price: '4.50', description: 'Doux' },
  { name: 'Croissant', price: '2.00', description: 'Beurre' },
];

/** Une ligne `shop_products` telle que la requête la projette réellement. */
function ligne(over: Record<string, unknown> = {}) {
  return {
    id: 'p-1', name: 'Mug', description: 'Céramique',
    price: 12, currency: 'CAD', images: ['https://x.test/mug.png'], cj_vid: null,
    ...over,
  };
}

function site(over: Record<string, unknown> = {}) {
  return {
    id: 'site-1', slug: 'ma-boutique', name: 'Ma Boutique',
    mode: 2, dropship_type: null,
    cj_margin_percent: 40, cj_round_mode: 'up',
    products: JSON.parse(JSON.stringify(JSONB)),
    ...over,
  };
}

beforeEach(() => {
  fromCalls.length = 0;
  orderCalls.length = 0;
  siteResult = { data: site(), error: null };
  shopProductsResult = { data: [], error: null };
  catalogSelectionsResult = { data: [], error: null };
});

const noms = (s: any) => (s?.products ?? []).map((p: any) => p.name);

// ============================================================
// Les deux fonctions portent un code RIGOUREUSEMENT identique. Les
// caractériser ensemble n'est pas une commodité : c'est ce qui rendra visible
// un volet C qui n'en corrigerait qu'une seule.
// ============================================================
const FONCTIONS: Array<[string, (s: any) => Promise<any>]> = [
  ['fetchSite', async (mod) => mod.fetchSite('ma-boutique')],
  ['fetchSitePreview', async (mod) => mod.fetchSitePreview('ma-boutique', 'owner@test.com')],
];

for (const [nom, appel] of FONCTIONS) {
  describe(`${nom} — CAS 1 : shop_products rend des lignes publiées`, () => {
    it('le jsonb est REMPLACÉ intégralement, jamais fusionné', async () => {
      shopProductsResult = { data: [ligne()], error: null };
      const mod = await import('../shared');
      const s = await appel(mod);
      expect(noms(s)).toEqual(['Mug']);
      // Aucune trace du jsonb : le remplacement est total.
      expect(noms(s)).not.toContain('Café Latte');
      expect(s.products).toHaveLength(1);
    });
  });

  describe(`${nom} — CAS 2 : shop_products rend un tableau VIDE`, () => {
    it('MODE 2 — le repli a DISPARU : products devient vide, le jsonb n’est pas restauré', async () => {
      siteResult = { data: site({ mode: 2 }), error: null };
      shopProductsResult = { data: [], error: null };
      const mod = await import('../shared');
      const s = await appel(mod);
      // Avant le volet C : `['Café Latte', 'Croissant']`. Une boutique sans
      // produit publié n'hérite plus du catalogue d'avant — elle n'a pas de
      // catalogue, et c'est la vérité.
      expect(s.products).toEqual([]);
    });

    it('MODE 3 — le repli a DISPARU également', async () => {
      siteResult = { data: site({ mode: 3, dropship_type: 'pod_brand' }), error: null };
      shopProductsResult = { data: [], error: null };
      const mod = await import('../shared');
      const s = await appel(mod);
      expect(s.products).toEqual([]);
    });

    it('MODE 1 — le jsonb est CONSERVÉ : ce n’est pas un repli, c’est sa seule source', async () => {
      siteResult = { data: site({ mode: 1 }), error: null };
      shopProductsResult = { data: [], error: null };
      const mod = await import('../shared');
      const s = await appel(mod);
      expect(noms(s)).toEqual(['Café Latte', 'Croissant']);
      expect(s.products[0]).toEqual({ name: 'Café Latte', price: '4.50', description: 'Doux' });
      // Ces objets n'ont aucun `id` — ils ne sont donc pas achetables, ce qui
      // est exact : une vitrine ne vend pas. Ils restent PRÉSENTÉS.
      for (const p of s.products) expect(p).not.toHaveProperty('id');
    });
  });

  describe(`${nom} — CAS 3 : shop_products rend NULL`, () => {
    it('MODE 2 — products devient vide (le jsonb n’est plus restauré, même sur panne)', async () => {
      // `const { data: shopProducts } = await …` : `error` n'est TOUJOURS PAS
      // destructuré. DETTE CONSIGNÉE, volontairement NON corrigée par le
      // volet C. Ce test la CONSTATE : une panne PostgREST rend `data = null`
      // et la boutique affiche désormais un catalogue VIDE au lieu de l'ancien
      // jsonb. Le symptôme change, la dette reste entière — et devient plus
      // visible, ce qui vaut mieux qu'un affichage faux.
      siteResult = { data: site({ mode: 2 }), error: null };
      shopProductsResult = { data: null, error: { message: 'boom', code: '42703' } };
      const mod = await import('../shared');
      const s = await appel(mod);
      expect(s.products).toEqual([]);
    });

    it('MODE 1 — le jsonb reste conservé (comportement rigoureusement inchangé)', async () => {
      siteResult = { data: site({ mode: 1 }), error: null };
      shopProductsResult = { data: null, error: { message: 'boom', code: '42703' } };
      const mod = await import('../shared');
      const s = await appel(mod);
      expect(noms(s)).toEqual(['Café Latte', 'Croissant']);
    });
  });

  describe(`${nom} — CAS 4 : jsonb VIDE et shop_products VIDE`, () => {
    it('products reste un tableau vide', async () => {
      siteResult = { data: site({ products: [] }), error: null };
      shopProductsResult = { data: [], error: null };
      const mod = await import('../shared');
      const s = await appel(mod);
      expect(s.products).toEqual([]);
    });
  });

  describe(`${nom} — CAS 5 : jsonb ABSENT`, () => {
    it('MODE 2, jsonb null -> tableau vide (la source canonique fait foi)', async () => {
      siteResult = { data: site({ mode: 2, products: null }), error: null };
      shopProductsResult = { data: [], error: null };
      const mod = await import('../shared');
      const s = await appel(mod);
      expect(s.products).toEqual([]);
    });

    it('MODE 1, jsonb null reste null (aucune valeur inventée, comportement inchangé)', async () => {
      siteResult = { data: site({ mode: 1, products: null }), error: null };
      shopProductsResult = { data: [], error: null };
      const mod = await import('../shared');
      const s = await appel(mod);
      expect(s.products).toBeNull();
    });

    it('products undefined + shop_products publiés -> le tableau est créé', async () => {
      siteResult = { data: site({ products: undefined }), error: null };
      shopProductsResult = { data: [ligne()], error: null };
      const mod = await import('../shared');
      const s = await appel(mod);
      expect(noms(s)).toEqual(['Mug']);
    });
  });

  describe(`${nom} — CAS 6 : forme exacte du mapping`, () => {
    it('les 8 champs projetés, aux formats exacts', async () => {
      shopProductsResult = { data: [ligne()], error: null };
      const mod = await import('../shared');
      const s = await appel(mod);
      expect(s.products[0]).toEqual({
        id: 'p-1',
        name: 'Mug',
        description: 'Céramique',
        price: '12.00 CAD',          // toFixed(2) + devise, une CHAÎNE
        priceNumber: 12,             // et le nombre à côté
        currency: 'CAD',
        image: 'https://x.test/mug.png',  // images[0], pas le tableau
        cjVid: null,
      });
    });

    it('description null -> chaîne vide ; images vide -> image undefined', async () => {
      shopProductsResult = { data: [ligne({ description: null, images: [] })], error: null };
      const mod = await import('../shared');
      const s = await appel(mod);
      expect(s.products[0].description).toBe('');
      expect(s.products[0].image).toBeUndefined();
    });

    it('price null -> chaîne vide et priceNumber undefined (aucun 0 inventé)', async () => {
      shopProductsResult = { data: [ligne({ price: null })], error: null };
      const mod = await import('../shared');
      const s = await appel(mod);
      expect(s.products[0].price).toBe('');
      expect(s.products[0].priceNumber).toBeUndefined();
    });

    it('cj_vid renseigné -> repris tel quel dans cjVid', async () => {
      shopProductsResult = { data: [ligne({ cj_vid: 'VID-9' })], error: null };
      const mod = await import('../shared');
      const s = await appel(mod);
      expect(s.products[0].cjVid).toBe('VID-9');
    });

    it('`stock`, `published`, `track_inventory` et `for_sale` ne sont PAS exposés au public', async () => {
      shopProductsResult = {
        data: [ligne({ stock: 42, published: true, track_inventory: true, for_sale: false })],
        error: null,
      };
      const mod = await import('../shared');
      const s = await appel(mod);
      for (const interdit of ['stock', 'published', 'track_inventory', 'for_sale']) {
        expect(s.products[0], interdit).not.toHaveProperty(interdit);
      }
    });
  });

  describe(`${nom} — CAS 7 : ordre`, () => {
    it("la requête shop_products trie par `position` ascendant", async () => {
      shopProductsResult = { data: [ligne()], error: null };
      const mod = await import('../shared');
      await appel(mod);
      expect(orderCalls).toContainEqual(['position', { ascending: true }]);
    });

    it("l'ordre rendu par la base est préservé, jamais retrié", async () => {
      shopProductsResult = {
        data: [ligne({ id: 'p-2', name: 'Zèbre' }), ligne({ id: 'p-1', name: 'Abeille' })],
        error: null,
      };
      const mod = await import('../shared');
      const s = await appel(mod);
      expect(noms(s)).toEqual(['Zèbre', 'Abeille']);
    });
  });

  describe(`${nom} — CAS 9 : Mode 1`, () => {
    it('un Mode 1 conserve son jsonb (il ne peut posséder aucun shop_products)', async () => {
      siteResult = { data: site({ mode: 1 }), error: null };
      shopProductsResult = { data: [], error: null };
      const mod = await import('../shared');
      const s = await appel(mod);
      expect(noms(s)).toEqual(['Café Latte', 'Croissant']);
    });

    it("aucune sélection de catalogue n'est chargée en Mode 1", async () => {
      siteResult = { data: site({ mode: 1 }), error: null };
      const mod = await import('../shared');
      await appel(mod);
      expect(fromCalls).not.toContain('site_catalog_selections');
    });
  });
}

// ============================================================
// CAS 8 — Mode 3. `loadCatalogSelections` PRÉFIXE les `catalog-*` au tableau
// final, quel qu'il soit : c'est un AJOUT, jamais un repli. Les trois sources
// peuvent donc coexister, et le volet C ne doit pas y toucher.
// ============================================================
const SELECTION = {
  id: 'sel-1',
  sell_price: null,
  custom_name: null,
  custom_description: null,
  catalog_product_id: 'cat-9',
  catalog_products: {
    name: 'Tasse Fournisseur', description: 'Import', price: 5, currency: 'USD',
    images: ['https://x.test/tasse.png'], supplier_id: 'cj', supplier_product_id: 'VID1',
    shipping_days_min: 7, shipping_days_max: 15, in_stock: true, category: 'mugs',
  },
};

describe('CAS 8 — Mode 3 reseller : les catalog-* sont PRÉFIXÉS', () => {
  beforeEach(() => {
    siteResult = { data: site({ mode: 3, dropship_type: 'reseller' }), error: null };
    catalogSelectionsResult = { data: [SELECTION], error: null };
  });

  it('avec shop_products publiés : catalogue EN TÊTE, puis les shop_products', async () => {
    shopProductsResult = { data: [ligne()], error: null };
    const { fetchSite } = await import('../shared');
    const s = await fetchSite('ma-boutique');
    expect(noms(s)).toEqual(['Tasse Fournisseur', 'Mug']);
    expect((s!.products as any[])[0].id).toBe('catalog-cat-9');
  });

  it('SANS shop_products : les catalog-* SURVIVENT SEULS, le jsonb a disparu', async () => {
    shopProductsResult = { data: [], error: null };
    const { fetchSite } = await import('../shared');
    const s = await fetchSite('ma-boutique');
    // Avant le volet C : `['Tasse Fournisseur', 'Café Latte', 'Croissant']`.
    // Le retrait du repli ne touche PAS aux `catalog-*` : ils sont un AJOUT,
    // posé après, jamais un repli. C'est le cas le plus subtil du volet C —
    // un retrait mal ciblé aurait emporté le catalogue fournisseur avec le
    // jsonb.
    expect(noms(s)).toEqual(['Tasse Fournisseur']);
    expect((s!.products as any[])[0].id).toBe('catalog-cat-9');
  });

  it('SANS shop_products NI sélection approuvée : products est vide', async () => {
    shopProductsResult = { data: [], error: null };
    catalogSelectionsResult = { data: [], error: null };
    const { fetchSite } = await import('../shared');
    const s = await fetchSite('ma-boutique');
    expect(s!.products).toEqual([]);
  });

  it("un produit épuisé chez le fournisseur (`in_stock: false`) est écarté", async () => {
    catalogSelectionsResult = {
      data: [{ ...SELECTION, catalog_products: { ...SELECTION.catalog_products, in_stock: false } }],
      error: null,
    };
    shopProductsResult = { data: [ligne()], error: null };
    const { fetchSite } = await import('../shared');
    const s = await fetchSite('ma-boutique');
    expect(noms(s)).toEqual(['Mug']);
  });

  it('Mode 3 pod_brand : AUCUNE sélection de catalogue chargée', async () => {
    siteResult = { data: site({ mode: 3, dropship_type: 'pod_brand' }), error: null };
    const { fetchSite } = await import('../shared');
    await fetchSite('ma-boutique');
    expect(fromCalls).not.toContain('site_catalog_selections');
  });

  it('Mode 2 : AUCUNE sélection de catalogue chargée', async () => {
    siteResult = { data: site({ mode: 2 }), error: null };
    const { fetchSite } = await import('../shared');
    await fetchSite('ma-boutique');
    expect(fromCalls).not.toContain('site_catalog_selections');
  });
});

// ============================================================
// Le repli est écrit DEUX FOIS, à l'identique. Ce contrôle textuel rendra
// visible un volet C qui n'en corrigerait qu'un seul.
// ============================================================
describe('LE REPLI EXISTE À DEUX ENDROITS, ET ILS SONT IDENTIQUES', () => {
  it('les deux points appellent le MÊME helper, écrit une seule fois', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const SRC = readFileSync(join(__dirname, '../shared.tsx'), 'utf-8');
    // Traiter un seul des deux points ferait diverger la vitrine publique et
    // l'aperçu propriétaire — ils doivent montrer le même catalogue.
    expect([...SRC.matchAll(/applyShopProducts\(data as any, shopProducts\)/g)]).toHaveLength(2);
    expect([...SRC.matchAll(/function applyShopProducts\(/g)]).toHaveLength(1);
    expect([...SRC.matchAll(/function mapShopProducts\(/g)]).toHaveLength(1);
  });

  it('AUCUN repli conditionnel ne subsiste pour les modes commerçants', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const code = readFileSync(join(__dirname, '../shared.tsx'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // La seule occurrence restante de la clause est la branche NON commerçante
    // de `applyShopProducts` — celle qui laisse le Mode 1 rigoureusement
    // inchangé. Deux occurrences signifieraient qu'un repli a repoussé.
    expect([...code.matchAll(/shopProducts && shopProducts\.length > 0/g)]).toHaveLength(1);
  });

  it('la frontière vient de `canTransact`, jamais d’un `mode === 2 || mode === 3` recopié', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const code = readFileSync(join(__dirname, '../shared.tsx'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain('canTransact(data?.mode)');
    expect(code).not.toMatch(/mode === 2 \|\| .*mode === 3/);
  });
});
