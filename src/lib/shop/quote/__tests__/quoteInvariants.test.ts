import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// LOT 2 -- INVARIANT CROISE : "affiche = facture".
//
// Les deux caracterisations existantes testent chaque route SEPAREMENT.
// Aucune ne pouvait detecter C3 ni C4, qui sont par nature des divergences
// ENTRE les deux : chaque route etait "correcte" isolement, elles ne
// s'accordaient simplement pas.
//
// Ce fichier execute les DEUX routes sur des fixtures IDENTIQUES et compare
// leurs resultats. C'est le seul test capable de faire echouer une future
// modification qui ne toucherait qu'un seul des deux chemins.
//
// `displayedAmount()` reproduit exactement la regle de CartDrawer.tsx
// (lignes 300-308) : si des paliers arrivent, l'acheteur voit le palier
// 'standard' ; sinon il voit `shipping`. Comparer autre chose que cela
// ne prouverait rien sur ce que l'acheteur lit reellement a l'ecran.
//
// Aucun appel fournisseur reel : adaptateurs mockes.
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

const calculateShippingMock = vi.fn();
vi.mock('@/lib/suppliers/registry', () => ({
  suppliersWithCapability: () => [
    { id: 'cj', credentials: {}, adapter: { calculateShipping: (...a: unknown[]) => calculateShippingMock(...a) } },
  ],
}));

vi.mock('@/lib/anomaly', () => ({ logAnomaly: vi.fn() }));

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { POST as CHECKOUT } from '@/app/api/shop/checkout/route';
import { POST as CALCULATE } from '@/app/api/shop/shipping/calculate/route';

type Handlers = Record<string, { data: unknown; error?: unknown }>;

function tableChain(response: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'in', 'insert', 'is']) chain[m] = vi.fn(self);
  const narrowed = Array.isArray(response.data)
    ? { data: response.data[0] ?? null, error: response.error ?? null }
    : response;
  chain.single = vi.fn(async () => narrowed);
  chain.maybeSingle = vi.fn(async () => narrowed);
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

const CACHE_TIERS = [
  { tier: 'eco', name: 'CJPacket Ordinary', cost: 2, days_min: 7, days_max: 15 },
  { tier: 'standard', name: 'CJPacket Sensitive', cost: 3, days_min: 4, days_max: 7 },
  { tier: 'express', name: 'DHL Official', cost: 4, days_min: 3, days_max: 5 },
];

const SITE = {
  id: 'site-1', slug: 'boutique', payment_provider: 'stripe', payment_account_id: 'acct_1',
  shipping_flat: 5, mode: 3, cj_margin_percent: null, cj_round_mode: null,
  dropship_type: 'reseller', pod_designs: null,
};

/** Fixtures partagees : les DEUX routes lisent exactement la meme base. */
function handlers(opts: { tiers?: unknown; cached?: boolean; flat?: boolean } = {}): Handlers {
  return {
    // Chemin 'flat' = produit BOUTIQUE sans fournisseur, donc Mode 2 (le
    // Mode 3 refuse toute vente dont la livraison n'est pas confirmee par un
    // fournisseur -- garde-fou existant, volontairement preserve).
    sites: { data: opts.flat ? { ...SITE, mode: 2, dropship_type: null } : SITE },
    catalog_products: {
      data: [{ id: 'cat-1', supplier_id: 'cj', supplier_product_id: 'VID1', price: 10, currency: 'usd' }],
    },
    shop_products: {
      data: opts.flat ? [{ id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: true }] : [],
    },
    site_catalog_selections: { data: { sell_price: 30 } },
    shipping_cache: {
      data: opts.cached === false
        ? []
        : [{ supplier_product_id: 'VID1', shipping_cost: 2, days_min: 7, days_max: 15, tiers: opts.tiers === undefined ? CACHE_TIERS : opts.tiers }],
    },
    promo_codes: { data: null },
    shop_orders: { data: { id: 'order-1' } },
    shop_order_items: { data: [{ id: 'item-1' }] },
  };
}

function install(h: Handlers) {
  const chains = new Map<string, ReturnType<typeof tableChain>>();
  fromMock.mockImplementation((table: string) => {
    if (!chains.has(table)) chains.set(table, tableChain(h[table] ?? { data: null, error: null }));
    return chains.get(table)!;
  });
  return chains;
}

const CATALOG_ITEM = { id: 'catalog-cat-1', quantity: 1, name: 'P', currency: 'usd' };
const SHOP_ITEM = { id: 'p1', quantity: 1, name: 'T', currency: 'usd' };

/** Reproduit la regle d'affichage de CartDrawer.tsx:300-308. */
function displayedAmount(json: { shipping: number; cjTiers: { tier: string; cost: number }[] | null }) {
  if (Array.isArray(json.cjTiers) && json.cjTiers.length > 0) {
    const std = json.cjTiers.find((t) => t.tier === 'standard') || json.cjTiers[0];
    return { amount: Number(std.cost) || 0, tier: std.tier };
  }
  return { amount: Number(json.shipping) || 0, tier: null as string | null };
}

/** Execute l'affichage puis le checkout sur les MEMES fixtures. */
async function bothRoutes(opts: Parameters<typeof handlers>[0] = {}) {
  const item = opts.flat ? SHOP_ITEM : CATALOG_ITEM;
  install(handlers(opts));
  const display = await (
    await CALCULATE(new Request('https://w.test/api/shop/shipping/calculate', {
      method: 'POST',
      body: JSON.stringify({ slug: 'boutique', countryCode: 'CA', items: [{ id: item.id, quantity: 1 }] }),
    }))
  ).json();

  const shown = displayedAmount(display);

  const chains = install(handlers(opts));
  await CHECKOUT(new Request('https://w.test/api/shop/checkout', {
    method: 'POST',
    body: JSON.stringify({ slug: 'boutique', countryCode: 'CA', items: [item], shipmentTier: shown.tier }),
  }));
  const insert = chains.get('shop_orders')?.insert as ReturnType<typeof vi.fn> | undefined;
  const row = (insert?.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>;

  return { display, shown, charged: row };
}

beforeEach(() => {
  fromMock.mockReset();
  checkStockMock.mockReset().mockResolvedValue({ ok: true });
  checkCatalogStockMock.mockReset().mockResolvedValue({ ok: true });
  calculateShippingMock.mockReset().mockResolvedValue({ total_cost: 2, estimated_days_min: 7, estimated_days_max: 15 });
  createCheckoutMock.mockReset().mockResolvedValue({ url: 'https://stripe.test/cs_1', orderId: 'cs_1' });
});

describe('LOT 2 -- invariant "montant affiche = montant facture"', () => {
  it('I1 -- cache avec paliers : 3.60 affiche, 3.60 facture, meme palier, transporteur conserve', async () => {
    const { display, shown, charged } = await bothRoutes();
    expect(shown.amount).toBe(3.6);
    expect(charged.shipping_amount).toBe(shown.amount);
    expect(charged.shipment_tier).toBe('standard');
    expect(display.source).toBe('cache');
    // Le transporteur reel n'est jamais expose au navigateur, mais il est
    // bien conserve cote commande pour le fulfillment.
    expect(charged.shipment_logistic_name).toBe('CJPacket Sensitive');
    expect(JSON.stringify(display)).not.toContain('CJPacket');
  });

  it('I2 -- C3 : cache SANS paliers -> meme montant des deux cotes (2.40)', async () => {
    const { shown, charged, display } = await bothRoutes({ tiers: null });
    expect(shown.amount).toBe(2.4);
    expect(charged.shipping_amount).toBe(shown.amount);
    expect(display.source).toBe('cache');
  });

  it('I3 -- C4 : adaptateur live en echec + cache complet -> les deux utilisent le cache', async () => {
    calculateShippingMock.mockRejectedValue(new Error('CJ down'));
    const { display, shown, charged } = await bothRoutes();
    expect(display.source).toBe('cache');
    expect(shown.amount).toBe(3.6);
    expect(charged.shipping_amount).toBe(shown.amount);
    expect(calculateShippingMock).not.toHaveBeenCalled();
  });

  it('I4 -- chemin live (aucun cache) : meme montant des deux cotes, aucune marge appliquee', async () => {
    const { display, shown, charged } = await bothRoutes({ cached: false });
    expect(display.source).toBe('live');
    expect(shown.amount).toBe(2);            // devis live exact, sans marge
    expect(charged.shipping_amount).toBe(shown.amount);
  });

  it('I5 -- forfait (aucun produit fournisseur) : meme montant des deux cotes', async () => {
    const { display, shown, charged } = await bothRoutes({ flat: true });
    expect(display.source).toBe('flat');
    expect(shown.amount).toBe(5);
    expect(charged.shipping_amount).toBe(5);
  });

  it('I6 -- les montants des deux routes sont exacts au centime et strictement egaux, sur tous les chemins', async () => {
    for (const opts of [{}, { tiers: null }, { cached: false }, { flat: true }]) {
      const { shown, charged } = await bothRoutes(opts);
      const amount = charged.shipping_amount as number;
      expect(amount, JSON.stringify(opts)).toBe(shown.amount);
      expect(Math.abs(amount * 100 - Math.round(amount * 100)), JSON.stringify(opts)).toBeLessThan(1e-9);
    }
  });
});
