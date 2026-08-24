// src/app/api/shop/checkout/__tests__/a6SupplierAdapters.test.ts
//
// PHASE 6 du chantier de séparation Mode 2 / Mode 3 — contrat A6, côté vente.
// Plan de référence : docs/PLAN-SEPARATION-MODE2-MODE3.md
//
// ============================================================
// A6 — UNE VENTE MARCHANDE N'ATTEINT AUCUN ADAPTATEUR FOURNISSEUR.
//
// POURQUOI CE FICHIER EXISTE. Les trois fichiers de test du checkout mockent
// tous `@/lib/mode3/catalogStock` — et l'un d'eux mocke aussi
// `shop/quote/resolveShipping`. Le vrai code de vérification de stock et de
// devis n'y tourne donc jamais, et **aucun adaptateur fournisseur n'y est
// observable**. La phase 5 a prouvé que le Mode 2 est refusé AVANT ces
// modules ; c'est une preuve au niveau MODULE. A6 demande la frontière
// elle-même.
//
// CE FICHIER NE MOCKE QUE LA COUCHE LA PLUS BASSE : le registre fournisseur
// et le client CJ. `checkCatalogStock`, `buildSupplierGroups`,
// `resolveShipping` et `mode3/supplierShipping` s'exécutent RÉELLEMENT. Ce
// qui est observé est donc `adapter.checkStock`, `adapter.calculateShipping`
// et `cjCalculateFreight` — les trois seules portes par lesquelles une vente
// atteint un fournisseur.
//
// LE CONTRÔLE POSITIF EST INDISSOCIABLE DES DEUX AUTRES CAS : sans lui, des
// assertions « non appelé » seraient vertes même si le harnais n'atteignait
// jamais ces portes, quel que soit le domaine. C'est le même principe que le
// contrat A6 de `cancel-order`.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Couche la plus basse : ce que le fournisseur expose réellement ----
const checkStockMock = vi.fn();
const calculateShippingMock = vi.fn();
const cjCalculateFreightMock = vi.fn();

vi.mock('@/lib/suppliers/registry', () => ({
  suppliersWithCapability: () => [
    {
      id: 'cj',
      credentials: { email: 'e', apiKey: 'k' },
      adapter: {
        checkStock: (...a: unknown[]) => checkStockMock(...a),
        calculateShipping: (...a: unknown[]) => calculateShippingMock(...a),
      },
    },
  ],
}));

vi.mock('@/lib/cj/client', () => ({
  cjCalculateFreight: (...a: unknown[]) => cjCalculateFreightMock(...a),
}));

// ---- Infrastructure, sans rapport avec la frontière mesurée ----
const checkStockLocalMock = vi.fn();
vi.mock('@/lib/shop', () => ({ checkStock: (...a: unknown[]) => checkStockLocalMock(...a) }));

const createCheckoutMock = vi.fn();
vi.mock('@/lib/payments', () => ({
  getProvider: () => ({ createCheckout: (...a: unknown[]) => createCheckoutMock(...a) }),
}));

const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({ logAnomaly: (...a: unknown[]) => logAnomalyMock(...a) }));

type Handlers = Record<string, { data?: unknown; error?: unknown; count?: number }>;

/** Chaîne Supabase complète : le vrai `resolveShipping` utilise aussi
 *  `.gte()` (budget d'appels), `.upsert()` et `.delete().lt()` (purge). */
function tableChain(response: { data?: unknown; error?: unknown; count?: number }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'in', 'insert', 'upsert', 'delete', 'lt', 'gte', 'is', 'order', 'limit']) {
    chain[m] = vi.fn(self);
  }
  const narrowed = Array.isArray(response.data)
    ? { data: response.data[0] ?? null, error: response.error ?? null }
    : response;
  chain.single = vi.fn(async () => narrowed);
  chain.maybeSingle = vi.fn(async () => narrowed);
  chain.then = (resolve: (v: unknown) => void) => resolve({ count: 0, error: null, ...response });
  return chain;
}

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { POST } from '../route';

function setupTables(handlers: Handlers) {
  const chains = new Map<string, ReturnType<typeof tableChain>>();
  fromMock.mockImplementation((table: string) => {
    if (!chains.has(table)) chains.set(table, tableChain(handlers[table] ?? { data: null, error: null }));
    return chains.get(table)!;
  });
}

function req(body: unknown) {
  return new Request('https://woorri.test/api/shop/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const SITE_MODE3 = {
  id: 'site-1', payment_provider: 'stripe', payment_account_id: 'acct_1',
  shipping_flat: 5, mode: 3, cj_margin_percent: null, cj_round_mode: null,
};
const SITE_MODE2 = { ...SITE_MODE3, mode: 2 };

const PRODUIT_CATALOGUE = {
  id: 'cp-1', price: 10, currency: 'usd', supplier_id: 'cj',
  supplier_product_id: 'vid-1', in_stock: true, name: 'Mug',
};
/** Produit du marchand : il détient son stock, aucun identifiant fournisseur. */
const PRODUIT_MARCHAND = { id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: true };

beforeEach(() => {
  fromMock.mockReset();
  checkStockMock.mockReset().mockResolvedValue({ available: true });
  calculateShippingMock.mockReset().mockResolvedValue({ total_cost: 5, estimated_days_min: 3, estimated_days_max: 7 });
  cjCalculateFreightMock.mockReset().mockResolvedValue([
    { logisticName: 'CJPacket', logisticPrice: 4, logisticAging: '5-9' },
  ]);
  checkStockLocalMock.mockReset().mockResolvedValue({ ok: true });
  logAnomalyMock.mockReset();
  createCheckoutMock.mockReset().mockResolvedValue({
    url: 'https://checkout.stripe.test/c/pay/cs_test_1',
    orderId: 'cs_test_1',
  });
});

/** Les trois seules portes par lesquelles une vente atteint un fournisseur. */
function aucunAdaptateurAtteint(contexte: string) {
  expect(checkStockMock, `${contexte} — adapter.checkStock`).not.toHaveBeenCalled();
  expect(cjCalculateFreightMock, `${contexte} — cjCalculateFreight`).not.toHaveBeenCalled();
  expect(calculateShippingMock, `${contexte} — adapter.calculateShipping`).not.toHaveBeenCalled();
}

describe('A6 — le checkout et la frontière fournisseur', () => {
  it('CONTRÔLE — une vente fournisseur atteint RÉELLEMENT les adaptateurs', async () => {
    setupTables({
      sites: { data: SITE_MODE3, error: null },
      catalog_products: { data: [PRODUIT_CATALOGUE], error: null },
      site_catalog_selections: { data: null, error: null },
      shipping_quote_cache: { data: null, error: null, count: 0 },
      shipping_cache: { data: [], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });

    await POST(req({ slug: 'boutique', items: [{ id: 'catalog-cp-1::vid-1', quantity: 1 }], countryCode: 'US' }));

    expect(
      checkStockMock,
      "sans cet appel, les assertions « non appelé » des deux cas suivants seraient vertes pour la mauvaise raison"
    ).toHaveBeenCalled();
    expect(cjCalculateFreightMock).toHaveBeenCalled();
  });

  it('A6 — vente marchande NOMINALE (produits du marchand) : aucun adaptateur, et la vente aboutit', async () => {
    setupTables({
      sites: { data: SITE_MODE2, error: null },
      shop_products: { data: [PRODUIT_MARCHAND], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });

    const res = await POST(req({ slug: 'boutique', items: [{ id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'usd' }] }));

    expect(res.status, 'une boutique autonome doit pouvoir vendre ses propres produits').toBe(200);
    expect(createCheckoutMock).toHaveBeenCalled();
    aucunAdaptateurAtteint('vente marchande nominale');
  });

  it('A6 — vente marchande REFUSÉE (produit de catalogue) : aucun adaptateur non plus', async () => {
    setupTables({
      sites: { data: SITE_MODE2, error: null },
      catalog_products: { data: [PRODUIT_CATALOGUE], error: null },
      site_catalog_selections: { data: null, error: null },
      shipping_quote_cache: { data: null, error: null, count: 0 },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });

    const res = await POST(req({ slug: 'boutique', items: [{ id: 'catalog-cp-1::vid-1', quantity: 1 }], countryCode: 'US' }));

    expect(res.status).toBe(409);
    aucunAdaptateurAtteint('vente marchande refusée par D2');
  });

  it('A6 — en APERÇU non plus : l’aperçu saute le stock mais calculait bien un devis', async () => {
    setupTables({
      sites: { data: SITE_MODE2, error: null },
      catalog_products: { data: [PRODUIT_CATALOGUE], error: null },
      site_catalog_selections: { data: null, error: null },
      shipping_quote_cache: { data: null, error: null, count: 0 },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });

    await POST(req({ slug: 'boutique', items: [{ id: 'catalog-cp-1::vid-1', quantity: 1 }], countryCode: 'US', preview: true }));

    aucunAdaptateurAtteint('aperçu marchand');
  });
});
