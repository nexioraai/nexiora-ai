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
// DETTE 6c — les colonnes REELLEMENT demandees. Sans cette capture, on ne
// pourrait pas distinguer « la projection expose forSale » de « la requete
// ramene la colonne » : un select amputé rendrait la projection aveugle sans
// qu'aucune assertion ne bouge.
const selectsAppeles: string[] = [];

function makeQueryBuilder(resolveValue: { data: any; error: any }) {
  const b: any = {};
  const self = () => b;
  b.select = (cols?: string) => { if (typeof cols === 'string') selectsAppeles.push(cols); return b; };
  b.eq = self;
  b.order = (col: string, opts: unknown) => {
    orderCalls.push([col, opts]);
    return Promise.resolve(resolveValue);
  };
  b.single = async () => resolveValue;
  b.maybeSingle = async () => resolveValue;
  // LOT 3 — maillon AJOUTE : `loadPodBrandCatalogPrices` termine sur `.in()`,
  // qui resout directement la requete (aucun `.order()` derriere). Ajout pur :
  // aucun chemin existant ne l'emprunte.
  b.in = () => Promise.resolve(resolveValue);
  return b;
}

let siteResult: { data: any; error: any };
let shopProductsResult: { data: any; error: any };
let catalogSelectionsResult: { data: any; error: any };
let catalogProductsResult: { data: any; error: any };

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      fromCalls.push(table);
      if (table === 'sites_public') return makeQueryBuilder(siteResult);
      if (table === 'sites') return makeQueryBuilder(siteResult);          // fetchSitePreview
      if (table === 'shop_products') return makeQueryBuilder(shopProductsResult);
      if (table === 'site_catalog_selections') return makeQueryBuilder(catalogSelectionsResult);
      // LOT 3 — `loadPodBrandCatalogPrices` relit prix et devise des maquettes.
      if (table === 'catalog_products') return makeQueryBuilder(catalogProductsResult);
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
    // DETTE 6c — la colonne fait partie de la projection reelle depuis cette
    // dette : la fixture doit la porter, sinon elle decrit une requete qui
    // n'existe plus.
    for_sale: true,
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
  selectsAppeles.length = 0;
  siteResult = { data: site(), error: null };
  shopProductsResult = { data: [], error: null };
  catalogSelectionsResult = { data: [], error: null };
  catalogProductsResult = { data: [], error: null };
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
    // DETTE 6c — NEUF champs, et non plus huit. Le `toEqual` est exhaustif :
    // c'est lui qui garantit qu'aucun autre champ interne n'a été promu au
    // passage. Ce bloc est exécuté pour fetchSite ET fetchSitePreview.
    it('les 9 champs projetés, aux formats exacts', async () => {
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
        forSale: true,               // DETTE 6c — l'achetabilité, seul champ ajouté
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

    // ============================================================
    // DETTE 6c — CLIQUET RETOURNÉ, CONSCIEMMENT.
    //
    // Il interdisait `for_sale` au public. C'était le verrou exact du défaut :
    // la vitrine ne pouvait pas savoir qu'un produit n'était plus vendable, et
    // affichait donc « Ajouter au panier » sur un article que le checkout
    // refuse ensuite (409). Le cliquet ne disparaît pas — il change de cible :
    // `for_sale` DOIT désormais être exposé, et les trois autres champs
    // DOIVENT rester interdits. Il rougit dans les deux sens.
    // ============================================================
    it('`stock`, `published` et `track_inventory` ne sont TOUJOURS PAS exposés au public', async () => {
      shopProductsResult = {
        data: [ligne({ stock: 42, published: true, track_inventory: true, for_sale: false })],
        error: null,
      };
      const mod = await import('../shared');
      const s = await appel(mod);
      for (const interdit of ['stock', 'published', 'track_inventory']) {
        expect(s.products[0], interdit).not.toHaveProperty(interdit);
      }
      // La colonne brute ne fuit pas non plus sous son nom SQL.
      expect(s.products[0]).not.toHaveProperty('for_sale');
    });

    it('DETTE 6c — `forSale` EST exposé, et reflète la valeur réelle', async () => {
      shopProductsResult = { data: [ligne({ for_sale: false })], error: null };
      const mod = await import('../shared');
      const s = await appel(mod);
      expect(s.products[0]).toHaveProperty('forSale');
      expect(s.products[0].forSale).toBe(false);
    });

    it('DETTE 6c — un produit vendable est exposé `forSale: true`', async () => {
      shopProductsResult = { data: [ligne({ for_sale: true })], error: null };
      const mod = await import('../shared');
      const s = await appel(mod);
      expect(s.products[0].forSale).toBe(true);
    });

    it('DETTE 6c — champ ABSENT de la ligne -> `forSale: true` (le checkout reste la vraie barrière)', async () => {
      const l = ligne({});
      delete (l as Record<string, unknown>).for_sale;
      shopProductsResult = { data: [l], error: null };
      const mod = await import('../shared');
      const s = await appel(mod);
      expect(s.products[0].forSale).toBe(true);
    });

    it('DETTE 6c — la requête DEMANDE bien `for_sale` : sans lui, la projection serait aveugle', async () => {
      const mod = await import('../shared');
      await appel(mod);
      expect(selectsAppeles.some((c) => c.includes('for_sale'))).toBe(true);
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

// ============================================================
// DETTE 3 — LE SIGNAL DE PANNE, SANS TOUCHER AU RENDU.
//
// Une panne PostgREST était jusqu'ici INDISTINGUABLE d'un résultat vide :
// `error` n'était pas destructuré, `data` valait `null`, la vitrine affichait
// un catalogue vide et personne ne le savait.
//
// Ce que ces tests verrouillent, et rien d'autre : le SIGNAL apparaît, et le
// RENDU ne bouge pas d'un iota. Les cas 1 à 9 ci-dessus restent inchangés mot
// pour mot — c'est la preuve que l'observabilité n'a rien débordé.
// ============================================================
describe('DETTE 3 — `diagnostics` : signal de panne', () => {
  const PANNE = { message: 'column shop_products.foo does not exist', code: '42703' };

  describe('erreur `shop_products` dans fetchSite', () => {
    for (const [label, mode, attendu] of [
      ['MODE 1 — le jsonb reste conservé', 1, ['Café Latte', 'Croissant']],
      ['MODE 2 — le catalogue reste vide', 2, []],
      ['MODE 3 — le catalogue reste vide', 3, []],
    ] as Array<[string, number, string[]]>) {
      it(`${label}, ET le diagnostic est présent`, async () => {
        siteResult = { data: site({ mode, dropship_type: mode === 3 ? 'pod_brand' : null }), error: null };
        shopProductsResult = { data: null, error: PANNE };
        const diagnostics: string[] = [];
        const { fetchSite } = await import('../shared');
        const s = await fetchSite('ma-boutique', false, diagnostics);

        // LE RENDU N'A PAS CHANGÉ.
        expect(noms(s)).toEqual(attendu);
        // LE SIGNAL EXISTE.
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toContain('fetchSite/shop_products');
        expect(diagnostics[0]).toContain('column shop_products.foo does not exist');
      });
    }

    it('AUCUN 404 supplémentaire : une panne ne rend jamais `null`', async () => {
      shopProductsResult = { data: null, error: PANNE };
      const diagnostics: string[] = [];
      const { fetchSite } = await import('../shared');
      const s = await fetchSite('ma-boutique', false, diagnostics);
      // `null` continue de ne signifier QUE « site introuvable ». Les
      // appelants font `if (!site) notFound()` / `404` : transformer une
      // panne de catalogue en 404 supprimerait un site publié.
      expect(s).not.toBeNull();
      expect(s!.name).toBe('Ma Boutique');
    });
  });

  describe('erreur `site_catalog_selections` en Mode 3', () => {
    it('les shop_products déjà posés RESTENT, aucun catalog-* inventé, ET le diagnostic est présent', async () => {
      siteResult = { data: site({ mode: 3, dropship_type: 'reseller' }), error: null };
      shopProductsResult = { data: [ligne()], error: null };
      catalogSelectionsResult = { data: null, error: { message: 'relation does not exist', code: '42P01' } };
      const diagnostics: string[] = [];
      const { fetchSite } = await import('../shared');
      const s = await fetchSite('ma-boutique', false, diagnostics);

      expect(noms(s)).toEqual(['Mug']);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toContain('loadCatalogSelections/site_catalog_selections');
    });

    it('les DEUX requêtes en panne -> DEUX diagnostics, rendu vide, pas de null', async () => {
      siteResult = { data: site({ mode: 3, dropship_type: 'reseller' }), error: null };
      shopProductsResult = { data: null, error: PANNE };
      catalogSelectionsResult = { data: null, error: { message: 'relation does not exist', code: '42P01' } };
      const diagnostics: string[] = [];
      const { fetchSite } = await import('../shared');
      const s = await fetchSite('ma-boutique', false, diagnostics);
      expect(s).not.toBeNull();
      expect(s!.products).toEqual([]);
      expect(diagnostics).toHaveLength(2);
    });

    it('Mode 3 pod_brand : la requête catalogue n\'est pas faite, donc jamais de diagnostic', async () => {
      siteResult = { data: site({ mode: 3, dropship_type: 'pod_brand' }), error: null };
      shopProductsResult = { data: [ligne()], error: null };
      catalogSelectionsResult = { data: null, error: { message: 'ne doit pas etre lue' } };
      const diagnostics: string[] = [];
      const { fetchSite } = await import('../shared');
      await fetchSite('ma-boutique', false, diagnostics);
      expect(fromCalls).not.toContain('site_catalog_selections');
      expect(diagnostics).toEqual([]);
    });
  });

  describe('AUCUN faux positif — un résultat vide légitime ne signale RIEN', () => {
    it('succès avec des lignes -> diagnostics vide', async () => {
      shopProductsResult = { data: [ligne()], error: null };
      const diagnostics: string[] = [];
      const { fetchSite } = await import('../shared');
      await fetchSite('ma-boutique', false, diagnostics);
      expect(diagnostics).toEqual([]);
    });

    it('`data: []` (boutique sans produit publié) -> diagnostics vide', async () => {
      // Sans cette distinction, CHAQUE boutique sans produit publié
      // remplirait le journal d'anomalies à chaque visite.
      shopProductsResult = { data: [], error: null };
      const diagnostics: string[] = [];
      const { fetchSite } = await import('../shared');
      await fetchSite('ma-boutique', false, diagnostics);
      expect(diagnostics).toEqual([]);
    });

    it('`data: null` SANS erreur -> diagnostics vide', async () => {
      shopProductsResult = { data: null, error: null };
      const diagnostics: string[] = [];
      const { fetchSite } = await import('../shared');
      await fetchSite('ma-boutique', false, diagnostics);
      expect(diagnostics).toEqual([]);
    });

    it('Mode 3, catalogue vide sans erreur -> diagnostics vide', async () => {
      siteResult = { data: site({ mode: 3, dropship_type: 'reseller' }), error: null };
      shopProductsResult = { data: [ligne()], error: null };
      catalogSelectionsResult = { data: [], error: null };
      const diagnostics: string[] = [];
      const { fetchSite } = await import('../shared');
      await fetchSite('ma-boutique', false, diagnostics);
      expect(diagnostics).toEqual([]);
    });
  });

  describe('`diagnostics` est OPTIONNEL — le contrat reste rétrocompatible', () => {
    it('appeler fetchSite sans le tableau ne change rien au rendu', async () => {
      shopProductsResult = { data: null, error: PANNE };
      const { fetchSite } = await import('../shared');
      const s = await fetchSite('ma-boutique');
      expect(s).not.toBeNull();
      expect(s!.products).toEqual([]);
    });

    it('le repli `console.error` prend alors le relais — le signal n\'est jamais perdu', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      shopProductsResult = { data: null, error: PANNE };
      const { fetchSite } = await import('../shared');
      await fetchSite('ma-boutique');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('fetchSite/shop_products'));
      spy.mockRestore();
    });
  });

  describe('fetchSitePreview — comportement INCHANGÉ, signal en console', () => {
    it('sa signature n\'a pas de `diagnostics` : son unique appelant est un composant client', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      shopProductsResult = { data: null, error: PANNE };
      const { fetchSitePreview } = await import('../shared');
      const s = await fetchSitePreview('ma-boutique', 'owner@test.com');
      // Rendu identique à avant la dette 3.
      expect(s).not.toBeNull();
      expect(s!.products).toEqual([]);
      // Signal atteint la console du propriétaire, seul utilisateur de la page.
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('fetchSitePreview/shop_products'));
      spy.mockRestore();
    });

    it('Mode 1 en preview : le jsonb reste conservé', async () => {
      siteResult = { data: site({ mode: 1 }), error: null };
      shopProductsResult = { data: null, error: PANNE };
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { fetchSitePreview } = await import('../shared');
      const s = await fetchSitePreview('ma-boutique', 'owner@test.com');
      expect(noms(s)).toEqual(['Café Latte', 'Croissant']);
      spy.mockRestore();
    });

    it('succès en preview -> aucun console.error', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      shopProductsResult = { data: [ligne()], error: null };
      const { fetchSitePreview } = await import('../shared');
      await fetchSitePreview('ma-boutique', 'owner@test.com');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});

// ============================================================
// DETTE 3 — LA FRONTIÈRE SERVEUR, VÉRIFIÉE TEXTUELLEMENT.
//
// `logAnomaly` dépend de `supabase-admin` donc de `server-only`. Son entrée
// dans le graphe de `shared.tsx` fait ÉCHOUER le build — mesuré deux fois,
// import statique et import dynamique. Ce cliquet empêche que quelqu'un le
// réintroduise en croyant bien faire.
// ============================================================
describe('DETTE 3 — `shared.tsx` ne franchit JAMAIS la frontière serveur', () => {
  const lire = async (rel: string) => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    return readFileSync(join(__dirname, rel), 'utf-8');
  };

  it('aucun import de `anomaly`, `supabase-admin` ou `server-only`', async () => {
    // Sur le CODE, pas sur le fichier brut : les commentaires expliquent
    // précisément POURQUOI ces modules sont interdits ici, et les nomment
    // donc. Sanctionner la prose punirait la documentation, pas le défaut.
    const code = (await lire('../shared.tsx'))
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/from '@\/lib\/anomaly'/);
    expect(code).not.toMatch(/import\(['"]@\/lib\/anomaly['"]\)/);
    expect(code).not.toMatch(/supabase-admin/);
    expect(code).not.toMatch(/server-only/);
  });

  it('les trois requêtes destructurent bien `error`', async () => {
    const SRC = await lire('../shared.tsx');
    expect([...SRC.matchAll(/error: shopProductsError/g)]).toHaveLength(2);
    expect([...SRC.matchAll(/error: catSelsError/g)]).toHaveLength(1);
  });

  it('le signal ne part QUE sur un vrai objet `error`', async () => {
    const code = (await lire('../shared.tsx'))
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // Jamais `if (!data)` : un résultat vide légitime ne doit rien signaler.
    expect([...code.matchAll(/if \(shopProductsError\)/g)]).toHaveLength(2);
    expect([...code.matchAll(/if \(catSelsError\)/g)]).toHaveLength(1);
    // Le signal n'est JAMAIS déclenché par l'absence de données : ni `!data`,
    // ni `.length === 0`. Un résultat vide légitime doit rester muet.
    expect(code).not.toMatch(/if \(!shopProducts\)[\s\S]{0,120}signalQueryFailure/);
    expect(code).not.toMatch(/if \(!catSels\)[\s\S]{0,120}signalQueryFailure/);
    // LOT 3 — RELEVEMENT DELIBERE : 4 -> 5. Une requête instrumentée de plus,
    // `loadPodBrandCatalogPrices`, qui relit prix et devise des maquettes POD
    // BRAND depuis `catalog_products` (le JSON `pod_designs` est écrit par le
    // marchand en PostgREST direct). Même patron que les quatre autres : un
    // seul signal, uniquement sur un vrai objet `error`, jamais sur un
    // résultat vide. Le cliquet a fait son travail — l'ajout est visible.
    expect([...code.matchAll(/signalQueryFailure\(/g)]).toHaveLength(5); // 3 appels + 1 déclaration
  });

  it('les appelants SERVEUR consommateurs de `products` journalisent', async () => {
    for (const rel of [
      '../../page.tsx',
      '../../llms.txt/route.ts',
      '../../../../api/internal/site-sitemap/[slug]/route.ts',
    ]) {
      const SRC = await lire(rel);
      expect(SRC, rel).toMatch(/from '@\/lib\/anomaly'/);
      expect(SRC, rel).toMatch(/const diagnostics: string\[\] = \[\]/);
      expect(SRC, rel).toMatch(/type: 'storefront_query_failed'/);
      expect(SRC, rel).toMatch(/severity: 'warning'/);
    }
  });

  it("aucun appelant ne transforme une panne en 404", async () => {
    // `notFound()` et les 404 restent conditionnés au SEUL `!site`. Une panne
    // de catalogue n'a jamais fait disparaître un site publié, et ne doit pas
    // commencer.
    const page = await lire('../../page.tsx');
    const pageCode = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(pageCode).toMatch(/if \(!site\) notFound\(\)/);
    // UN SEUL appel, et il ne dépend que de `!site`.
    expect([...pageCode.matchAll(/notFound\(\)/g)]).toHaveLength(1);
    expect(pageCode).not.toMatch(/diagnostics\.length[\s\S]{0,60}notFound/);

    for (const rel of ['../../llms.txt/route.ts', '../../../../api/internal/site-sitemap/[slug]/route.ts']) {
      const SRC = await lire(rel);
      expect(SRC, rel).toMatch(/if \(!site\) \{\s*\n\s*return new Response\('Not found', \{ status: 404 \}\)/);
      expect(SRC, rel).not.toMatch(/diagnostics\.length[\s\S]{0,60}404/);
    }
  });
});

// ============================================================
// LOT 3 / L3-05 + L3-04 -- LE PRIX AFFICHE D'UNE MAQUETTE POD BRAND.
//
// `sites.pod_designs` figure dans le `GRANT UPDATE` des 41 colonnes : le
// marchand l'ecrit DIRECTEMENT en PostgREST, sans route serveur. Le prix
// affiche sortait donc de ce JSON, tandis que le checkout recalculait depuis
// `catalog_products` -- un visiteur pouvait voir un prix et en payer un autre.
// ============================================================
import { fetchSite as fetchSiteLot3, mockupsToProducts as m2pLot3 } from '../shared';

describe('LOT 3 / L3-05 — le prix des maquettes est relu en base, jamais cru sur parole', () => {
  const MOCKUP = (over: Record<string, unknown> = {}) => ({
    catalog_product_id: 'cp-1', product_id: 198, variant_id: 7791,
    product_name: 'T-Shirt', mockup_url: 'https://x.test/m.png',
    design_url: 'https://x.test/d.png', price: 1, currency: 'XXX', ...over,
  });
  const SITE_PB = (mockups: any[]) => site({
    mode: 3, dropship_type: 'pod_brand', cj_margin_percent: 0, cj_round_mode: 'off',
    products: [], pod_designs: [{ url: 'https://x.test/d.png', mockups }],
  });

  it('un prix et une devise forges dans `pod_designs` sont remplaces par ceux du catalogue', async () => {
    siteResult = { data: SITE_PB([MOCKUP()]), error: null };
    catalogProductsResult = { data: [{ id: 'cp-1', price: 34.25, currency: 'USD' }], error: null };
    const s2 = await fetchSiteLot3('ma-boutique');
    const [p] = m2pLot3(s2 as never);
    expect(p.priceNumber).toBe(34.25);
    expect(p.currency).toBe('USD');
    expect(p.currency).not.toBe('XXX');
  });

  it('une maquette dont le produit catalogue N\'EXISTE PAS est retiree de la vitrine', async () => {
    // Identifiant forge, ou produit retire du catalogue : plus rien a vendre.
    siteResult = { data: SITE_PB([MOCKUP({ catalog_product_id: 'inexistant' })]), error: null };
    catalogProductsResult = { data: [], error: null };
    const s2 = await fetchSiteLot3('ma-boutique');
    expect(m2pLot3(s2 as never)).toEqual([]);
  });

  it('sur PANNE de lecture, la vitrine reste en l\'etat plutot que de se vider', async () => {
    // Meme politique que `loadCatalogSelections` : une panne transitoire ne
    // doit pas fermer la boutique. Le checkout reste seul maitre du montant.
    siteResult = { data: SITE_PB([MOCKUP()]), error: null };
    catalogProductsResult = { data: null, error: { message: 'boom' } };
    const diagnostics: string[] = [];
    const s2 = await fetchSiteLot3('ma-boutique', false, diagnostics);
    expect(m2pLot3(s2 as never)).toHaveLength(1);
    expect(diagnostics.join(' ')).toContain('loadPodBrandCatalogPrices');
  });

  it('un site non-pod_brand n\'interroge JAMAIS `catalog_products` par ce chemin', async () => {
    fromCalls.length = 0;
    siteResult = { data: site({ mode: 3, dropship_type: 'reseller', pod_designs: [{ url: 'u', mockups: [MOCKUP()] }] }), error: null };
    await fetchSiteLot3('ma-boutique');
    expect(fromCalls).not.toContain('catalog_products');
  });
});
