import { describe, it, expect, vi, beforeEach } from 'vitest';

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

function setupTables(handlers: Handlers, fallback: { data: unknown; error?: unknown } = { data: null, error: null }) {
  fromMock.mockImplementation((table: string) => tableChain(handlers[table] ?? fallback));
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
  function setupCjCacheShipping(shippingCost: number) {
    setupTables({
      sites: { data: SITE_MODE3, error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: 'vid-1', price: 30, cost_price: 10 }], error: null },
      shipping_cache: { data: [{ supplier_product_id: 'vid-1', shipping_cost: shippingCost, days_min: 10, days_max: 20, tiers: null }], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });
  }

  it('livraison hors plage raisonnable (>150) -> 409 + logAnomaly(shipping_out_of_range), Nexiora n\'absorbe jamais un cout excessif', async () => {
    setupCjCacheShipping(150); // *1.20 (marge cache) = 180 > 150
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1 }], countryCode: 'US' }));
    expect(res.status).toBe(409);
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'shipping_out_of_range' }));
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/shop/checkout — succès (chemin critique métier)', () => {
  it('Mode 2 : checkout créé, applicationFeeAmount = 0 (le marchand garde son stock/livraison)', async () => {
    setupTables({
      sites: { data: SITE_MODE2, error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 30, cost_price: 10 }], error: null },
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
      0  // applicationFeeAmount = 0 en Mode 2
    );
  });

  it('Mode 3 : checkout créé via le cache CJ, applicationFeeAmount = coût fournisseur + livraison + commission Nexiora', async () => {
    setupTables({
      sites: { data: SITE_MODE3, error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: 'vid-1', price: 30, cost_price: 10 }], error: null },
      shipping_cache: { data: [{ supplier_product_id: 'vid-1', shipping_cost: 5, days_min: 10, days_max: 20, tiers: null }], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });

    const res = await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'usd' }], countryCode: 'US' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.url).toBe('https://pay.example/session');
    // shipping = 5 * 1.20 (marge cache) = 6 ; commission = 30*0.06 = 1.8
    // applicationFeeAmount = supplierCost(10) + shipping(6) + commission(1.8) = 17.8
    expect(createCheckoutMock).toHaveBeenCalledWith(
      'acct_1', 'boutique', expect.anything(), expect.anything(), expect.anything(),
      6,
      17.8
    );
  });
});

describe('POST /api/shop/checkout — erreurs inattendues', () => {
  it('exception non gérée -> 500, jamais un crash silencieux', async () => {
    fromMock.mockImplementation(() => { throw new Error('DB down'); });
    const res = await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1 }] }));
    expect(res.status).toBe(500);
  });
});
