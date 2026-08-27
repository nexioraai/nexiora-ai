import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// LOT K (Mode 3 global, fuites d'info) -- première couverture de cette
// route (aucune avant ce lot). Verrouille le correctif central : la réponse
// à un visiteur public ne doit JAMAIS contenir le coût fournisseur réel
// (`_cost`, ni `catalog_products.price` brut) ni aucune colonne non
// explicitement listée -- avant ce lot, `.select('*')` + `{...p}` exposaient
// silencieusement toute colonne future ajoutée à catalog_products, en plus
// du coût déjà identifié.

function tableChain(response: { data: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.not = vi.fn(self);
  chain.ilike = vi.fn(self);
  chain.in = vi.fn(self);
  chain.lte = vi.fn(self);
  chain.order = vi.fn(self);
  chain.range = vi.fn(self);
  chain.single = vi.fn(async () => response);
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { GET } from '../route';

// ETAPE 2 -- le fixture decrivait un site Mode 2, c'est-a-dire un site qui
// n'a AUCUN catalogue fournisseur a fouiller. Il decrivait donc un appel qui
// n'aurait jamais du aboutir. Correction de fixture seule : aucune assertion
// de ce fichier ne change de sens.
const SITE = { id: 'site-1', type: 'fashion store', mode: 3, dropship_type: 'reseller', cj_margin_percent: 30, cj_round_mode: null };

const GLOBAL_PRODUCT = {
  id: 'cp-1',
  supplier_id: 'cj',
  supplier_product_id: 'vid-1',
  name: 'Bracelet',
  description: 'A bracelet',
  category: 'jewelry',
  images: ['https://x.test/a.png'],
  variants: [{ vid: 'v1' }],
  price: 5, // coût fournisseur réel en base
  currency: 'usd',
  shipping_days_min: 3,
  shipping_days_max: 7,
  warehouse_country: 'US',
  in_stock: true,
  // Colonne hypothétique non listée dans le select explicite -- si le code
  // repassait à `{...p}`, elle réapparaîtrait dans la réponse.
  internal_sync_notes: 'ne doit jamais quitter le serveur',
};

function setupTables(overrides: Record<string, { data: unknown; error?: unknown; count?: number | null }> = {}) {
  fromMock.mockImplementation((table: string) => {
    if (table === 'sites') return tableChain(overrides.sites ?? { data: SITE, error: null });
    if (table === 'site_catalog_selections') return tableChain(overrides.site_catalog_selections ?? { data: [], error: null });
    if (table === 'catalog_products') return tableChain(overrides.catalog_products ?? { data: [GLOBAL_PRODUCT], error: null, count: 1 });
    throw new Error('unexpected table: ' + table);
  });
}

function req(params: Record<string, string>) {
  const url = new URL('https://woorri.test/api/catalog/search');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

beforeEach(() => {
  fromMock.mockReset();
});

describe('GET /api/catalog/search — LOT K : aucune fuite du coût fournisseur', () => {
  it("un produit du catalogue global n'expose jamais le coût brut (_cost) ni la colonne interne non listée", async () => {
    setupTables();
    const res = await GET(req({ slug: 'boutique', q: 'bracelet' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    const product = json.products.find((p: any) => p.id === 'catalog-cp-1');
    expect(product).toBeDefined();
    expect(product._cost).toBeUndefined();
    expect(product.internal_sync_notes).toBeUndefined();
    expect(product.in_stock).toBeUndefined();
  });

  it("le prix renvoyé est bien le prix MARQUÉ (avec marge), jamais le coût brut de la ligne DB", async () => {
    setupTables();
    const res = await GET(req({ slug: 'boutique', q: 'bracelet' }));
    const json = await res.json();
    const product = json.products.find((p: any) => p.id === 'catalog-cp-1');
    // cost=5, marge 30% -> prix marqué strictement supérieur au coût brut.
    expect(product.price).toBeGreaterThan(5);
  });

  it('le champ `price` transporte uniquement le prix marqué -- jamais le coût brut, même sous un autre nom', async () => {
    setupTables();
    const res = await GET(req({ slug: 'boutique', q: 'bracelet' }));
    const json = await res.json();
    const product = json.products.find((p: any) => p.id === 'catalog-cp-1');
    const values = Object.values(product);
    // Le coût brut (5) ne doit apparaître nulle part dans l'objet exposé.
    expect(values).not.toContain(5);
  });

  it('les champs légitimement attendus par le frontend (CatalogSearch.tsx) restent tous présents -- aucune régression fonctionnelle', async () => {
    setupTables();
    const res = await GET(req({ slug: 'boutique', q: 'bracelet' }));
    const json = await res.json();
    const product = json.products.find((p: any) => p.id === 'catalog-cp-1');
    expect(product).toEqual(expect.objectContaining({
      id: 'catalog-cp-1',
      supplier_id: 'cj',
      supplier_product_id: 'vid-1',
      name: 'Bracelet',
      description: 'A bracelet',
      category: 'jewelry',
      images: ['https://x.test/a.png'],
      variants: [{ vid: 'v1' }],
      currency: 'usd',
      shipping_days_min: 3,
      shipping_days_max: 7,
      warehouse_country: 'US',
    }));
  });
});

describe('GET /api/catalog/search — validation d\'entrée', () => {
  it('slug manquant -> 400', async () => {
    const res = await GET(req({ q: 'bracelet' }));
    expect(res.status).toBe(400);
  });

  it('site introuvable -> 404', async () => {
    setupTables({ sites: { data: null, error: null } });
    const res = await GET(req({ slug: 'inconnu' }));
    expect(res.status).toBe(404);
  });
});

// ============================================================
// LOT 2 -- LE CABLAGE DE L'ADMISSION, ENFIN COUVERT.
//
// LA MUTATION QUI SURVIVAIT. Retirer purement et simplement la garde
// d'admission de cette route ne cassait AUCUN test : la primitive etait
// testee comme FONCTION (`catalogAdmission.test.ts`), jamais comme CABLAGE.
// Une garde non cablee est une garde absente.
//
// `pod_brand` est le cas qui compte : il A un catalogue fournisseur
// (`hasSupplierCatalog(3)` est vrai, ses produits SONT des Printful), mais il
// n'utilise PAS `site_catalog_selections`. Une garde de mode seule le laissait
// donc passer.
// ============================================================

describe("GET /api/catalog/search — LOT 2 : l'admission au mecanisme de selection", () => {
  const VIDE = { products: [], total: 0, page: 1, page_size: 24, has_more: false };

  it.each([
    ['Mode 1 vitrine', { ...SITE, mode: 1, dropship_type: null }],
    ['Mode 2 boutique', { ...SITE, mode: 2, dropship_type: null }],
    ['Mode 3 pod_brand', { ...SITE, dropship_type: 'pod_brand' }],
    ['Mode 3 sans sous-type', { ...SITE, dropship_type: null }],
    ['Mode 3 sous-type inconnu', { ...SITE, dropship_type: 'legacy_mode_x' }],
  ])('%s -> reponse VIDE, et catalog_products n\'est jamais interrogee', async (_l, site) => {
    setupTables({ sites: { data: site, error: null } });
    const res = await GET(req({ slug: 'x', q: 'bracelet' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(VIDE);
    // Le contrat de reponse est identique au succes : un 403 apprendrait a un
    // rodeur que le slug existe.
    expect(fromMock).not.toHaveBeenCalledWith('catalog_products');
  });

  it.each(['reseller', 'pod_custom'])('Mode 3 %s -> la recherche fonctionne (chemin legitime)', async (t) => {
    setupTables({ sites: { data: { ...SITE, dropship_type: t }, error: null } });
    const json = await (await GET(req({ slug: 'x', q: 'bracelet' }))).json();
    expect(json.products).toHaveLength(1);
    expect(fromMock).toHaveBeenCalledWith('catalog_products');
  });
});

// ============================================================
// LOT 4 / R4-02 -- LA RECHERCHE DOIT TRANSPORTER L'EXIGENCE DE VARIANTE.
//
// `ProductModal` s'en sert pour decider si le bouton d'achat est actif. Sans
// ce champ, il retombe sur le proxy `variants.length > 0` -- qui s'effondre
// quand la liste revient vide et laisse ajouter au panier un article que le
// checkout refuse (garde `catalogStock`).
//
// La valeur est DERIVEE DE LA DONNEE : une ligne sans `supplier_parent_id`
// designe un PRODUIT (CJ : 25 006 lignes, 100 %), une ligne avec parent EST
// deja une variante (Printful 8 392, Gelato 182 : 0 %).
// ============================================================
describe('GET /api/catalog/search — LOT 4 : `requires_variant` derive de `supplier_parent_id`', () => {
  it('produit du catalogue GLOBAL sans parent (CJ) -> requires_variant = true', async () => {
    setupTables({ catalog_products: { data: [{ ...GLOBAL_PRODUCT, supplier_parent_id: null }], error: null, count: 1 } });
    const json = await (await GET(req({ slug: 'x', q: 'bracelet' }))).json();
    expect(json.products[0].requires_variant).toBe(true);
  });

  it('produit du catalogue GLOBAL avec parent (POD) -> requires_variant = false', async () => {
    setupTables({ catalog_products: { data: [{ ...GLOBAL_PRODUCT, supplier_id: 'printful', supplier_parent_id: 'parent-1' }], error: null, count: 1 } });
    const json = await (await GET(req({ slug: 'x', q: 'bracelet' }))).json();
    expect(json.products[0].requires_variant).toBe(false);
  });

  it('produit CURATED sans parent -> requires_variant = true', async () => {
    setupTables({
      site_catalog_selections: { data: [{
        id: 'sel-1', sell_price: null, custom_name: null, custom_description: null, catalog_product_id: 'cp-1',
        catalog_products: { ...GLOBAL_PRODUCT, supplier_parent_id: null },
      }], error: null },
      catalog_products: { data: [], error: null, count: 0 },
    });
    const json = await (await GET(req({ slug: 'x', q: 'bracelet' }))).json();
    const curated = json.products.find((p: { id: string }) => p.id === 'catalog-cp-1');
    expect(curated?.requires_variant).toBe(true);
  });

  it('produit CURATED avec parent -> requires_variant = false', async () => {
    setupTables({
      site_catalog_selections: { data: [{
        id: 'sel-1', sell_price: null, custom_name: null, custom_description: null, catalog_product_id: 'cp-1',
        catalog_products: { ...GLOBAL_PRODUCT, supplier_id: 'printful', supplier_parent_id: 'parent-1' },
      }], error: null },
      catalog_products: { data: [], error: null, count: 0 },
    });
    setupTables({
      sites: { data: { ...SITE, dropship_type: 'pod_custom' }, error: null },
      site_catalog_selections: { data: [{
        id: 'sel-1', sell_price: null, custom_name: null, custom_description: null, catalog_product_id: 'cp-1',
        catalog_products: { ...GLOBAL_PRODUCT, supplier_id: 'printful', supplier_parent_id: 'parent-1' },
      }], error: null },
      catalog_products: { data: [], error: null, count: 0 },
    });
    const json = await (await GET(req({ slug: 'x', q: 'bracelet' }))).json();
    const curated = json.products.find((p: { id: string }) => p.id === 'catalog-cp-1');
    expect(curated?.requires_variant).toBe(false);
  });
});

// ============================================================
// AUDIT GLOBAL — LES DEUX BRANCHES DE CETTE ROUTE SERVAIENT DEUX REGLES.
//
// La branche GLOBALE filtrait deja le fournisseur
// (`query2.in('supplier_id', allowedSuppliers)`). La branche CURATED, non.
// Le MEME visiteur, sur la MEME route, recevait donc deux contrats selon la
// branche qui repondait -- et le checkout refuse les lignes de la seconde
// (`catalog_supplier_not_eligible`).
//
// CE TEST EXISTE PARCE QU'UNE MUTATION A SURVECU : retirer le filtre de la
// branche curated ne faisait rougir aucun test.
// ============================================================
describe('AUDIT GLOBAL — la branche CURATED filtre le fournisseur comme la branche globale', () => {
  const curatedChez = (supplier: string) => ({
    site_catalog_selections: {
      data: [{
        id: 'sel-1', sell_price: null, custom_name: null, custom_description: null, catalog_product_id: 'cp-1',
        catalog_products: { ...GLOBAL_PRODUCT, supplier_id: supplier, supplier_parent_id: null },
      }],
      error: null,
    },
    catalog_products: { data: [], error: null, count: 0 },
  });

  it.each(['printful', 'gelato'])(
    'site reseller + selection curated %s -> le produit N’EST PAS servi',
    async (supplier) => {
      setupTables({ sites: { data: { ...SITE, dropship_type: 'reseller' }, error: null }, ...curatedChez(supplier) });
      const json = await (await GET(req({ slug: 'x', q: 'bracelet' }))).json();
      expect(json.products.some((p: { id: string }) => p.id === 'catalog-cp-1')).toBe(false);
    }
  );

  it('site pod_custom + selection curated cj -> le produit N’EST PAS servi', async () => {
    setupTables({ sites: { data: { ...SITE, dropship_type: 'pod_custom' }, error: null }, ...curatedChez('cj') });
    const json = await (await GET(req({ slug: 'x', q: 'bracelet' }))).json();
    expect(json.products.some((p: { id: string }) => p.id === 'catalog-cp-1')).toBe(false);
  });

  it.each([['reseller', 'cj'], ['pod_custom', 'printful']])(
    'site %s + selection curated %s -> servi (chemin legitime intact)',
    async (sousType, supplier) => {
      setupTables({ sites: { data: { ...SITE, dropship_type: sousType }, error: null }, ...curatedChez(supplier) });
      const json = await (await GET(req({ slug: 'x', q: 'bracelet' }))).json();
      expect(json.products.some((p: { id: string }) => p.id === 'catalog-cp-1')).toBe(true);
    }
  );

  it('une selection curated sans fournisseur n’est jamais servie', async () => {
    setupTables({
      sites: { data: { ...SITE, dropship_type: 'reseller' }, error: null },
      site_catalog_selections: {
        data: [{
          id: 'sel-1', sell_price: null, custom_name: null, custom_description: null, catalog_product_id: 'cp-1',
          catalog_products: { ...GLOBAL_PRODUCT, supplier_id: null, supplier_parent_id: null },
        }],
        error: null,
      },
      catalog_products: { data: [], error: null, count: 0 },
    });
    const json = await (await GET(req({ slug: 'x', q: 'bracelet' }))).json();
    expect(json.products.some((p: { id: string }) => p.id === 'catalog-cp-1')).toBe(false);
  });
});
