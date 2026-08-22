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
vi.mock('@/lib/catalog-stock', () => ({
  checkCatalogStock: (...a: unknown[]) => checkCatalogStockMock(...a),
}));

const createCheckoutMock = vi.fn();
vi.mock('@/lib/payments', () => ({
  getProvider: vi.fn(() => ({ createCheckout: (...a: unknown[]) => createCheckoutMock(...a) })),
}));

// Aucun test ici n'exerce le chemin calculateShipping live (couvert par
// la migration Supplier Registry) : la Map dérivée reste vide, ce qui
// laisse le fallback CJ (shipping_cache) ou le rejet Mode 3 s'exprimer
// exactement comme en production quand aucun adaptateur n'est disponible.
vi.mock('@/lib/suppliers/registry', () => ({
  suppliersWithCapability: () => [],
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
const SITE_MODE3 = { ...SITE_MODE2, mode: 3 };

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
    setupTables({
      sites: { data: SITE_MODE2, error: null },
      catalog_products: { data: { price: 0 }, error: null },
    });
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'catalog-abc', quantity: 1 }] }));
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
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: true }], error: null },
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
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: true }], error: null },
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
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: true }], error: null },
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
      shop_products: { data: [{ id: 'p1', cj_vid: 'vid-1', price: 30, currency: 'usd', published: true }], error: null },
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
    ...SITE_MODE2,
    dropship_type: 'pod_brand',
    pod_designs: [{
      url: 'https://storage.example/brand-design.png',
      mockups: [
        { catalog_product_id: 'cp-1', variant_id: 111, design_url: 'https://storage.example/brand-design.png', mockup_url: 'https://storage.example/mockup.png' },
      ],
    }],
  };

  it('un customDesignUrl injecté par le client est ignoré : le design réellement envoyé au fournisseur est celui du mockup généré par le marchand', async () => {
    const chains = setupTables({
      sites: { data: SITE_POD_BRAND, error: null },
      catalog_products: { data: { price: 20, currency: 'usd', supplier_id: 'printful' }, error: null },
      site_catalog_selections: { data: null, error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });

    const res = await POST(req({
      slug: 'boutique',
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
        design_url: 'https://storage.example/brand-design.png',
        placement: 'front',
      }),
    ]);
  });

  it("produit catalogue vendu sur un site pod_brand SANS mockup correspondant -> aucun design attaché (rien à injecter)", async () => {
    const siteNoMockup = { ...SITE_POD_BRAND, pod_designs: [{ url: 'x', mockups: [] }] };
    const chains = setupTables({
      sites: { data: siteNoMockup, error: null },
      catalog_products: { data: { price: 20, currency: 'usd', supplier_id: 'printful' }, error: null },
      site_catalog_selections: { data: null, error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });

    const res = await POST(req({
      slug: 'boutique',
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
  const SITE_RESELLER = { ...SITE_MODE2, dropship_type: 'reseller' };
  const SITE_NULL_TYPE = { ...SITE_MODE2, dropship_type: null };
  const SITE_UNDEFINED_TYPE = (() => {
    const s: any = { ...SITE_MODE2 };
    delete s.dropship_type;
    return s;
  })();
  const SITE_UNEXPECTED_TYPE = { ...SITE_MODE2, dropship_type: 'legacy_mode_x' };
  const SITE_POD_CUSTOM = { ...SITE_MODE2, dropship_type: 'pod_custom' };

  // N1 (audit Mode 3 global) -- le checkout revalide desormais aussi que
  // catalog_products.supplier_id correspond au dropship_type du site ; ces
  // tests portent sur le gating du DESIGN, pas sur l'eligibilite fournisseur
  // (deja testee separement, describe N1 plus bas) -- supplierId choisi ici
  // pour etre TOUJOURS eligible au dropship_type teste, afin d'isoler
  // strictement le comportement etudie.
  function setupWithSite(site: unknown, supplierId: string = 'cj') {
    return setupTables({
      sites: { data: site, error: null },
      catalog_products: { data: { price: 20, currency: 'usd', supplier_id: supplierId }, error: null },
      site_catalog_selections: { data: null, error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });
  }

  it.each([
    ['reseller', SITE_RESELLER],
    ['null', SITE_NULL_TYPE],
    ['undefined', SITE_UNDEFINED_TYPE],
    ['valeur inattendue', SITE_UNEXPECTED_TYPE],
  ])('dropship_type=%s -> customDesignUrl injecté est supprimé, aucun order_item_designs créé', async (_label, site) => {
    const chains = setupWithSite(site, 'cj');
    const res = await POST(req({
      slug: 'boutique',
      items: [{ id: 'catalog-cp-1::111', quantity: 1, name: 'Produit', customDesignUrl: 'https://evil.example/anything.png' }],
    }));
    expect(res.status).toBe(200);
    // designRows reste vide -> order_item_designs jamais interrogee.
    expect(chains.get('order_item_designs')).toBeUndefined();
  });

  it('dropship_type=pod_custom -> customDesignUrl SANS ligne design_uploads correspondante est désormais rejeté (LOT J, F-CUSTOM-01 : plus de confiance aveugle dans l\'URL du client)', async () => {
    // Pas de handler design_uploads -> fallback {data:null} -> "not found".
    setupWithSite(SITE_POD_CUSTOM, 'printful');
    const res = await POST(req({
      slug: 'boutique',
      items: [{ id: 'catalog-cp-1::111', quantity: 1, name: 'Produit', customDesignUrl: 'https://buyer.example/my-design.png' }],
    }));
    expect(res.status).toBe(409);
  });
});

describe('POST /api/shop/checkout — LOT J (F-CUSTOM-01/04) : design_uploads, tenant-bound + single-use', () => {
  const SITE_POD_CUSTOM = { ...SITE_MODE2, dropship_type: 'pod_custom' };
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
      catalog_products: { data: { price: 20, currency: 'usd', supplier_id: 'printful' }, error: null },
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
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: true }], error: null },
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
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: true }], error: null },
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
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: true }], error: null },
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
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: true }], error: null },
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
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: true }], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });
    await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'jpy' }] }));
    const itemsArg = createCheckoutMock.mock.calls[0][2];
    expect(itemsArg[0].currency).toBe('usd');
  });

  it('panier multi-devises entre deux lignes server-résolues (catalog usd + shop eur) -> 409, jamais envoyé à Stripe', async () => {
    setupTables({
      sites: { data: SITE_MODE2, error: null },
      catalog_products: { data: { price: 10, currency: 'usd', supplier_id: 'cj' }, error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, currency: 'eur', published: true }], error: null },
    });
    const res = await POST(req({
      slug: 'boutique',
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
      catalog_products: { data: { price: 20, currency: 'usd', supplier_id: supplierId }, error: null },
      site_catalog_selections: { data: null, error: null },
    });
  }

  it("site reseller + produit Printful (jamais sélectionné par le marchand) -> 409, logAnomaly, jamais envoyé à Stripe", async () => {
    setup({ ...SITE_MODE2, dropship_type: 'reseller' }, 'printful');
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'catalog-cp-1::111', quantity: 1, name: 'Mug' }] }));
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toBe('Produit indisponible');
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'catalog_supplier_not_eligible' }));
  });

  it("site pod_brand + produit CJ (jamais destiné à ce sous-mode) -> 409", async () => {
    setup({ ...SITE_MODE2, dropship_type: 'pod_brand' }, 'cj');
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'catalog-cp-1::111', quantity: 1, name: 'Mug' }] }));
    expect(res.status).toBe(409);
  });

  it("site reseller + produit CJ (cas légitime) -> passe la garde, atteint le reste du flux", async () => {
    setupTables({
      sites: { data: { ...SITE_MODE2, dropship_type: 'reseller' }, error: null },
      catalog_products: { data: { price: 20, currency: 'usd', supplier_id: 'cj' }, error: null },
      site_catalog_selections: { data: null, error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'catalog-cp-1::111', quantity: 1, name: 'Mug' }] }));
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
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 100, currency: 'usd', published: true }], error: null },
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
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 100, currency: 'usd', published: true }], error: null },
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
