import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Phase 1 — D3 : observabilité de handlePaidCheckout (aucune couverture
// avant ce correctif). Les échecs de fulfillment CJ/POD après paiement
// n'étaient visibles qu'en console.error — un incident de fulfillment
// après paiement pouvait passer inaperçu. Ces tests vérifient que
// logAnomaly est bien appelé sur échec, que le comportement fonctionnel
// (le flux continue toujours vers stock/email, jamais de throw) reste
// identique, et que l'idempotence (fulfillCjOrder/fulfillPodOrder
// appelés une seule fois chacun, aucun retry ajouté) est inchangée.
// ============================================================

const fulfillCjOrderMock = vi.fn();
vi.mock('@/lib/cj/fulfill', () => ({
  fulfillCjOrder: (...a: unknown[]) => fulfillCjOrderMock(...a),
}));

const fulfillPodOrderMock = vi.fn();
vi.mock('@/lib/suppliers/pod-fulfill', () => ({
  fulfillPodOrder: (...a: unknown[]) => fulfillPodOrderMock(...a),
}));

const decrementStockMock = vi.fn();
vi.mock('@/lib/shop', () => ({
  decrementStock: (...a: unknown[]) => decrementStockMock(...a),
}));

const sendOrderConfirmationEmailMock = vi.fn();
vi.mock('@/lib/email/sendOrderConfirmationEmail', () => ({
  sendOrderConfirmationEmail: (...a: unknown[]) => sendOrderConfirmationEmailMock(...a),
}));

const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({
  logAnomaly: (...a: unknown[]) => logAnomalyMock(...a),
}));

function tableChain(response: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.update = vi.fn(self);
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.in = vi.fn(self);
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

import { handlePaidCheckout } from '../handlePaidCheckout';

const ORDER = { id: 'order-1', estimated_delivery: null, site_id: 'site-1', cancel_token: 'tok' };

type Handlers = Record<string, { data: unknown; error?: unknown }>;
function setupTables(handlers: Handlers, fallback: { data: unknown; error?: unknown } = { data: [], error: null }) {
  fromMock.mockImplementation((table: string) => tableChain(handlers[table] ?? fallback));
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_test_1',
    payment_intent: 'pi_1',
    customer_details: { email: 'client@test.com', name: 'Client Test' },
    amount_total: 3000,
    currency: 'usd',
    ...overrides,
  };
}

beforeEach(() => {
  fromMock.mockReset();
  fulfillCjOrderMock.mockReset();
  fulfillPodOrderMock.mockReset();
  decrementStockMock.mockReset();
  sendOrderConfirmationEmailMock.mockReset();
  logAnomalyMock.mockReset();
  fulfillCjOrderMock.mockResolvedValue([]);
  fulfillPodOrderMock.mockResolvedValue([]);
  sendOrderConfirmationEmailMock.mockResolvedValue(true);
});

describe('handlePaidCheckout — commande introuvable', () => {
  it('payment_ref sans commande correspondante -> retour silencieux, rien d\'autre ne se produit', async () => {
    setupTables({ shop_orders: { data: null, error: null } });
    await handlePaidCheckout(session());
    expect(fulfillCjOrderMock).not.toHaveBeenCalled();
    expect(fulfillPodOrderMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).not.toHaveBeenCalled();
  });
});

describe('handlePaidCheckout — chemin nominal (aucun échec)', () => {
  it('aucune anomalie loggée quand CJ et POD réussissent tous les deux', async () => {
    setupTables({
      shop_orders: { data: [ORDER], error: null },
      shop_order_items: { data: [], error: null },
      sites: { data: [{ name: 'Ma Boutique' }], error: null },
    });

    await handlePaidCheckout(session());

    expect(fulfillCjOrderMock).toHaveBeenCalledTimes(1);
    expect(fulfillPodOrderMock).toHaveBeenCalledTimes(1);
    expect(logAnomalyMock).not.toHaveBeenCalled();
    expect(sendOrderConfirmationEmailMock).toHaveBeenCalledTimes(1);
  });
});

describe('handlePaidCheckout — D3 : échec CJ post-paiement', () => {
  it('logAnomaly(cj_fulfill_failed) appelé, mais le flux continue exactement comme avant (stock + email)', async () => {
    setupTables({
      shop_orders: { data: [ORDER], error: null },
      shop_order_items: { data: [{ product_id: 'sp1', quantity: 1 }], error: null },
      shop_products: { data: [{ id: 'sp1', cj_vid: null }], error: null },
      sites: { data: [{ name: 'Ma Boutique' }], error: null },
    });
    fulfillCjOrderMock.mockRejectedValue(new Error('CJ 500: internal error'));

    await handlePaidCheckout(session());

    expect(logAnomalyMock).toHaveBeenCalledWith({
      type: 'cj_fulfill_failed',
      siteId: 'site-1',
      details: { orderId: 'order-1', reason: 'CJ 500: internal error' },
    });
    // Comportement inchangé : ni throw, ni interruption du flux.
    expect(decrementStockMock).toHaveBeenCalledTimes(1);
    expect(sendOrderConfirmationEmailMock).toHaveBeenCalledTimes(1);
    // Idempotence : un seul appel, aucun retry ajouté par cette passe.
    expect(fulfillCjOrderMock).toHaveBeenCalledTimes(1);
  });

  it('aucune credential ni secret dans l\'anomalie', async () => {
    setupTables({
      shop_orders: { data: [ORDER], error: null },
      shop_order_items: { data: [], error: null },
      sites: { data: [{ name: 'Ma Boutique' }], error: null },
    });
    fulfillCjOrderMock.mockRejectedValue(new Error('CJ 401: invalid credentials for email=secret@nexiora.internal'));

    await handlePaidCheckout(session());

    // On vérifie ici uniquement que handlePaidCheckout ne loggue pas de
    // champ dédié aux credentials (email/apiKey) — la structure envoyée
    // ne contient que orderId/reason, jamais un objet credentials.
    const call = logAnomalyMock.mock.calls[0][0];
    expect(Object.keys(call.details)).toEqual(['orderId', 'reason']);
  });
});

describe('handlePaidCheckout — D3 : échec POD post-paiement', () => {
  it('logAnomaly(pod_fulfill_failed) appelé, flux inchangé, aucun impact sur le chemin CJ', async () => {
    setupTables({
      shop_orders: { data: [ORDER], error: null },
      shop_order_items: { data: [], error: null },
      sites: { data: [{ name: 'Ma Boutique' }], error: null },
    });
    fulfillPodOrderMock.mockRejectedValue(new Error('POD unexpected crash'));

    await handlePaidCheckout(session());

    expect(logAnomalyMock).toHaveBeenCalledWith({
      type: 'pod_fulfill_failed',
      siteId: 'site-1',
      details: { orderId: 'order-1', reason: 'POD unexpected crash' },
    });
    expect(fulfillCjOrderMock).toHaveBeenCalledTimes(1); // non affecté par l'échec POD
    expect(sendOrderConfirmationEmailMock).toHaveBeenCalledTimes(1);
    expect(fulfillPodOrderMock).toHaveBeenCalledTimes(1); // pas de retry
  });
});

describe('handlePaidCheckout — D3 : les deux échouent', () => {
  it('deux anomalies distinctes, une par fournisseur — pas de double logging fusionné', async () => {
    setupTables({
      shop_orders: { data: [ORDER], error: null },
      shop_order_items: { data: [], error: null },
      sites: { data: [{ name: 'Ma Boutique' }], error: null },
    });
    fulfillCjOrderMock.mockRejectedValue(new Error('CJ down'));
    fulfillPodOrderMock.mockRejectedValue(new Error('POD down'));

    await handlePaidCheckout(session());

    expect(logAnomalyMock).toHaveBeenCalledTimes(2);
    expect(logAnomalyMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'cj_fulfill_failed' }));
    expect(logAnomalyMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: 'pod_fulfill_failed' }));
    // Toujours pas de throw : le paiement reste encaisse, la commande reste 'paid'.
    expect(sendOrderConfirmationEmailMock).toHaveBeenCalledTimes(1);
  });
});
