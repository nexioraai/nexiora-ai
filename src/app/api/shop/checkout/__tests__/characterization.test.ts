import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// LOT 0 -- TESTS DE CARACTERISATION (filet de securite)
//
// Ces tests ne verifient PAS que le comportement est correct. Ils FIGENT le
// comportement financier ACTUEL de checkout/route.ts, valeur par valeur,
// avant la refactorisation vers un devis canonique en centimes entiers
// (LOT 1-2). Toute divergence introduite par la refactorisation -- arrondi
// deplace, marge appliquee ailleurs, commission calculee sur une autre base --
// fera echouer ces tests, ce qui est exactement leur role.
//
// Un comportement fige ici peut donc etre un DEFAUT. Quand c'est le cas, le
// test le dit explicitement dans son intitule ; il devra etre mis a jour
// DELIBEREMENT au lot correspondant, jamais par accident.
//
// Aucun appel CJ reel : les adaptateurs fournisseurs sont mockes. Conforme a
// la contrainte architecturale checkout -> dropshipping (le checkout ne
// contacte jamais un fournisseur pour une COMMANDE ; ici meme les devis sont
// simules).
// ============================================================

const checkStockMock = vi.fn();
vi.mock('@/lib/shop', () => ({ checkStock: (...a: unknown[]) => checkStockMock(...a) }));

const checkCatalogStockMock = vi.fn();
vi.mock('@/lib/catalog-stock', () => ({
  checkCatalogStock: (...a: unknown[]) => checkCatalogStockMock(...a),
}));

const createCheckoutMock = vi.fn();
vi.mock('@/lib/payments', () => ({
  getProvider: vi.fn(() => ({ createCheckout: (...a: unknown[]) => createCheckoutMock(...a) })),
}));

// Aucun adaptateur live : le chemin cache est alors le SEUL producteur de
// frais de port CJ, ce qui isole exactement ce que le LOT 1 va deplacer.
vi.mock('@/lib/suppliers/registry', () => ({ suppliersWithCapability: () => [] }));

const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({ logAnomaly: (...a: unknown[]) => logAnomalyMock(...a) }));

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { POST } from '../route';

type Handlers = Record<string, { data: unknown; error?: unknown }>;

function tableChain(response: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.in = vi.fn(self);
  chain.insert = vi.fn(self);
  chain.is = vi.fn(self);
  const narrowed = Array.isArray(response.data)
    ? { data: response.data[0] ?? null, error: response.error ?? null }
    : response;
  chain.single = vi.fn(async () => narrowed);
  chain.maybeSingle = vi.fn(async () => narrowed);
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

function setupTables(handlers: Handlers) {
  const chains = new Map<string, ReturnType<typeof tableChain>>();
  fromMock.mockImplementation((table: string) => {
    if (!chains.has(table)) {
      chains.set(table, tableChain(handlers[table] ?? { data: null, error: null }));
    }
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

const SITE_MODE2 = {
  id: 'site-1', payment_provider: 'stripe', payment_account_id: 'acct_1',
  shipping_flat: 5, mode: 2, cj_margin_percent: null, cj_round_mode: null,
  dropship_type: null, pod_designs: null,
};
const SITE_MODE3 = { ...SITE_MODE2, mode: 3, dropship_type: 'reseller' };

/** Paliers CJ tels que stockes en cache : PRIX BRUT, sans marge. */
const CACHE_TIERS = [
  { tier: 'eco', name: 'CJPacket Ordinary', cost: 2, days_min: 7, days_max: 15 },
  { tier: 'standard', name: 'CJPacket Sensitive', cost: 3, days_min: 4, days_max: 7 },
  { tier: 'express', name: 'DHL Official', cost: 4, days_min: 3, days_max: 5 },
];

/** Empreinte financiere complete d'un checkout : ce que le LOT 1 doit preserver. */
function fingerprint(chains: Map<string, ReturnType<typeof tableChain>>) {
  const insertFn = chains.get('shop_orders')?.insert as ReturnType<typeof vi.fn> | undefined;
  const row = insertFn?.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
  const args = createCheckoutMock.mock.calls[0] ?? [];
  return {
    // --- ce qui part chez Stripe ---
    stripeShipping: args[5],
    stripeApplicationFee: args[6],
    stripeNonce: args[7],
    stripePromoDiscount: args[8],
    // --- ce qui est enregistre en base ---
    orderTotal: row?.total,
    orderShipping: row?.shipping_amount,
    orderSupplierCost: row?.supplier_cost,
    orderCommission: row?.nexiora_commission,
    orderProfit: row?.merchant_profit,
    orderTier: row?.shipment_tier,
    orderLogisticName: row?.shipment_logistic_name,
    orderCurrency: row?.currency,
  };
}

beforeEach(() => {
  fromMock.mockReset();
  checkStockMock.mockReset().mockResolvedValue({ ok: true });
  checkCatalogStockMock.mockReset().mockResolvedValue({ ok: true });
  logAnomalyMock.mockReset();
  createCheckoutMock.mockReset().mockResolvedValue({
    url: 'https://checkout.stripe.test/c/pay/cs_test_1',
    orderId: 'cs_test_1',
  });
});

// ------------------------------------------------------------
// Mode 2 -- forfait de livraison, aucune commission avancee
// ------------------------------------------------------------
describe('CARACTERISATION -- Mode 2 (forfait)', () => {
  function setupMode2(promo: unknown = null, price = 100) {
    return setupTables({
      sites: { data: SITE_MODE2 },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price, currency: 'usd', published: true }] },
      promo_codes: { data: promo },
      shop_orders: { data: { id: 'order-1' } },
      shop_order_items: { data: [{ id: 'item-1' }] },
    });
  }
  const order = (extra: Record<string, unknown> = {}, quantity = 1) =>
    req({ slug: 'boutique', countryCode: 'CA', items: [{ id: 'p1', quantity, name: 'T', currency: 'usd' }], ...extra });

  it('A1 -- produit 100 usd, qty 1, forfait 5, sans promo', async () => {
    const chains = setupMode2();
    const res = await POST(order());
    expect(res.status).toBe(200);
    expect(fingerprint(chains)).toEqual({
      stripeShipping: 5, stripeApplicationFee: 0, stripeNonce: undefined, stripePromoDiscount: 0,
      orderTotal: 100, orderShipping: 5, orderSupplierCost: 0,
      orderCommission: 6, orderProfit: 94, orderTier: null,
      orderLogisticName: null, orderCurrency: 'usd',
    });
  });

  it('A2 -- qty 3 : le total suit la quantite, le FORFAIT de livraison ne la suit PAS', async () => {
    const chains = setupMode2();
    const res = await POST(order({}, 3));
    expect(res.status).toBe(200);
    const f = fingerprint(chains);
    expect(f.orderTotal).toBe(300);
    expect(f.orderShipping).toBe(5);       // forfait, jamais multiplie
    expect(f.orderCommission).toBe(18);
    expect(f.orderProfit).toBe(282);
  });

  it('A3 -- promo 20% : la commission reste calculee AVANT remise (decision OPTION A)', async () => {
    const chains = setupMode2({
      id: 'promo-1', discount_type: 'percent', discount_value: 20,
      min_order: 0, max_uses: null, used_count: 0, expires_at: null,
    });
    const res = await POST(order({ promoCode: 'X20' }));
    expect(res.status).toBe(200);
    const f = fingerprint(chains);
    expect(f.stripePromoDiscount).toBe(20);
    expect(f.orderTotal).toBe(80);        // encaisse = apres remise
    expect(f.orderCommission).toBe(6);    // 6% de 100, PAS de 80
    expect(f.orderProfit).toBe(74);
  });

  it("A4 -- DEFAUT FIGE : remise fixe >= total -> total 0 et profit NEGATIF, non bloque en Mode 2", async () => {
    const chains = setupMode2({
      id: 'promo-2', discount_type: 'fixed', discount_value: 9999,
      min_order: 0, max_uses: null, used_count: 0, expires_at: null,
    });
    const res = await POST(order({ promoCode: 'FREE' }));
    // Les garde-fous financiers sont TOUS dans le bloc `if (site.mode === 3)`.
    // En Mode 2 rien n'empeche un profit marchand negatif.
    expect(res.status).toBe(200);
    const f = fingerprint(chains);
    expect(f.stripePromoDiscount).toBe(100);
    expect(f.orderTotal).toBe(0);
    expect(f.orderProfit).toBe(-6);
  });
});

// ------------------------------------------------------------
// Mode 3 -- cache CJ, marge +20 %, commission avancee
// ------------------------------------------------------------
describe('CARACTERISATION -- Mode 3 (cache CJ + marge 20%)', () => {
  function setupMode3(opts: { tiers?: unknown; sellPrice?: number; cost?: number } = {}) {
    return setupTables({
      sites: { data: SITE_MODE3 },
      // Tableau volontairement : la route interroge cette table en LISTE
      // (.in(), bloc livraison) puis en LIGNE UNIQUE (.maybeSingle(), bloc
      // prix). Le harnais narrowe data[0] pour la seconde ; une fixture objet
      // casserait la premiere (`for...of` sur un non-iterable).
      catalog_products: {
        data: [{ id: 'cat-1', supplier_id: 'cj', supplier_product_id: 'VID1', price: opts.cost ?? 10, currency: 'usd' }],
      },
      site_catalog_selections: { data: { sell_price: opts.sellPrice ?? 30 } },
      shipping_cache: {
        data: [{
          supplier_product_id: 'VID1', shipping_cost: 2, days_min: 7, days_max: 15,
          tiers: opts.tiers === undefined ? CACHE_TIERS : opts.tiers,
        }],
      },
      promo_codes: { data: null },
      shop_orders: { data: { id: 'order-1' } },
      shop_order_items: { data: [{ id: 'item-1' }] },
    });
  }
  const order = (extra: Record<string, unknown> = {}, quantity = 1) =>
    req({ slug: 'boutique', countryCode: 'CA', items: [{ id: 'catalog-cat-1', quantity, name: 'P', currency: 'usd' }], ...extra });

  it('B1 -- palier standard : cout cache 3 -> facture 3.60 (marge x1.20 appliquee ICI)', async () => {
    const chains = setupMode3();
    const res = await POST(order({ shipmentTier: 'standard' }));
    expect(res.status).toBe(200);
    const f = fingerprint(chains);
    expect(f.orderShipping).toBe(3.6);
    expect(f.stripeShipping).toBe(3.6);
    expect(f.orderTier).toBe('standard');
    expect(f.orderLogisticName).toBe('CJPacket Sensitive');
    expect(f.orderSupplierCost).toBe(10);
    expect(f.orderTotal).toBe(30);
  });

  it('B2 -- application_fee = coutFournisseur + livraison + commission', async () => {
    const chains = setupMode3();
    await POST(order({ shipmentTier: 'standard' }));
    const f = fingerprint(chains);
    // 10 + 3.6 + 1.8 = 15.4  (sujet a derive flottante -- c'est le point du LOT 1)
    expect(f.stripeApplicationFee).toBeCloseTo(15.4, 10);
    expect(f.orderCommission).toBeCloseTo(1.8, 10);
  });

  it('B3 -- palier express : cout cache 4 -> facture 4.80', async () => {
    const chains = setupMode3();
    await POST(order({ shipmentTier: 'express' }));
    expect(fingerprint(chains).orderShipping).toBe(4.8);
  });

  it('B4 -- DEFAUT FIGE : qty 2 -> livraison MULTIPLIEE lineairement (3 x 2 x 1.20 = 7.20)', async () => {
    const chains = setupMode3();
    await POST(order({ shipmentTier: 'standard' }, 2));
    const f = fingerprint(chains);
    // Le cache provient d'un devis CJ pour UNE unite. La multiplication
    // lineaire n'est pas un devis reel -- fige ici, traite au LOT 5.
    expect(f.orderShipping).toBe(7.2);
    expect(f.orderTotal).toBe(60);
  });

  it('B5 -- palier demande indisponible -> repli sur shipping_cost (2 x 1.20 = 2.40)', async () => {
    const chains = setupMode3();
    await POST(order({ shipmentTier: 'inexistant' }));
    expect(fingerprint(chains).orderShipping).toBe(2.4);
  });

  it('B6 -- aucun palier en cache -> repli sur shipping_cost, marge appliquee quand meme', async () => {
    const chains = setupMode3({ tiers: null });
    await POST(order({ shipmentTier: 'standard' }));
    expect(fingerprint(chains).orderShipping).toBe(2.4);
  });
});

// ------------------------------------------------------------
// Derive flottante -- ce que le LOT 1 (centimes entiers) doit supprimer
// ------------------------------------------------------------
describe('CARACTERISATION -- derive flottante ECRITE EN BASE', () => {
  it("D1 -- DEFAUT FIGE : nexiora_commission vaut 1.7999999999999998, pas 1.8", async () => {
    const chains = setupTables({
      sites: { data: SITE_MODE3 },
      catalog_products: {
        data: [{ id: 'cat-1', supplier_id: 'cj', supplier_product_id: 'VID1', price: 10, currency: 'usd' }],
      },
      site_catalog_selections: { data: { sell_price: 30 } },
      shipping_cache: {
        data: [{ supplier_product_id: 'VID1', shipping_cost: 2, days_min: 7, days_max: 15, tiers: CACHE_TIERS }],
      },
      promo_codes: { data: null },
      shop_orders: { data: { id: 'order-1' } },
      shop_order_items: { data: [{ id: 'item-1' }] },
    });
    await POST(req({
      slug: 'boutique', countryCode: 'CA', shipmentTier: 'standard',
      items: [{ id: 'catalog-cat-1', quantity: 1, name: 'P', currency: 'usd' }],
    }));
    const row = (chains.get('shop_orders')!.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // 30 * (6/100) en IEEE754. La valeur derivee est PERSISTEE telle quelle :
    // toute agregation comptable en herite. Corrige au LOT 1 (centimes entiers).
    expect(row.nexiora_commission).toBe(1.7999999999999998);
    expect(row.nexiora_commission).not.toBe(1.8);
    // Le fee envoye a Stripe est arrondi au centime par stripe.ts, la derive
    // ne se propage donc PAS jusqu'a la charge reelle.
    expect(Math.round((10 + 3.6 + row.nexiora_commission) * 100)).toBe(1540);
  });
});
