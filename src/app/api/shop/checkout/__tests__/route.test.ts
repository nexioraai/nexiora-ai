import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ============================================================
// Phase 1 — D1 : couverture de tests pour /api/shop/checkout, la route
// la plus critique financièrement du repository (aucune couverture
// avant ce correctif). Teste l'ORCHESTRATION de la route : résolution
// site, garde-fous stock/livraison/prix, garde-fous financiers Mode 3,
// et le chemin de succès (Mode 2 et Mode 3). checkStock/checkCatalogStock
// et le PaymentProvider sont mockés — ils ont leur propre couverture
// (catalog-stock.test.ts, tests payments) — ce fichier ne la duplique pas.
// ============================================================

const checkStockMock = vi.fn();
vi.mock('@/lib/shop', () => ({
  checkStock: (...a: unknown[]) => checkStockMock(...a),
}));

const checkCatalogStockMock = vi.fn();
vi.mock('@/lib/mode3/catalogStock', () => ({
  checkCatalogStock: (...a: unknown[]) => checkCatalogStockMock(...a),
}));

const createCheckoutMock = vi.fn();
vi.mock('@/lib/payments', () => ({
  getProvider: vi.fn(() => ({ createCheckout: (...a: unknown[]) => createCheckoutMock(...a) })),
}));

// PHASE 4 (docs/PLAN-SEPARATION-MODE2-MODE3.md) -- option A'.
//
// Le mock d'origine rendait une liste VIDE : « la Map derivee reste vide, ce
// qui laisse le fallback CJ (shipping_cache) ou le rejet Mode 3 s'exprimer
// exactement comme en production quand aucun adaptateur n'est disponible ».
// Cette hypothese reste vraie pour CJ -- elle est simplement completee.
//
// POURQUOI CE CHANGEMENT EST DEVENU NECESSAIRE. La decision produit D2
// interdit a une boutique Mode 2 de vendre du catalogue fournisseur. Les
// fixtures qui modelisaient un site Mode 2 porteur d'un sous-type Mode 3 --
// sites semantiquement impossibles -- ont donc ete requalifies vers de vrais
// sites Mode 3. Or le Mode 3 exige un devis fournisseur confirme, et un item
// POD ne peut en obtenir aucun sans adaptateur : le repli `shipping_cache`
// est reserve a CJ (resolveShipping.ts, `groups['cj']`).
//
// POURQUOI UN MOCK FIXE ET NON CONFIGURABLE PAR TEST. `SHIPPING_SUPPLIERS`
// est un const de niveau module dans resolveShipping.ts : il est evalue une
// seule fois, au chargement, donc AVANT tout `beforeEach`. Un mock modifiable
// par test n'aurait aucun effet. Rendre cette Map paresseuse aurait exige de
// modifier un fichier de production du chemin devis -- refuse, hors perimetre.
//
// RAYON D'ACTION NUL SUR L'EXISTANT, par construction : la boucle live fait
// `SHIPPING_SUPPLIERS.get(supplierId)` puis `continue` si absent. Un
// adaptateur enregistre sous `printful` est donc INERTE pour un groupe `cj`,
// qui conserve exactement son chemin actuel -- cache d'abord, rejet Mode 3
// sinon. Les quatre tests de rejet Mode 3 n'empruntent aucun groupe POD.
// Toutes les autres capacites conservent la liste vide.
const { stubPrintfulShipping } = vi.hoisted(() => ({
  stubPrintfulShipping: {
    id: 'printful',
    credentials: {},
    adapter: {
      calculateShipping: async () => ({
        total_cost: 5,
        estimated_days_min: 3,
        estimated_days_max: 7,
      }),
    },
  },
}));
vi.mock('@/lib/suppliers/registry', () => ({
  suppliersWithCapability: (capability: string) =>
    capability === 'calculateShipping' ? [stubPrintfulShipping] : [],
}));

const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({
  logAnomaly: (...a: unknown[]) => logAnomalyMock(...a),
}));

type Handlers = Record<string, { data: unknown; error?: unknown }>;

function tableChain(response: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.in = vi.fn(self);
  chain.insert = vi.fn(self);
  // .is('archived_at', null) -- filtre ajoute par l'audit ownership/RLS
  // (account/delete) pour exclure les sites archives du checkout.
  chain.is = vi.fn(self);
  // .single()/.maybeSingle() narrowent une reponse liste a une ligne — la
  // route interroge parfois la meme table via .in() (liste) et ailleurs via
  // .maybeSingle() (une ligne) ; ce mock reproduit ce narrowing plutot que
  // d'exiger une forme figee par table.
  const narrowed = Array.isArray(response.data)
    ? { data: response.data[0] ?? null, error: response.error ?? null }
    : response;
  chain.single = vi.fn(async () => narrowed);
  chain.maybeSingle = vi.fn(async () => narrowed);
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { POST } from '../route';

// F1/F2/F3/F6 (prochaine priorite Mode 2) : checkout/route.ts appelle
// .from('shop_products') PLUSIEURS fois par requete (bloc livraison, puis
// bloc prix) -- un chain frais par appel masquerait les .eq() poses par la
// requete de prix (celle qui doit desormais filtrer site_id + published).
// Un seul chain reutilise par table, cree paresseusement, permet
// d'inspecter chain.eq.mock.calls apres coup pour verifier QUELS filtres
// ont reellement ete poses, peu importe combien de fois la table a ete
// interrogee dans la requete.
function setupTables(handlers: Handlers, fallback: { data: unknown; error?: unknown } = { data: null, error: null }) {
  const chains = new Map<string, ReturnType<typeof tableChain>>();
  fromMock.mockImplementation((table: string) => {
    if (!chains.has(table)) chains.set(table, tableChain(handlers[table] ?? fallback));
    return chains.get(table)!;
  });
  return chains;
}

function req(body: unknown) {
  return new Request('https://woorri.test/api/shop/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const SITE_MODE2 = { id: 'site-1', payment_provider: 'stripe', payment_account_id: 'acct_1', shipping_flat: 5, mode: 2, cj_margin_percent: null, cj_round_mode: null };
// LOT 1 / L1-03 -- `dropship_type` AJOUTE, et c'est un constat : cette
// fixture Mode 3 n'en portait aucun, si bien que TOUS les tests catalogue
// ci-dessous transitaient par le repli `default -> ['cj']`. Le banc
// reproduisait l'etat des 3 sites de production defectueux. Les tests qui
// visent l'absence de sous-type l'ecrivent explicitement.
const SITE_MODE3 = { ...SITE_MODE2, mode: 3, dropship_type: 'reseller' };

beforeEach(() => {
  fromMock.mockReset();
  checkStockMock.mockReset();
  checkCatalogStockMock.mockReset();
  createCheckoutMock.mockReset();
  logAnomalyMock.mockReset();
  checkStockMock.mockResolvedValue({ ok: true });
  checkCatalogStockMock.mockResolvedValue({ ok: true });
  createCheckoutMock.mockResolvedValue({ url: 'https://pay.example/session', orderId: 'sess_123' });
});

describe('POST /api/shop/checkout — validation d\'entrée', () => {
  it('slug manquant -> 400, aucun appel DB', async () => {
    const res = await POST(req({ items: [{ id: 'p1', quantity: 1 }] }));
    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('panier vide -> 400', async () => {
    const res = await POST(req({ slug: 'boutique', items: [] }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/shop/checkout — résolution du site (tenant)', () => {
  it('site introuvable -> 404', async () => {
    setupTables({ sites: { data: null, error: null } });
    const res = await POST(req({ slug: 'inconnu', items: [{ id: 'p1', quantity: 1 }] }));
    expect(res.status).toBe(404);
  });

  it('site sans paiement configuré -> 400, refus avant toute vérification stock', async () => {
    setupTables({ sites: { data: { ...SITE_MODE2, payment_account_id: null }, error: null } });
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1 }] }));
    expect(res.status).toBe(400);
    expect(checkStockMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/shop/checkout — stock', () => {
  it('checkStock (produits boutique) refuse -> 409 avec la raison exacte', async () => {
    setupTables({ sites: { data: SITE_MODE2, error: null } });
    checkStockMock.mockResolvedValue({ ok: false, reason: 'Stock insuffisant pour "T-Shirt" (0 disponible)' });
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1 }] }));
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toBe('Stock insuffisant pour "T-Shirt" (0 disponible)');
  });

  it('checkCatalogStock (produits catalogue, ex. Gelato/CJ) refuse -> 409, jamais de session créée', async () => {
    setupTables({ sites: { data: SITE_MODE3, error: null } });
    checkCatalogStockMock.mockResolvedValue({ ok: false, reason: '"Mug" n\'est plus disponible.' });
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'catalog-abc', quantity: 1 }], countryCode: 'US' }));
    expect(res.status).toBe(409);
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/shop/checkout — Mode 3 : livraison', () => {
  it('pays non couvert -> 409 + logAnomaly(shipping_country_unsupported)', async () => {
    setupTables({ sites: { data: SITE_MODE3, error: null } });
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1 }], countryCode: 'ZZ' }));
    expect(res.status).toBe(409);
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'shipping_country_unsupported', siteId: 'site-1' }));
  });

  it('aucun cout de livraison resolu (pas de cache, pas d\'adaptateur live) -> 409 + logAnomaly(shipping_not_resolved)', async () => {
    setupTables({
      sites: { data: SITE_MODE3, error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: null }], error: null },
    });
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1 }], countryCode: 'US' }));
    expect(res.status).toBe(409);
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'shipping_not_resolved' }));
  });
});

describe('POST /api/shop/checkout — prix serveur (jamais celui du client)', () => {
  it('produit catalogue sans cout connu -> 409 + logAnomaly(catalog_cost_missing)', async () => {
    // PHASE 5 / F3+F5 -- fixture REQUALIFIE, assertions inchangees.
    // Deux causes mecaniques, aucune liee au comportement teste :
    //   1. le site etait Mode 2 : depuis que D2 precede les appels
    //      fournisseur, un panier catalogue y est refuse AVANT la passe de
    //      prix. `catalog_cost_missing` n'est plus joignable qu'en Mode 3 --
    //      le scenario, pas l'assertion, avait cesse d'exister ;
    //   2. `catalog_products` etait un OBJET la ou la garde d'admission
    //      interroge la table via .in() (donc un TABLEAU). Meme piege qu'en
    //      phase 4 : l'exception etait avalee par le catch global et rendait
    //      un 500 indistinguable d'un refus metier.
    // `shipping_cache` est ajoute parce que le Mode 3 exige un devis resolu
    // avant d'atteindre la passe de prix. Le cout catalogue reste 0 : c'est
    // exactement ce que ce test verifie.
    setupTables({
      sites: { data: SITE_MODE3, error: null },
      catalog_products: { data: [{ id: 'abc', price: 0, currency: 'usd', supplier_id: 'cj', supplier_product_id: 'vid-1' }], error: null },
      site_catalog_selections: { data: null, error: null },
      shipping_cache: { data: [{ supplier_product_id: 'vid-1', shipping_cost: 5, days_min: 10, days_max: 20, tiers: null }], error: null },
    });
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'catalog-abc', quantity: 1 }], countryCode: 'US' }));
    expect(res.status).toBe(409);
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'catalog_cost_missing' }));
  });
});

describe('POST /api/shop/checkout — garde-fous financiers Mode 3', () => {
  // LOT L -- cj_vid retiré du fixture shop_products (voir describe LOT L
  // plus bas : un item shop_products Mode 3 avec cj_vid réel est désormais
  // bloqué, cf. bug cost_price corrigé). Ce test cible le garde-fou
  // shipping_out_of_range, pas le chemin dropship shop_products -- utilise
  // un item catalogue (cj), seul chemin CJ réellement exerçable ici (aucun
  // adaptateur live mocké dans ce fichier, voir commentaire en tête).
  function setupCjCacheShipping(shippingCost: number) {
    setupTables({
      sites: { data: SITE_MODE3, error: null },
      // Tableau, pas un objet unique : la boucle de calcul de livraison
      // interroge catalog_products via .in('id', realIds) SANS .maybeSingle()
      // (contrairement à la boucle de prix, qui narrow bien un tableau vers
      // sa 1ère ligne) -- un objet unique y serait non itérable, l'exception
      // silencieusement avalée par le try/catch englobant produirait à tort
      // shipping_not_resolved au lieu du comportement réellement testé ici.
      catalog_products: { data: [{ id: 'cp-1', price: 10, currency: 'usd', supplier_id: 'cj', supplier_product_id: 'vid-1' }], error: null },
      site_catalog_selections: { data: null, error: null },
      shipping_cache: { data: [{ supplier_product_id: 'vid-1', shipping_cost: shippingCost, days_min: 10, days_max: 20, tiers: null }], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });
  }

  it('livraison hors plage raisonnable (>150) -> 409 + logAnomaly(shipping_out_of_range), Nexiora n\'absorbe jamais un cout excessif', async () => {
    setupCjCacheShipping(150); // *1.20 (marge cache) = 180 > 150
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'catalog-cp-1::vid-1', quantity: 1 }], countryCode: 'US' }));
    expect(res.status).toBe(409);
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'shipping_out_of_range' }));
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/shop/checkout — succès (chemin critique métier)', () => {
  it('Mode 2 : checkout créé, applicationFeeAmount = 0 (le marchand garde son stock/livraison)', async () => {
    setupTables({
      sites: { data: SITE_MODE2, error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: true, for_sale: true }], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });

    const res = await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'usd' }] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.url).toBe('https://pay.example/session');
    expect(createCheckoutMock).toHaveBeenCalledWith(
      'acct_1', 'boutique', expect.anything(), expect.anything(), expect.anything(),
      5, // shippingAmount = site.shipping_flat (Mode 2 : pas de calcul fournisseur)
      0, // applicationFeeAmount = 0 en Mode 2
      undefined, // aucun checkoutNonce fourni par ce test -> comportement historique
      0 // aucune remise promo (passe de cloture) -- aucun promoCode transmis
    );
  });

  it('Mode 3 : checkout créé via le cache CJ (item catalogue), applicationFeeAmount = coût fournisseur + livraison + commission Nexiora', async () => {
    // LOT L -- item shop_products remplacé par un item catalogue (cj) : un
    // item shop_products Mode 3 avec cj_vid réel est désormais bloqué (bug
    // cost_price corrigé, voir describe LOT L plus bas) -- le chemin
    // "checkout Mode 3 via cache CJ" réellement atteignable passe par le
    // catalogue, jamais par shop_products.cj_vid (aucun chemin d'écriture
    // ne le peuple jamais, confirmé exhaustivement).
    setupTables({
      sites: { data: SITE_MODE3, error: null },
      catalog_products: { data: [{ id: 'cp-1', price: 10, currency: 'usd', supplier_id: 'cj', supplier_product_id: 'vid-1' }], error: null },
      site_catalog_selections: { data: null, error: null },
      shipping_cache: { data: [{ supplier_product_id: 'vid-1', shipping_cost: 5, days_min: 10, days_max: 20, tiers: null }], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });

    const res = await POST(req({ slug: 'boutique', items: [{ id: 'catalog-cp-1::vid-1', quantity: 1, name: 'T-Shirt', currency: 'usd' }], countryCode: 'US' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.url).toBe('https://pay.example/session');
    // cost=10, marge par défaut 100% -> serverPrice=20 ; commission = 20*0.06 = 1.2
    // shipping = 5 * 1.20 (marge cache) = 6
    // applicationFeeAmount = supplierCost(10) + shipping(6) + commission(1.2) = 17.2
    expect(createCheckoutMock).toHaveBeenCalledWith(
      'acct_1', 'boutique', expect.anything(), expect.anything(), expect.anything(),
      6,
      17.2,
      undefined, // aucun checkoutNonce fourni par ce test -> comportement historique
      0 // aucune remise promo (passe de cloture) -- aucun promoCode transmis
    );
  });
});

describe('POST /api/shop/checkout — LOT L : bug actif cost_price corrigé (shop_products)', () => {
  // Cause racine : `.select('price, cost_price, ...')` interrogeait une
  // colonne INEXISTANTE sur shop_products (confirmé par introspection
  // PostgREST en direct) -- l'erreur PostgREST résultante n'était jamais
  // vérifiée (`const { data: sp } = ...`), donc `sp` valait TOUJOURS null,
  // et TOUT achat shop_products (Mode 2 ET Mode 3) était rejeté à tort --
  // un bug de production actif, pas de la dette morte.

  it("REGRESSION CIBLÉE : une erreur PostgREST réelle sur la requête shop_products (colonne inexistante, ou toute autre panne) est désormais détectée explicitement -> 409 shop_product_query_failed, jamais confondue avec 'produit introuvable'", async () => {
    setupTables({
      sites: { data: SITE_MODE2, error: null },
      shop_products: { data: null, error: { message: 'column shop_products.cost_price does not exist', code: '42703' } },
    });
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'usd' }] }));
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'shop_product_query_failed',
      details: expect.objectContaining({ error: 'column shop_products.cost_price does not exist' }),
    }));
    expect(json.error).toBe('Produit indisponible');
  });

  it('Mode 2, produit shop_products SANS cj_vid -> checkout réussi (le coût fournisseur ne concerne jamais un item non dropshippé)', async () => {
    setupTables({
      sites: { data: SITE_MODE2, error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: true, for_sale: true }], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'usd' }] }));
    expect(res.status).toBe(200);
  });

  it('Mode 3, panier mixte (item catalogue CJ + item shop_products SANS cj_vid) -> checkout réussi : le second n\'engage aucun coût Nexiora et ne bloque pas le premier', async () => {
    // Mode 3 exige une livraison résolue (countryCode + au moins un
    // fournisseur CJ dans le panier) -- un panier composé UNIQUEMENT d'un
    // item shop_products non-dropshippé ne peut structurellement jamais
    // résoudre de livraison sur ce mode (limitation préexistante, hors
    // périmètre de ce correctif) ; le panier mixte est le scénario réel où
    // la correction de ce lot importe : le second item ne doit plus jamais
    // être rejeté à tort par la (fausse) exigence de cost_price.
    setupTables({
      sites: { data: SITE_MODE3, error: null },
      catalog_products: { data: [{ id: 'cp-1', price: 10, currency: 'usd', supplier_id: 'cj', supplier_product_id: 'vid-1' }], error: null },
      site_catalog_selections: { data: null, error: null },
      shipping_cache: { data: [{ supplier_product_id: 'vid-1', shipping_cost: 5, days_min: 10, days_max: 20, tiers: null }], error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: true, for_sale: true }], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }, { id: 'item-2' }], error: null },
    });
    const res = await POST(req({
      slug: 'boutique',
      items: [
        { id: 'catalog-cp-1::vid-1', quantity: 1, name: 'Item CJ', currency: 'usd' },
        { id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'usd' },
      ],
      countryCode: 'US',
    }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.url).toBe('https://pay.example/session');
    expect(logAnomalyMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'shop_product_dropship_cost_unknown' }));
    expect(logAnomalyMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'shop_product_query_failed' }));
  });

  it("Mode 3, produit shop_products AVEC cj_vid réellement rempli -> 409 (défense en profondeur : coût fournisseur inconnu, aucune trace de ce cas dans l'app aujourd'hui mais bloqué si jamais atteint)", async () => {
    setupTables({
      sites: { data: SITE_MODE3, error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: 'vid-1', price: 30, currency: 'usd', published: true, for_sale: true }], error: null },
      // Nécessaire pour que la résolution de livraison réussisse et que le
      // flux atteigne réellement la boucle de prix (où vit la garde testée)
      // -- sans cache, la commande serait rejetée plus tôt (shipping_not_resolved),
      // ce qui ne prouverait pas la garde ciblée par ce test.
      shipping_cache: { data: [{ supplier_product_id: 'vid-1', shipping_cost: 5, days_min: 10, days_max: 20, tiers: null }], error: null },
    });
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'usd' }], countryCode: 'US' }));
    expect(res.status).toBe(409);
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'shop_product_dropship_cost_unknown' }));
  });
});

// D2 (phase 4) : fixture requalifie de SITE_MODE2 vers SITE_MODE3. Il
// modelisait un site Mode 2 portant un sous-type Mode 3 -- site
// semantiquement impossible ; SITE_MODE2 servait de base commode et le
// mode etait incident. AUCUNE assertion modifiee.
// ============================================================
// ÉTAPE 8, VOLET A — LA VISIBILITÉ ET L'ACHETABILITÉ SONT DEUX FAITS.
//
// Jusqu'ici `published` décidait des deux : un marchand ne pouvait ni exposer
// un produit sans le vendre (catalogue, vitrine, rupture assumée), ni le
// retirer de la vente sans le faire disparaître de sa vitrine, de sa fiche
// produit ET du sitemap. Un booléen ne porte pas trois états.
//
// Ces tests verrouillent la seule chose qui compte ici : l'achat exige LES
// DEUX, et la conjonction n'ouvre RIEN — elle est strictement plus
// restrictive que la règle antérieure.
// ============================================================
describe("POST /api/shop/checkout — ÉTAPE 8, VOLET A : `published` ET `for_sale`", () => {
  function panier(produit: Record<string, unknown>) {
    setupTables({
      sites: { data: SITE_MODE2, error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'usd', ...produit }], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });
    return POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'usd' }] }));
  }

  it('published=true, for_sale=true -> ACHAT ACCEPTÉ (le seul cas qui vend)', async () => {
    const res = await panier({ published: true, for_sale: true });
    expect(res.status).toBe(200);
    expect(logAnomalyMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'shop_product_not_purchasable' })
    );
  });

  it('published=true, for_sale=false -> 409 : présenté, mais pas payable', async () => {
    const res = await panier({ published: true, for_sale: false });
    expect(res.status).toBe(409);
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'shop_product_not_purchasable' })
    );
    // C'est LA capacité que ce volet ajoute. Avant lui, ce refus n'était
    // atteignable qu'en dépubliant — donc en effaçant le produit de la
    // vitrine, de sa fiche et du sitemap.
  });

  it('published=false, for_sale=true -> 409 : dépublier retire toujours de la vente', async () => {
    const res = await panier({ published: false, for_sale: true });
    expect(res.status).toBe(409);
    // NON-RÉGRESSION CRITIQUE. Si `for_sale` avait REMPLACÉ `published` au
    // lieu de s'y ajouter, ce cas serait devenu ACHETABLE : un client ayant
    // déjà l'article au panier au moment où le marchand le dépublie aurait
    // pu payer. Ce refus existait avant le volet A ; il doit lui survivre.
  });

  it('published=false, for_sale=false -> 409', async () => {
    expect((await panier({ published: false, for_sale: false })).status).toBe(409);
  });

  it('FAIL-CLOSED : `for_sale` absent de la lecture -> 409, jamais un achat', async () => {
    // `for_sale` est NOT NULL en base : son absence ici ne peut venir que
    // d'une projection modifiée ou d'un chemin d'écriture inconnu. Un produit
    // dont on ne sait pas s'il est vendable ne se vend pas. C'est le même
    // choix que `track_inventory !== false` à l'étape 5, appliqué au sens
    // strict : ici l'inconnu REFUSE, parce qu'il s'agit d'encaisser.
    expect((await panier({ published: true })).status).toBe(409);
  });

  it('FAIL-CLOSED : `published` absent de la lecture -> 409 (garde antérieure intacte)', async () => {
    expect((await panier({ for_sale: true })).status).toBe(409);
  });

  it('`for_sale` est réellement projeté par la requête produit', async () => {
    // Une garde portant sur un champ non demandé au SELECT serait inerte :
    // `sp.for_sale` vaudrait `undefined` pour TOUS les produits, et la
    // boutique entière cesserait de vendre. Ce test rend l'oubli visible.
    const chains = setupTables({
      sites: { data: SITE_MODE2, error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: true, for_sale: true }], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });
    await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'usd' }] }));
    const chain = chains.get('shop_products') as unknown as { select: Mock };
    const selects: string[] = chain.select.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(selects.some((sel: string) => sel.includes('for_sale'))).toBe(true);
  });
});

describe('POST /api/shop/checkout — POD BRAND : design résolu côté serveur, jamais celui du client', () => {
  // Audit Mode 3/POD BRAND, perfectionnement -- cause racine double : (1)
  // securite -- customDesignUrl/customDesigns venaient du panier client
  // sans jamais etre verifies, permettant de faire fabriquer une image
  // arbitraire (Nexiora avance le cout fournisseur en Mode 3) ; (2)
  // fonctionnel -- symetriquement, le frontend POD BRAND legitime
  // (mockupsToProducts, shared.tsx) ne renseignait JAMAIS customDesignUrl :
  // un achat POD BRAND normal partait deja en fabrication SANS AUCUN
  // design attache. Mode 2 utilise ici (au lieu de Mode 3) pour isoler le
  // comportement teste des garde-fous de livraison Mode 3, sans rapport
  // avec cette resolution -- dropship_type/pod_designs sont independants
  // du champ mode.
  const SITE_POD_BRAND = {
    ...SITE_MODE3,
    dropship_type: 'pod_brand',
    pod_designs: [{
      url: 'https://sb.example/storage/v1/object/public/pod-designs/boutique/brand-design.png',
      mockups: [
        { catalog_product_id: 'cp-1', variant_id: 111, design_url: 'https://sb.example/storage/v1/object/public/pod-designs/boutique/brand-design.png', mockup_url: 'https://storage.example/mockup.png' },
      ],
    }],
  };

  // ============================================================
  // LOT 3 / L3-03 -- LA MAQUETTE EST CHERCHEE DANS TOUS LES DESIGNS.
  //
  // Cette resolution ne lisait que `pod_designs[0].mockups`, alors que la
  // vitrine (`mockupsToProducts`) parcourt tous les designs. Une maquette
  // portee par un design d'index >= 1 s'affichait, se vendait, et repartait
  // en fabrication AVEC UN DESIGN VIDE -- aux frais de la plateforme, qui
  // avance le cout fournisseur. Mutation P4, survivante avant ce lot.
  // ============================================================
  // LOT 3 / L3-04 -- URL REALISTE : le prefixe de stockage reel est
  // `pod-designs/<slug>/`, et le checkout exige desormais que le design
  // appartienne a CE site. Une fixture hors prefixe ne decrirait plus un
  // design legitime.
  const DESIGN_B = 'https://sb.example/storage/v1/object/public/pod-designs/boutique/design-b.png';
  const SITE_DEUX_DESIGNS = {
    ...SITE_MODE3,
    dropship_type: 'pod_brand',
    pod_designs: [
      { url: 'https://sb.example/storage/v1/object/public/pod-designs/boutique/design-a.png', mockups: [] },
      {
        url: DESIGN_B,
        mockups: [
          { catalog_product_id: 'cp-1', variant_id: 111, design_url: DESIGN_B, mockup_url: 'https://storage.example/mockup-b.png' },
        ],
      },
    ],
  };

  // ============================================================
  // LOT 3 / ANOMALIE A -- LE SCENARIO FALSIFICATEUR, AU CHECKOUT REEL.
  //
  // designs[0] portait une maquette PERIMEE du meme produit que designs[1].
  // La vitrine l'ecartait, ce checkout la retenait : le visiteur voyait le
  // design B et le fournisseur recevait l'ancien. Les deux couches
  // interrogent desormais la meme fonction (`sellablePodBrandMockups`).
  // ============================================================
  const U_ANCIEN = 'https://sb.example/storage/v1/object/public/pod-designs/boutique/ANCIEN.png';
  const SITE_MAQUETTE_PERIMEE = {
    ...SITE_MODE3,
    dropship_type: 'pod_brand',
    pod_designs: [
      { url: 'https://sb.example/storage/v1/object/public/pod-designs/boutique/design-a.png',
        mockups: [{ catalog_product_id: 'cp-1', variant_id: 111, design_url: U_ANCIEN, mockup_url: 'https://x/ancien.png' }] },
      { url: DESIGN_B,
        mockups: [{ catalog_product_id: 'cp-1', variant_id: 111, design_url: DESIGN_B, mockup_url: 'https://x/b.png' }] },
    ],
  };

  it('SCENARIO FALSIFICATEUR — une maquette PERIMEE de designs[0] n\'est jamais celle qui part en fabrication', async () => {
    const chains = setupTables({
      sites: { data: SITE_MAQUETTE_PERIMEE, error: null },
      catalog_products: { data: [{ id: 'cp-1', supplier_product_id: 'sp-1', price: 20, currency: 'usd', supplier_id: 'printful' }], error: null },
      site_catalog_selections: { data: null, error: null },
      shipping_cache: { data: [{ supplier_product_id: 'sp-1', shipping_cost: 5, days_min: 10, days_max: 20, tiers: null }], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
      order_item_designs: { data: [{ id: 'd-1' }], error: null },
    });
    const res = await POST(req({ slug: 'boutique', countryCode: 'US', items: [{ id: 'catalog-cp-1', quantity: 1, name: 'T' }] }));
    expect(res.status).toBe(200);
    const lignes = JSON.stringify((chains.get('order_item_designs') as any)?.insert?.mock?.calls?.[0]?.[0] ?? []);
    expect(lignes).toContain(DESIGN_B);
    expect(lignes).not.toContain('ANCIEN.png');
  });

  it('une maquette SANS catalog_product_id ne devient jamais une ligne vendue', async () => {
    const chains = setupTables({
      sites: { data: { ...SITE_MODE3, dropship_type: 'pod_brand', pod_designs: [{
        url: DESIGN_B,
        mockups: [{ variant_id: 111, design_url: DESIGN_B, mockup_url: 'https://x/b.png' }],
      }] }, error: null },
      catalog_products: { data: [{ id: 'cp-1', supplier_product_id: 'sp-1', price: 20, currency: 'usd', supplier_id: 'printful' }], error: null },
      site_catalog_selections: { data: null, error: null },
      shipping_cache: { data: [{ supplier_product_id: 'sp-1', shipping_cost: 5, days_min: 10, days_max: 20, tiers: null }], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });
    const res = await POST(req({ slug: 'boutique', countryCode: 'US', items: [{ id: 'catalog-cp-1', quantity: 1, name: 'T' }] }));
    expect(res.status).toBe(200);
    // Aucun design attache : la maquette n'etait pas vendable.
    expect(chains.get('order_item_designs')).toBeUndefined();
  });

  it('une maquette portee par le SECOND design part bien en fabrication AVEC son design', async () => {
    const chains = setupTables({
      sites: { data: SITE_DEUX_DESIGNS, error: null },
      catalog_products: { data: [{ id: 'cp-1', supplier_product_id: 'sp-1', price: 20, currency: 'usd', supplier_id: 'printful' }], error: null },
      site_catalog_selections: { data: null, error: null },
      shipping_cache: { data: [{ supplier_product_id: 'sp-1', shipping_cost: 5, days_min: 10, days_max: 20, tiers: null }], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
      order_item_designs: { data: [{ id: 'd-1' }], error: null },
    });
    const res = await POST(req({
      slug: 'boutique',
      countryCode: 'US',
      items: [{ id: 'catalog-cp-1', quantity: 1, name: 'T-Shirt' }],
    }));
    expect(res.status).toBe(200);
    const lignes = (chains.get('order_item_designs') as any)?.insert?.mock?.calls?.[0]?.[0];
    expect(lignes, 'aucune ligne order_item_designs creee').toBeTruthy();
    expect(JSON.stringify(lignes)).toContain(DESIGN_B);
  });

  it('le design du BON design est retenu quand deux designs coexistent', async () => {
    // Design A ne porte aucune maquette de `cp-1` : c'est bien celle de B qui
    // doit etre retenue, jamais un repli sur l'index 0.
    const chains = setupTables({
      sites: { data: SITE_DEUX_DESIGNS, error: null },
      catalog_products: { data: [{ id: 'cp-1', supplier_product_id: 'sp-1', price: 20, currency: 'usd', supplier_id: 'printful' }], error: null },
      site_catalog_selections: { data: null, error: null },
      shipping_cache: { data: [{ supplier_product_id: 'sp-1', shipping_cost: 5, days_min: 10, days_max: 20, tiers: null }], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
      order_item_designs: { data: [{ id: 'd-1' }], error: null },
    });
    await POST(req({ slug: 'boutique', countryCode: 'US', items: [{ id: 'catalog-cp-1', quantity: 1, name: 'T' }] }));
    const lignes = JSON.stringify((chains.get('order_item_designs') as any)?.insert?.mock?.calls?.[0]?.[0] ?? []);
    expect(lignes).toContain(DESIGN_B);
    expect(lignes).not.toContain('design-a.png');
  });

  // ============================================================
  // LOT 3 / L3-04 -- UN DESIGN QUI N'APPARTIENT PAS AU SITE.
  //
  // `pod_designs` est ecrit par le marchand en PostgREST direct. Il pouvait
  // donc pointer `design_url` vers n'importe quelle image publique -- dont
  // celle d'une AUTRE boutique -- et la plateforme, qui avance le cout
  // fournisseur, la faisait fabriquer. `pod_custom` avait `design_uploads`
  // (lie au site, usage unique) ; `pod_brand` n'avait rien.
  // ============================================================
  const SITE_DESIGN_ETRANGER = {
    ...SITE_MODE3,
    dropship_type: 'pod_brand',
    pod_designs: [{
      url: 'https://sb.example/storage/v1/object/public/pod-designs/AUTRE-BOUTIQUE/vole.png',
      mockups: [
        { catalog_product_id: 'cp-1', variant_id: 111, design_url: 'https://sb.example/storage/v1/object/public/pod-designs/AUTRE-BOUTIQUE/vole.png', mockup_url: 'https://x/m.png' },
      ],
    }],
  };

  it.each([
    ['le design d\'une AUTRE boutique', SITE_DESIGN_ETRANGER],
    ['une URL arbitraire hors stockage', {
      ...SITE_MODE3, dropship_type: 'pod_brand',
      pod_designs: [{ url: 'https://evil.example/x.png', mockups: [{ catalog_product_id: 'cp-1', variant_id: 111, design_url: 'https://evil.example/x.png', mockup_url: 'https://x/m.png' }] }],
    }],
  ])('%s n\'est JAMAIS attache a la commande, et l\'anomalie est tracee', async (_l, site) => {
    const chains = setupTables({
      sites: { data: site, error: null },
      catalog_products: { data: [{ id: 'cp-1', supplier_product_id: 'sp-1', price: 20, currency: 'usd', supplier_id: 'printful' }], error: null },
      site_catalog_selections: { data: null, error: null },
      shipping_cache: { data: [{ supplier_product_id: 'sp-1', shipping_cost: 5, days_min: 10, days_max: 20, tiers: null }], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });
    const res = await POST(req({ slug: 'boutique', countryCode: 'US', items: [{ id: 'catalog-cp-1', quantity: 1, name: 'T' }] }));
    expect(res.status).toBe(200);
    // La vente aboutit, mais SANS design : fail-closed, jamais un design etranger.
    expect(chains.get('order_item_designs')).toBeUndefined();
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pod_brand_design_foreign_url' })
    );
  });

  it('un customDesignUrl injecté par le client est ignoré : le design réellement envoyé au fournisseur est celui du mockup généré par le marchand', async () => {
    const chains = setupTables({
      sites: { data: SITE_POD_BRAND, error: null },
      catalog_products: { data: [{ id: 'cp-1', supplier_product_id: 'sp-1', price: 20, currency: 'usd', supplier_id: 'printful' }], error: null },
      site_catalog_selections: { data: null, error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });

    const res = await POST(req({
      slug: 'boutique',
      countryCode: 'US',
      items: [{
        id: 'catalog-cp-1::111',
        quantity: 1,
        name: 'T-Shirt brandé',
        // Tentative d'injection : image totalement étrangère au mockup réellement généré.
        customDesignUrl: 'https://evil.example/anything.png',
      }],
    }));

    expect(res.status).toBe(200);
    const designsChain = chains.get('order_item_designs');
    expect(designsChain?.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        order_item_id: 'item-1',
        design_url: 'https://sb.example/storage/v1/object/public/pod-designs/boutique/brand-design.png',
        placement: 'front',
      }),
    ]);
  });

  it("produit catalogue vendu sur un site pod_brand SANS mockup correspondant -> aucun design attaché (rien à injecter)", async () => {
    const siteNoMockup = { ...SITE_POD_BRAND, pod_designs: [{ url: 'x', mockups: [] }] };
    const chains = setupTables({
      sites: { data: siteNoMockup, error: null },
      catalog_products: { data: [{ id: 'cp-1', supplier_product_id: 'sp-1', price: 20, currency: 'usd', supplier_id: 'printful' }], error: null },
      site_catalog_selections: { data: null, error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });

    const res = await POST(req({
      slug: 'boutique',
      countryCode: 'US',
      items: [{ id: 'catalog-cp-1::111', quantity: 1, name: 'Produit', customDesignUrl: 'https://evil.example/anything.png' }],
    }));

    expect(res.status).toBe(200);
    // designRows reste vide (aucun match) -> order_item_designs jamais interrogee.
    expect(chains.get('order_item_designs')).toBeUndefined();
  });
});

describe('POST /api/shop/checkout — F-CUSTOM-02/03 : un design client n\'atteint jamais un site non pod_custom/pod_brand', () => {
  // Audit Mode 3 global -- avant ce correctif, seule dropship_type ===
  // 'pod_brand' declenchait un effacement du design client ; toute autre
  // valeur (reseller, null, undefined, valeur inattendue) laissait passer
  // customDesignUrl/customDesigns tels quels. Politique desormais explicite
  // et fail-closed : liste d'autorisation (pod_brand, pod_custom), pas de
  // liste de refus.
  const SITE_RESELLER = { ...SITE_MODE3, dropship_type: 'reseller' };
  const SITE_NULL_TYPE = { ...SITE_MODE3, dropship_type: null };
  const SITE_UNDEFINED_TYPE = (() => {
    const s: any = { ...SITE_MODE3 };
    delete s.dropship_type;
    return s;
  })();
  const SITE_UNEXPECTED_TYPE = { ...SITE_MODE3, dropship_type: 'legacy_mode_x' };
  const SITE_POD_CUSTOM = { ...SITE_MODE3, dropship_type: 'pod_custom' };

  // N1 (audit Mode 3 global) -- le checkout revalide desormais aussi que
  // catalog_products.supplier_id correspond au dropship_type du site ; ces
  // tests portent sur le gating du DESIGN, pas sur l'eligibilite fournisseur
  // (deja testee separement, describe N1 plus bas) -- supplierId choisi ici
  // pour etre TOUJOURS eligible au dropship_type teste, afin d'isoler
  // strictement le comportement etudie.
  function setupWithSite(site: unknown, supplierId: string = 'cj') {
    return setupTables({
      sites: { data: site, error: null },
      catalog_products: { data: [{ id: 'cp-1', supplier_product_id: 'sp-1', price: 20, currency: 'usd', supplier_id: supplierId }], error: null },
      // Mode 3 exige un devis confirme : pour un item CJ il vient du cache
      // (resolveShipping reserve ce repli a CJ). Completion de fixture.
      shipping_cache: { data: [{ supplier_product_id: 'sp-1', shipping_cost: 5, days_min: 10, days_max: 20, tiers: null }], error: null },
      site_catalog_selections: { data: null, error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });
  }

  it('dropship_type=reseller -> customDesignUrl injecté est supprimé, aucun order_item_designs créé', async () => {
    const chains = setupWithSite(SITE_RESELLER, 'cj');
    const res = await POST(req({
      slug: 'boutique',
      countryCode: 'US',
      items: [{ id: 'catalog-cp-1::111', quantity: 1, name: 'Produit', customDesignUrl: 'https://evil.example/anything.png' }],
    }));
    expect(res.status).toBe(200);
    // designRows reste vide -> order_item_designs jamais interrogee.
    expect(chains.get('order_item_designs')).toBeUndefined();
  });

  // ============================================================
  // LOT 1 / L1-03 -- LA GARANTIE TIENT ENCORE, PAR UN MECANISME PLUS TOT.
  //
  // Ces trois cas attendaient 200 + design efface : la vente aboutissait
  // (repli `default -> ['cj']`) et seule la liste d'autorisation du design
  // les protegeait. Le sous-type absent n'admettant plus aucun fournisseur,
  // la vente est refusee AVANT d'atteindre la porte du design.
  //
  // ON NE SE CONTENTE PAS DU 409 : la propriete d'origine -- « un design
  // client n'atteint jamais un site non pod_custom/pod_brand » -- reste
  // assertee telle quelle. Elle est desormais garantie deux fois plutot
  // qu'une, et le test le dit.
  // ============================================================
  it.each([
    ['null', SITE_NULL_TYPE],
    ['undefined', SITE_UNDEFINED_TYPE],
    ['valeur inattendue', SITE_UNEXPECTED_TYPE],
  ])('dropship_type=%s -> la vente est refusée en amont (409) et aucun order_item_designs n’est créé', async (_label, site) => {
    const chains = setupWithSite(site, 'cj');
    const res = await POST(req({
      slug: 'boutique',
      countryCode: 'US',
      items: [{ id: 'catalog-cp-1::111', quantity: 1, name: 'Produit', customDesignUrl: 'https://evil.example/anything.png' }],
    }));
    expect(res.status).toBe(409);
    expect(chains.get('order_item_designs')).toBeUndefined();
  });

  it('dropship_type=pod_custom -> customDesignUrl SANS ligne design_uploads correspondante est désormais rejeté (LOT J, F-CUSTOM-01 : plus de confiance aveugle dans l\'URL du client)', async () => {
    // Pas de handler design_uploads -> fallback {data:null} -> "not found".
    setupWithSite(SITE_POD_CUSTOM, 'printful');
    const res = await POST(req({
      slug: 'boutique',
      countryCode: 'US',
      items: [{ id: 'catalog-cp-1::111', quantity: 1, name: 'Produit', customDesignUrl: 'https://buyer.example/my-design.png' }],
    }));
    expect(res.status).toBe(409);
  });
});

describe('POST /api/shop/checkout — LOT J (F-CUSTOM-01/04) : design_uploads, tenant-bound + single-use', () => {
  const SITE_POD_CUSTOM = { ...SITE_MODE3, dropship_type: 'pod_custom' };
  const DESIGN_URL = 'https://storage.test/custom-designs/real-upload.png';

  /**
   * Chain dédiée à design_uploads : le helper générique tableChain()
   * partage UNE réponse fixe entre .maybeSingle() (phase 1, validation) et
   * l'attente directe de .update().select() (phase 2, consommation CAS) --
   * les deux formes réelles renvoyées par Supabase-js diffèrent (objet vs
   * tableau), le générique ne peut pas représenter les deux à la fois.
   * Cette chain reproduit fidèlement les 2 formes d'appel réelles du code.
   */
  function designUploadsChain(state: { found: boolean; consumedAt: string | null; claimSucceeds: boolean }) {
    return () => {
      const chain: any = {};
      let isUpdate = false;
      chain.select = (_cols?: string) => {
        if (isUpdate) {
          return { then: (resolve: (v: unknown) => void) => resolve({ data: state.claimSucceeds ? [{ id: 'du-1' }] : [], error: null }) };
        }
        return chain;
      };
      chain.update = vi.fn((_payload: unknown) => { isUpdate = true; return chain; });
      chain.eq = vi.fn(() => chain);
      chain.is = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({
        data: state.found ? { consumed_at: state.consumedAt } : null,
        error: null,
      }));
      return chain;
    };
  }

  function setupWithDesign(state: { found: boolean; consumedAt: string | null; claimSucceeds: boolean }) {
    const generic = setupTables({
      sites: { data: SITE_POD_CUSTOM, error: null },
      catalog_products: { data: [{ id: 'cp-1', supplier_product_id: 'sp-1', price: 20, currency: 'usd', supplier_id: 'printful' }], error: null },
      site_catalog_selections: { data: null, error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });
    // setupTables() vient de brancher fromMock sur son propre dispatch
    // (fermé sur `handlers` ci-dessus) -- on le capture pour continuer à
    // servir TOUTES les autres tables normalement, et on n'intercepte que
    // design_uploads, dont la forme d'appel réelle (SELECT puis UPDATE...
    // RETURNING) ne peut pas être représentée par le helper générique
    // tableChain() (voir commentaire de designUploadsChain ci-dessus).
    const genericImpl = fromMock.getMockImplementation()!;
    const designChain = designUploadsChain(state)();
    fromMock.mockImplementation((table: string) => {
      if (table === 'design_uploads') return designChain;
      return genericImpl(table);
    });
    return { generic, designChain };
  }

  it('URL inexistante dans design_uploads (jamais uploadée, ou uploadée sur un AUTRE site) -> 409, checkout rejeté avant toute session Stripe', async () => {
    setupWithDesign({ found: false, consumedAt: null, claimSucceeds: false });
    const res = await POST(req({
      slug: 'boutique',
      countryCode: 'US',
      items: [{ id: 'catalog-cp-1::111', quantity: 1, name: 'Produit', customDesignUrl: DESIGN_URL }],
    }));
    expect(res.status).toBe(409);
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'custom_design_invalid_or_reused',
      details: expect.objectContaining({ reason: 'not_found_or_wrong_site' }),
    }));
  });

  it('URL déjà consommée par une commande précédente (réutilisation, single-use violé) -> 409', async () => {
    setupWithDesign({ found: true, consumedAt: '2026-01-01T00:00:00Z', claimSucceeds: false });
    const res = await POST(req({
      slug: 'boutique',
      countryCode: 'US',
      items: [{ id: 'catalog-cp-1::111', quantity: 1, name: 'Produit', customDesignUrl: DESIGN_URL }],
    }));
    expect(res.status).toBe(409);
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'custom_design_invalid_or_reused',
      details: expect.objectContaining({ reason: 'already_consumed' }),
    }));
  });

  it('URL valide (trouvée, jamais consommée, appartient au bon site) -> checkout accepté, design consommé atomiquement (UPDATE...WHERE consumed_at IS NULL)', async () => {
    const { designChain } = setupWithDesign({ found: true, consumedAt: null, claimSucceeds: true });
    const res = await POST(req({
      slug: 'boutique',
      countryCode: 'US',
      items: [{ id: 'catalog-cp-1::111', quantity: 1, name: 'Produit', customDesignUrl: DESIGN_URL }],
    }));
    expect(res.status).toBe(200);
    expect(designChain.update).toHaveBeenCalledWith(expect.objectContaining({
      consumed_by_order_item_id: 'item-1',
    }));
  });

  it("RÉGRESSION CIBLÉE (trouvée par contre-audit hostile) : la MÊME URL utilisée pour 2 emplacements du même item (devant + dos) -> les DEUX lignes order_item_designs sont conservées, une seule consommation réelle en base (pas d'auto-course sur soi-même)", async () => {
    const { generic: chains, designChain } = setupWithDesign({ found: true, consumedAt: null, claimSucceeds: true });

    const res = await POST(req({
      slug: 'boutique',
      countryCode: 'US',
      items: [{
        id: 'catalog-cp-1::111',
        quantity: 1,
        name: 'Produit',
        customDesigns: [
          { url: DESIGN_URL, placement: 'front', position: {} },
          { url: DESIGN_URL, placement: 'back', position: {} },
        ],
      }],
    }));

    expect(res.status).toBe(200);
    const designsChain = chains.get('order_item_designs');
    // Les 2 lignes (front + back) sont bien insérées -- aucune n'a été
    // écartée à tort par une fausse "course" sur la même URL.
    expect(designsChain?.insert).toHaveBeenCalledWith([
      expect.objectContaining({ placement: 'front', design_url: DESIGN_URL }),
      expect.objectContaining({ placement: 'back', design_url: DESIGN_URL }),
    ]);
    // Une seule consommation réelle tentée pour cette URL (dédupliquée),
    // pas deux.
    expect(designChain.update).toHaveBeenCalledTimes(1);
  });

  it("course perdue à la consommation (design consommé par une autre commande ENTRE la validation et l'écriture) -> commande NON bloquée (paiement déjà en cours), mais le design est omis, anomalie journalisée", async () => {
    // found:true + consumedAt:null au moment de la validation (phase 1),
    // mais le CAS de la phase 2 échoue (claimSucceeds:false) -- reproduit
    // exactement une course gagnée par un appel concurrent entre les deux
    // phases de la même requête.
    setupWithDesign({ found: true, consumedAt: null, claimSucceeds: false });
    const res = await POST(req({
      slug: 'boutique',
      countryCode: 'US',
      items: [{ id: 'catalog-cp-1::111', quantity: 1, name: 'Produit', customDesignUrl: DESIGN_URL }],
    }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.url).toBe('https://pay.example/session');
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'custom_design_consume_race_lost' }));
  });
});

describe('POST /api/shop/checkout — gestion d\'erreur commande (audit checkout error handling)', () => {
  // Avant ce correctif, l'URL Stripe etait renvoyee au client meme si
  // shop_orders echouait -- un paiement reel pouvait donc aboutir sans
  // aucune commande cote Deribfy. Ces tests verrouillent qu'un echec de
  // l'insertion de la commande bloque desormais la reponse.
  it('insertion shop_orders echoue (erreur generique) -> 500, PAS d\'URL renvoyee, anomalie journalisee', async () => {
    setupTables({
      sites: { data: SITE_MODE2, error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: true, for_sale: true }], error: null },
      shop_orders: { data: null, error: { message: 'connection reset' } },
    });

    const res = await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'usd' }] }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.url).toBeUndefined();
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'checkout_order_insert_failed', siteId: 'site-1' })
    );
  });

  it('insertion shop_orders rejetee car site archive (trigger DB) -> 409, message explicite, PAS d\'URL renvoyee', async () => {
    setupTables({
      sites: { data: SITE_MODE2, error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: true, for_sale: true }], error: null },
      shop_orders: { data: null, error: { message: 'SITE_ARCHIVED: cannot create shop_orders for an archived site (site_id=site-1)' } },
    });

    const res = await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'usd' }] }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.url).toBeUndefined();
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'checkout_order_site_archived', siteId: 'site-1' })
    );
  });

  it('commande creee mais insertion shop_order_items echoue -> 200, URL quand meme renvoyee (paiement deja engageable), anomalie journalisee', async () => {
    setupTables({
      sites: { data: SITE_MODE2, error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: true, for_sale: true }], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: null, error: { message: 'constraint violation' } },
    });

    const res = await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'usd' }] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.url).toBe('https://pay.example/session');
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'checkout_order_items_insert_failed', details: expect.objectContaining({ orderId: 'order-1' }) })
    );
  });
});

describe('POST /api/shop/checkout — F1/F2 : isolation tenant + produit publié (shop_products)', () => {
  it('la requête de prix filtre bien par site_id ET id (protection cross-boutique)', async () => {
    const chains = setupTables({
      sites: { data: SITE_MODE2, error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: true, for_sale: true }], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });
    await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'usd' }] }));
    const eqCalls = (chains.get('shop_products')!.eq as Mock).mock.calls;
    expect(eqCalls).toContainEqual(['site_id', 'site-1']);
    expect(eqCalls).toContainEqual(['id', 'p1']);
  });

  it('produit shop_products introuvable POUR CE SITE (id existe mais appartient à un autre site, ou id inconnu) -> 409, jamais de session Stripe', async () => {
    setupTables({
      sites: { data: SITE_MODE2, error: null },
      // .eq('site_id', ...) réel de Postgres ne retournerait aucune ligne ici
      // (id d'un produit d'une AUTRE boutique) -- simulé par data: null.
      shop_products: { data: null, error: null },
    });
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'produit-autre-boutique', quantity: 1, name: 'X', currency: 'usd' }] }));
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toBe('Produit indisponible');
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'shop_product_not_purchasable' }));
  });

  it('produit shop_products désactivé par le marchand (published:false) -> 409, jamais achetable via un id connu', async () => {
    setupTables({
      sites: { data: SITE_MODE2, error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: false }], error: null },
    });
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'usd' }] }));
    expect(res.status).toBe(409);
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'shop_product_not_purchasable' }));
  });
});

describe('POST /api/shop/checkout — F3 : devise jamais issue du client', () => {
  it('devise falsifiée dans le body (jpy) -> ignorée, la devise du produit serveur (usd) fait foi', async () => {
    setupTables({
      sites: { data: SITE_MODE2, error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: true, for_sale: true }], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });
    await POST(req({ slug: 'boutique', countryCode: 'US', items: [{ id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'jpy' }] }));
    const itemsArg = createCheckoutMock.mock.calls[0][2];
    expect(itemsArg[0].currency).toBe('usd');
  });

  it('panier multi-devises entre deux lignes server-résolues (catalog usd + shop eur) -> 409, jamais envoyé à Stripe', async () => {
    setupTables({
      // D2 (phase 4) : un panier melant une ligne CATALOGUE et une ligne
      // marchande n'existe que sur un site Mode 3 -- une boutique Mode 2 ne
      // vend aucun produit du catalogue fournisseur. Fixture requalifie ;
      // l'assertion (deux devises server-resolues -> 409) est INCHANGEE.
      sites: { data: SITE_MODE3, error: null },
      catalog_products: { data: [{ id: 'abc', supplier_product_id: 'sp-abc', price: 10, currency: 'usd', supplier_id: 'cj' }], error: null },
      shipping_cache: { data: [{ supplier_product_id: 'sp-abc', shipping_cost: 5, days_min: 10, days_max: 20, tiers: null }], error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'eur', published: true, for_sale: true }], error: null },
    });
    const res = await POST(req({
      slug: 'boutique',
      countryCode: 'US',
      items: [
        { id: 'catalog-abc', quantity: 1, name: 'Mug', currency: 'usd' },
        { id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'usd' },
      ],
    }));
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toBe('Panier incohérent');
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'mixed_currency_cart' }));
  });
});

describe('POST /api/shop/checkout — N1 : le produit acheté doit appartenir à un fournisseur éligible pour le sous-mode du site', () => {
  function setup(site: unknown, supplierId: string) {
    return setupTables({
      sites: { data: site, error: null },
      catalog_products: { data: [{ id: 'cp-1', supplier_product_id: 'sp-1', price: 20, currency: 'usd', supplier_id: supplierId }], error: null },
      // Mode 3 exige un devis confirme : pour un item CJ il vient du cache
      // (resolveShipping reserve ce repli a CJ). Completion de fixture.
      shipping_cache: { data: [{ supplier_product_id: 'sp-1', shipping_cost: 5, days_min: 10, days_max: 20, tiers: null }], error: null },
      site_catalog_selections: { data: null, error: null },
    });
  }

  it("site reseller + produit Printful (jamais sélectionné par le marchand) -> 409, logAnomaly, jamais envoyé à Stripe", async () => {
    setup({ ...SITE_MODE3, dropship_type: 'reseller' }, 'printful');
    const res = await POST(req({ slug: 'boutique', countryCode: 'US', items: [{ id: 'catalog-cp-1::111', quantity: 1, name: 'Mug' }] }));
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toBe('Produit indisponible');
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'catalog_supplier_not_eligible' }));
  });

  it("site pod_brand + produit CJ (jamais destiné à ce sous-mode) -> 409", async () => {
    setup({ ...SITE_MODE3, dropship_type: 'pod_brand' }, 'cj');
    const res = await POST(req({ slug: 'boutique', countryCode: 'US', items: [{ id: 'catalog-cp-1::111', quantity: 1, name: 'Mug' }] }));
    expect(res.status).toBe(409);
  });

  it("site reseller + produit CJ (cas légitime) -> passe la garde, atteint le reste du flux", async () => {
    setupTables({
      sites: { data: { ...SITE_MODE3, dropship_type: 'reseller' }, error: null },
      catalog_products: { data: [{ id: 'cp-1', supplier_product_id: 'sp-1', price: 20, currency: 'usd', supplier_id: 'cj' }], error: null },
      shipping_cache: { data: [{ supplier_product_id: 'sp-1', shipping_cost: 5, days_min: 10, days_max: 20, tiers: null }], error: null },
      site_catalog_selections: { data: null, error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });
    const res = await POST(req({ slug: 'boutique', countryCode: 'US', items: [{ id: 'catalog-cp-1::111', quantity: 1, name: 'Mug' }] }));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/shop/checkout — F6 : quantité invalide', () => {
  it.each([0, -1, 1.5, -99])('quantité %s -> 400 avant tout appel DB', async (quantity) => {
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity, name: 'T-Shirt', currency: 'usd' }] }));
    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('quantité valide (entier positif) -> passe la validation, atteint la résolution du site', async () => {
    setupTables({ sites: { data: null, error: null } });
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 2, name: 'T-Shirt', currency: 'usd' }] }));
    // 404 (site introuvable) prouve qu'on a dépassé la validation de quantité,
    // pas 400 (quantité invalide).
    expect(res.status).toBe(404);
  });
});

describe('POST /api/shop/checkout — erreurs inattendues', () => {
  it('exception non gérée -> 500, jamais un crash silencieux', async () => {
    fromMock.mockImplementation(() => { throw new Error('DB down'); });
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1 }] }));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/shop/checkout — PASSE DE CLOTURE : codes promo (P-1 a P-6)', () => {
  // Modele economique valide (OPTION A) : le MARCHAND absorbe integralement
  // la remise. La commission Nexiora reste calculee sur le prix AVANT remise,
  // donc applicationFeeAmount est inchange ; seul clientPays baisse.

  function setupPromo(promoRow: unknown) {
    return setupTables({
      sites: { data: SITE_MODE2, error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 100, currency: 'usd', published: true, for_sale: true }], error: null },
      promo_codes: { data: promoRow, error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });
  }

  const VALID_PROMO = {
    id: 'promo-a', discount_type: 'percent', discount_value: 20,
    min_order: 0, max_uses: null, used_count: 0, expires_at: null,
  };

  function order(extra: Record<string, unknown> = {}) {
    return req({
      slug: 'boutique',
      items: [{ id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'usd' }],
      ...extra,
    });
  }

  it('P-1 : une remise valide est REELLEMENT appliquee -- Stripe recoit le montant remise, jamais le prix plein', async () => {
    setupPromo(VALID_PROMO);
    const res = await POST(order({ promoCode: 'CODE20' }));
    expect(res.status).toBe(200);
    // 100 - 20% = 20 de remise transmise a Stripe (dernier argument).
    const args = createCheckoutMock.mock.calls[0];
    expect(args[args.length - 1]).toBe(20);
  });

  it("P-1 : sans code promo, aucune remise n'est transmise (comportement historique intact)", async () => {
    setupPromo(null);
    const res = await POST(order());
    expect(res.status).toBe(200);
    const args = createCheckoutMock.mock.calls[0];
    expect(args[args.length - 1]).toBe(0);
  });

  it('P-1 : le montant de remise envoye par le CLIENT est totalement ignore -- seul le code compte', async () => {
    setupPromo(VALID_PROMO);
    // Le client tente d'imposer une remise de 999 : elle ne doit avoir aucun effet.
    const res = await POST(order({ promoCode: 'CODE20', promoDiscount: 999, discount: 999 }));
    expect(res.status).toBe(200);
    const args = createCheckoutMock.mock.calls[0];
    expect(args[args.length - 1]).toBe(20);
  });

  it.each(['%', '_', '%%', 'CODE%', '_ODE20'])(
    "P-2 : le joker '%s' ne matche aucun code -- 409, aucune session Stripe",
    async (joker) => {
      // Egalite stricte : la requete ne renvoie rien pour un joker.
      setupPromo(null);
      const res = await POST(order({ promoCode: joker }));
      expect(res.status).toBe(409);
      expect(createCheckoutMock).not.toHaveBeenCalled();
    }
  );

  it('P-2 : la casse et les espaces superflus sont normalises (code valide accepte)', async () => {
    const chains = setupPromo(VALID_PROMO);
    const res = await POST(order({ promoCode: '  code20  ' }));
    expect(res.status).toBe(200);
    const eqCalls = (chains.get('promo_codes')!.eq as Mock).mock.calls;
    expect(eqCalls).toContainEqual(['code', 'CODE20']);
  });

  it('P-2/CROSS-TENANT : la recherche est TOUJOURS filtree par site_id du site resolu', async () => {
    const chains = setupPromo(VALID_PROMO);
    await POST(order({ promoCode: 'CODE20' }));
    const eqCalls = (chains.get('promo_codes')!.eq as Mock).mock.calls;
    expect(eqCalls).toContainEqual(['site_id', 'site-1']);
    expect(eqCalls).toContainEqual(['active', true]);
  });

  it("CROSS-TENANT : un code inexistant SUR CE SITE (existant ailleurs) -> 409, jamais de remise", async () => {
    // Simule CODE20 appartenant a la boutique B : le filtre site_id de la
    // boutique A ne le remonte pas.
    setupPromo(null);
    const res = await POST(order({ promoCode: 'CODE20' }));
    expect(res.status).toBe(409);
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'promo_rejected',
      details: expect.objectContaining({ reason: 'not_found_or_wrong_site' }),
    }));
  });

  it('P-3 : un subtotal falsifie par le client est ignore -- min_order est evalue sur le total serveur', async () => {
    // min_order = 500 alors que le total serveur reel est 100 : refus, meme si
    // le client pretend un subtotal enorme.
    setupPromo({ ...VALID_PROMO, min_order: 500 });
    const res = await POST(order({ promoCode: 'CODE20', subtotal: 99999 }));
    expect(res.status).toBe(409);
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'promo_rejected',
      details: expect.objectContaining({ reason: 'min_order' }),
    }));
  });

  it('P-4 : un code epuise (used_count >= max_uses) est refuse', async () => {
    setupPromo({ ...VALID_PROMO, max_uses: 5, used_count: 5 });
    const res = await POST(order({ promoCode: 'CODE20' }));
    expect(res.status).toBe(409);
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ reason: 'depleted' }),
    }));
  });

  it('code expire -> 409', async () => {
    setupPromo({ ...VALID_PROMO, expires_at: '2020-01-01T00:00:00Z' });
    const res = await POST(order({ promoCode: 'CODE20' }));
    expect(res.status).toBe(409);
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ reason: 'expired' }),
    }));
  });

  it.each([
    ['pourcentage > 100', { discount_type: 'percent', discount_value: 500 }],
    ['valeur negative', { discount_type: 'percent', discount_value: -10 }],
    ['valeur nulle', { discount_type: 'fixed', discount_value: 0 }],
    ['type arbitraire', { discount_type: 'bogus', discount_value: 10 }],
  ])('P-6 : configuration invalide (%s) -> 409, jamais interpretee par defaut', async (_label, cfg) => {
    setupPromo({ ...VALID_PROMO, ...cfg });
    const res = await POST(order({ promoCode: 'CODE20' }));
    expect(res.status).toBe(409);
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'promo_invalid_config' }));
  });

  it('remise fixe superieure au total : bornee au total, clientPays ne devient jamais negatif', async () => {
    setupPromo({ ...VALID_PROMO, discount_type: 'fixed', discount_value: 9999 });
    const res = await POST(order({ promoCode: 'CODE20' }));
    expect(res.status).toBe(200);
    const args = createCheckoutMock.mock.calls[0];
    // Bornee a 100 (le total serveur), jamais 9999.
    expect(args[args.length - 1]).toBe(100);
  });
});

describe('POST /api/shop/checkout — DEBT-029b : garde montant nul, applicable a TOUS les modes', () => {
  // Audit final phase 2 : tous les garde-fous financiers etaient enfermes dans
  // le bloc `if (site.mode === 3)`. Le mode 3 interceptait deja le cas via
  // `applicationFeeAmount >= clientPays` ; les modes 1 et 2 n'avaient AUCUNE
  // protection et laissaient Stripe refuser un montant de 0 avec une erreur
  // opaque cote acheteur.
  const PROMO_100 = {
    id: 'promo-full', discount_type: 'percent', discount_value: 100,
    min_order: 0, max_uses: null, used_count: 0, expires_at: null,
  };

  function setupWithShipping(shippingFlat: number) {
    return setupTables({
      sites: { data: { ...SITE_MODE2, shipping_flat: shippingFlat }, error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 100, currency: 'usd', published: true, for_sale: true }], error: null },
      promo_codes: { data: PROMO_100, error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });
  }

  const order = () =>
    req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'usd' }], promoCode: 'GRATUIT' });

  it('remise de 100 % + livraison gratuite -> 409 explicite, jamais de session Stripe', async () => {
    setupWithShipping(0);
    const res = await POST(order());
    expect(res.status).toBe(409);
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'zero_amount_checkout' }));
  });

  it('CONTROLE POSITIF : meme remise de 100 % mais livraison payante -> 200, la garde ne se declenche pas', async () => {
    setupWithShipping(5);
    const res = await POST(order());
    expect(res.status).toBe(200);
    expect(createCheckoutMock).toHaveBeenCalled();
    expect(logAnomalyMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'zero_amount_checkout' }));
  });
});

// ============================================================
// PHASE 2 — capture du domaine d'execution sur la commande.
// Plan de reference : docs/PLAN-SEPARATION-MODE2-MODE3.md
//
// Le checkout est le SEUL endroit du produit ou le mode d'un site est
// converti en domaine d'execution. Ces tests verrouillent trois proprietes :
//
//   1. la valeur ecrite correspond bien au mode du site ;
//   2. elle ne depend QUE du mode -- jamais du sous-type, jamais du
//      fournisseur des lignes du panier ;
//   3. un mode inattendu se replie sur 'merchant' (donc aucun appel
//      fournisseur) SANS rester silencieux.
//
// La propriete 2 est celle qui a manque a une garde anterieure (13bec0e) :
// en consultant le sous-type, elle avait modifie deux des trois parcours
// Mode 3. Un test qui ne verifierait que la propriete 1 laisserait cette
// erreur reapparaitre.
// ============================================================

function payloadCommande(chains: ReturnType<typeof setupTables>) {
  const insert = chains.get('shop_orders')?.insert as Mock | undefined;
  expect(insert, 'aucun INSERT sur shop_orders : le flux n’a pas atteint la création de commande').toBeDefined();
  return insert!.mock.calls[0][0] as Record<string, unknown>;
}

/** Checkout Mode 2 nominal : un produit du marchand, aucune ligne fournisseur. */
function setupMode2(site: unknown = SITE_MODE2) {
  return setupTables({
    sites: { data: site, error: null },
    shop_products: { data: [{ id: 'p1', price: 30, currency: 'usd', published: true, for_sale: true, cj_vid: null }], error: null },
    shop_orders: { data: { id: 'order-1' }, error: null },
    shop_order_items: { data: [{ id: 'item-1' }], error: null },
  });
}
const ITEM_MARCHAND = { id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'usd' };

/** Checkout Mode 3 nominal : item catalogue, devis servi par le cache.
 *  Le fournisseur de l'item DOIT correspondre au sous-type du site : la garde
 *  d'eligibilite fournisseur (N1) refuse sinon en 409, et c'est le
 *  comportement Mode 3 attendu -- un fixture incoherent testerait autre chose
 *  que ce qu'il pretend. */
function setupMode3(site: unknown = SITE_MODE3, supplier = 'cj') {
  return setupTables({
    sites: { data: site, error: null },
    catalog_products: { data: [{ id: 'cp-1', price: 10, currency: 'usd', supplier_id: supplier, supplier_product_id: 'vid-1' }], error: null },
    site_catalog_selections: { data: null, error: null },
    shipping_cache: { data: [{ supplier_product_id: 'vid-1', shipping_cost: 5, days_min: 10, days_max: 20, tiers: null }], error: null },
    shop_orders: { data: { id: 'order-1' }, error: null },
    shop_order_items: { data: [{ id: 'item-1' }], error: null },
  });
}
const ITEM_CATALOGUE = { id: 'catalog-cp-1::vid-1', quantity: 1, name: 'T-Shirt', currency: 'usd' };

describe('PHASE 2 — fulfillment_domain écrit à la création de la commande', () => {
  it('Mode 2 -> la commande porte fulfillment_domain = "merchant"', async () => {
    const chains = setupMode2();
    const res = await POST(req({ slug: 'boutique', items: [ITEM_MARCHAND] }));
    expect(res.status).toBe(200);
    expect(payloadCommande(chains).fulfillment_domain).toBe('merchant');
  });

  it('Mode 3 -> la commande porte fulfillment_domain = "supplier"', async () => {
    const chains = setupMode3();
    const res = await POST(req({ slug: 'boutique', items: [ITEM_CATALOGUE], countryCode: 'US' }));
    expect(res.status).toBe(200);
    expect(payloadCommande(chains).fulfillment_domain).toBe('supplier');
  });

  // ---- Le domaine ne dépend QUE du mode ----
  // Seuls les sous-types servis par CJ sont exerces ICI : le repli
  // `shipping_cache` de resolveShipping est propre a CJ (resolveShipping.ts,
  // `groups['cj']`), donc un item POD ne resout aucun devis et le Mode 3
  // refuse en 409 -- comportement Mode 3 existant et correct, hors perimetre
  // de cette phase. L'independance du domaine vis-a-vis du sous-type POD est
  // prouvee la ou elle est decidable : le resolveur ne recoit jamais le
  // sous-type (tests de order-domain/resolve.ts) et la regle de registre
  // `order-domain-frontier` lui interdit structurellement de le lire.
  it.each([
    ['reseller', 'cj'],
  ])('Mode 3 + dropship_type=%s -> toujours "supplier" : le sous-type n’influence PAS le domaine', async (dt, supplier) => {
    const chains = setupMode3({ ...SITE_MODE3, dropship_type: dt }, supplier);
    const res = await POST(req({ slug: 'boutique', items: [ITEM_CATALOGUE], countryCode: 'US' }));
    expect(res.status).toBe(200);
    expect(payloadCommande(chains).fulfillment_domain).toBe('supplier');
  });

  // ============================================================
  // LOT 1 / L1-03 + L1-05 -- LE COUPLE (Mode 3, dropship_type ABSENT).
  //
  // CETTE LIGNE ETAIT DANS L'`it.each` CI-DESSUS, ET ELLE ATTENDAIT 200 :
  // un site Mode 3 sans sous-type vendait du CJ. Elle prouvait au passage
  // que le sous-type n'influence pas le DOMAINE -- ce qui reste vrai et
  // reste prouve, ici meme et dans `order-domain/__tests__/resolve.test.ts`,
  // dont le resolveur ne recoit structurellement jamais le sous-type.
  //
  // CE QUI CHANGE EST L'ADMISSION, PAS LA FRONTIERE : la vente est refusee
  // en amont, donc aucune commande n'est creee -- et il n'y a plus de
  // domaine a porter. Le refus est le comportement voulu : sans sous-type,
  // aucun fournisseur n'est admis.
  // ============================================================
  it.each([null, undefined, '', 'legacy_mode_x'])(
    'Mode 3 + dropship_type=%s + item catalogue -> 409, AUCUNE commande creee : un sous-type absent n’admet aucun fournisseur',
    async (dt) => {
      const chains = setupMode3({ ...SITE_MODE3, dropship_type: dt }, 'cj');
      const res = await POST(req({ slug: 'boutique', items: [ITEM_CATALOGUE], countryCode: 'US' }));
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe('Produit indisponible');
      expect(chains.get('shop_orders')).toBeUndefined();
      expect(createCheckoutMock).not.toHaveBeenCalled();
      expect(logAnomalyMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'catalog_supplier_not_eligible' })
      );
    }
  );

  it('Mode 2 portant un dropship_type incohérent -> reste "merchant" : le sous-type ne peut pas faire basculer de domaine', async () => {
    const chains = setupMode2({ ...SITE_MODE2, dropship_type: 'reseller' });
    const res = await POST(req({ slug: 'boutique', items: [ITEM_MARCHAND] }));
    expect(res.status).toBe(200);
    expect(payloadCommande(chains).fulfillment_domain).toBe('merchant');
    expect(logAnomalyMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'site_mode_unrecognised' })
    );
  });

  // ---- M1-5 : REQUALIFIÉ — ce cas mêlait deux frontières ----
  //
  // Ce test affirmait qu'un mode inconnu produisait une commande `merchant`
  // avec un statut 200. Il mesurait en réalité DEUX choses à la fois :
  //
  //   · le ROUTAGE  — `resolveFulfillmentDomain(7) === 'merchant'` ;
  //   · l'ADMISSION — la vente était autorisée à exister.
  //
  // Le routage n'a PAS changé et reste vrai : il est prouvé à sa place
  // légitime, `order-domain/__tests__/resolve.test.ts`, qui couvre déjà
  // `null`, `undefined`, `4`, `'3'` et d'autres valeurs inattendues. Aucune
  // couverture de routage n'est perdue ici — elle est seulement rendue à la
  // couche qui la possède.
  //
  // L'admission, elle, change : un mode que le produit ne reconnaît pas ne
  // peut plus produire de vente. Un repli interne de routage ne doit jamais
  // valoir autorisation de créer une commande — c'est précisément ce que
  // cette requalification acte.
  it.each([
    ['mode inconnu', 7],
    ['mode absent', null],
  ])('%s -> ADMISSION REFUSÉE (403), aucune commande créée', async (_libelle, mode) => {
    setupMode2({ ...SITE_MODE2, mode });
    const res = await POST(req({ slug: 'boutique', items: [ITEM_MARCHAND] }));
    expect(
      res.status,
      "un mode non reconnu ne commerce pas : le repli `merchant` du routage ne l'autorise pas à vendre"
    ).toBe(403);
    // `payloadCommande` exige un INSERT : il modelise le cas nominal. Ici
    // l'absence d'artefact se prouve par l'absence de session de paiement,
    // qui precede l'ecriture de la commande dans le flux reel.
    expect(createCheckoutMock, 'aucune session de paiement').not.toHaveBeenCalled();
  });

  it('un mode nominal n’émet AUCUNE anomalie (le canari ne crie pas pour rien)', async () => {
    setupMode2();
    await POST(req({ slug: 'boutique', items: [ITEM_MARCHAND] }));
    expect(logAnomalyMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'site_mode_unrecognised' })
    );
  });
});

// ============================================================
// PHASE 4 — D2 : une boutique Mode 2 ne vend AUCUN produit du catalogue
// fournisseur. Plan de reference : docs/PLAN-SEPARATION-MODE2-MODE3.md
//
// Avant cette phase, l'admission produit ne consultait QUE le sous-type
// (`suppliersForDropshipType`), jamais le mode : une boutique Mode 2 sans
// sous-type se voyait donc appliquer le repli historique et acceptait les
// produits CJ. Le test de reference de ce fichier le verrouillait meme --
// avec un fixture `SITE_MODE2 + dropship_type: 'reseller'`, c'est-a-dire un
// site semantiquement impossible.
//
// Ce que D2 ferme : sans cette garde, le domaine dependrait du CONTENU DU
// PANIER et non du site, et une commande marchande pourrait etre encaissee
// alors qu'aucun moteur ne saurait l'executer.
// ============================================================
describe('PHASE 4 — D2 : Mode 2 n’admet aucun produit du catalogue fournisseur', () => {
  function setupCatalogue(site: unknown, supplier: string) {
    return setupTables({
      sites: { data: site, error: null },
      catalog_products: { data: [{ id: 'cp-1', supplier_product_id: 'sp-1', price: 20, currency: 'usd', supplier_id: supplier }], error: null },
      site_catalog_selections: { data: null, error: null },
      shipping_cache: { data: [{ supplier_product_id: 'sp-1', shipping_cost: 5, days_min: 10, days_max: 20, tiers: null }], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });
  }
  const ITEM = { id: 'catalog-cp-1::111', quantity: 1, name: 'Mug' };

  it.each([['cj'], ['printful'], ['gelato']])(
    'Mode 2 + produit catalogue %s -> 409, jamais envoyé à Stripe',
    async (supplier) => {
      setupCatalogue(SITE_MODE2, supplier);
      const res = await POST(req({ slug: 'boutique', countryCode: 'US', items: [ITEM] }));
      expect(res.status).toBe(409);
      expect(createCheckoutMock).not.toHaveBeenCalled();
      expect(logAnomalyMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'catalog_supplier_not_eligible' })
      );
    }
  );

  it('Mode 2 portant un sous-type INCOHÉRENT -> refuse quand même : le sous-type ne peut pas ouvrir le catalogue', async () => {
    // Fixture volontairement impossible. Avant D2, ce cas ACCEPTAIT le
    // produit -- c'est exactement la confusion mode/sous-type corrigee.
    setupCatalogue({ ...SITE_MODE2, dropship_type: 'reseller' }, 'cj');
    const res = await POST(req({ slug: 'boutique', countryCode: 'US', items: [ITEM] }));
    expect(res.status).toBe(409);
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it('Mode 3 + produit catalogue éligible -> ACCEPTÉ : la garde ne touche pas le domaine fournisseur', async () => {
    setupCatalogue({ ...SITE_MODE3, dropship_type: 'reseller' }, 'cj');
    const res = await POST(req({ slug: 'boutique', countryCode: 'US', items: [ITEM] }));
    expect(res.status).toBe(200);
  });

  it('Mode 2 vend normalement SES PROPRES produits — la garde ne ferme que le catalogue fournisseur', async () => {
    setupTables({
      sites: { data: SITE_MODE2, error: null },
      shop_products: { data: [{ id: 'p1', price: 30, currency: 'usd', published: true, for_sale: true, cj_vid: null }], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'usd' }] }));
    expect(res.status).toBe(200);
    expect(createCheckoutMock).toHaveBeenCalled();
  });
});
