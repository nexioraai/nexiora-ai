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
//
// F7 (audit stock Mode 2) — étendu pour prouver : la garde d'idempotence
// webhook (.eq('status','pending')) bloque bien tout traitement en double ;
// un échec de decrementStock() déclenche un remboursement automatique,
// jamais l'email "commande confirmée" ; un remboursement qui échoue est
// journalisé plutôt que de laisser une commande payée mais infulfillable
// silencieusement.
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

const refundPaymentMock = vi.fn();
vi.mock('@/lib/payments', () => ({
  getProvider: vi.fn(() => ({ refundPayment: (...a: unknown[]) => refundPaymentMock(...a) })),
}));

const { updateCalls } = vi.hoisted(() => ({
  updateCalls: [] as { table: string; payload: Record<string, unknown>; eqCalls: [string, unknown][] }[],
}));

function tableChain(table: string, response: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const eqCalls: [string, unknown][] = [];
  const self = () => chain;
  // Trace chaque .update() (table + payload + filtres .eq() appliqués
  // ensuite) pour pouvoir vérifier précisément QUEL update a été demandé --
  // notamment le passage à status:'refunded' (F7), sans dépendre de l'ordre
  // d'appel ni d'un chaînage fragile.
  chain.update = vi.fn((payload: Record<string, unknown>) => {
    updateCalls.push({ table, payload, eqCalls });
    return chain;
  });
  chain.select = vi.fn(self);
  chain.eq = vi.fn((col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return chain;
  });
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

// PHASE 3 : l'aiguillage ne descend dans les moteurs fournisseur que pour
// un domaine 'supplier'. Cette fixture modelise une commande Mode 3.
const ORDER = { id: 'order-1', fulfillment_domain: 'supplier' as const, estimated_delivery: null, site_id: 'site-1', cancel_token: 'tok', payment_provider: 'stripe' };

type Handlers = Record<string, { data: unknown; error?: unknown }>;
function setupTables(handlers: Handlers, fallback: { data: unknown; error?: unknown } = { data: [], error: null }) {
  fromMock.mockImplementation((table: string) => tableChain(table, handlers[table] ?? fallback));
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
  updateCalls.length = 0;
  fulfillCjOrderMock.mockReset();
  fulfillPodOrderMock.mockReset();
  decrementStockMock.mockReset();
  sendOrderConfirmationEmailMock.mockReset();
  logAnomalyMock.mockReset();
  refundPaymentMock.mockReset();
  fulfillCjOrderMock.mockResolvedValue([]);
  fulfillPodOrderMock.mockResolvedValue([]);
  sendOrderConfirmationEmailMock.mockResolvedValue(true);
  // F7 : chemin nominal par défaut -- décrémentation réussie. Les tests de
  // la section "stock insuffisant" ci-dessous le redéfinissent explicitement.
  decrementStockMock.mockResolvedValue({ ok: true });
  refundPaymentMock.mockResolvedValue({ id: 're_1', status: 'succeeded', amount: 3000 });
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

describe('handlePaidCheckout — F4/F7 : garde d\'idempotence webhook (.eq(status, pending))', () => {
  it('commande déjà traitée (statut non "pending" au moment du webhook) -> comportement identique à "introuvable", aucun traitement en double', async () => {
    // La garde .eq('status','pending') fait que .maybeSingle() ne retrouve
    // aucune ligne pour un second appel sur une commande déjà passée à
    // 'paid' -- simulé ici exactement comme le cas "introuvable" : c'est
    // la MÊME conséquence observable côté appelant (order === null).
    setupTables({ shop_orders: { data: null, error: null } });
    await handlePaidCheckout(session());
    expect(fulfillCjOrderMock).not.toHaveBeenCalled();
    expect(decrementStockMock).not.toHaveBeenCalled();
    expect(sendOrderConfirmationEmailMock).not.toHaveBeenCalled();
    expect(refundPaymentMock).not.toHaveBeenCalled();
  });
});

describe('handlePaidCheckout — chemin nominal (aucun échec)', () => {
  it('aucune anomalie loggée quand CJ et POD réussissent tous les deux, email envoyé', async () => {
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
    expect(refundPaymentMock).not.toHaveBeenCalled();
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

describe('handlePaidCheckout — F7 : stock insuffisant après paiement confirmé', () => {
  function setupStockShortfall() {
    setupTables({
      shop_orders: { data: [ORDER], error: null },
      shop_order_items: { data: [{ product_id: 'sp1', quantity: 5 }], error: null },
      shop_products: { data: [{ id: 'sp1', cj_vid: null }], error: null },
      sites: { data: [{ name: 'Ma Boutique' }], error: null },
    });
    decrementStockMock.mockResolvedValue({ ok: false, reason: 'INSUFFICIENT_STOCK', productId: 'sp1' });
  }

  it('déclenche logAnomaly(stock_insufficient_after_payment) avec le détail exact', async () => {
    setupStockShortfall();
    await handlePaidCheckout(session());
    expect(logAnomalyMock).toHaveBeenCalledWith({
      type: 'stock_insufficient_after_payment',
      severity: 'blocked',
      siteId: 'site-1',
      details: { orderId: 'order-1', reason: 'INSUFFICIENT_STOCK', productId: 'sp1' },
    });
  });

  it('rembourse automatiquement via le payment_intent de la session', async () => {
    setupStockShortfall();
    await handlePaidCheckout(session({ payment_intent: 'pi_specifique' }));
    expect(refundPaymentMock).toHaveBeenCalledWith('pi_specifique');
  });

  it('email "commande confirmée" JAMAIS envoyé quand le stock manque', async () => {
    setupStockShortfall();
    await handlePaidCheckout(session());
    expect(sendOrderConfirmationEmailMock).not.toHaveBeenCalled();
  });

  it('remboursement réussi -> statut de la commande passe à "refunded", gardé par .eq("status","paid")', async () => {
    setupStockShortfall();
    await handlePaidCheckout(session());
    const refundedUpdate = updateCalls.find(
      (u) => u.table === 'shop_orders' && (u.payload as Record<string, unknown>)?.status === 'refunded'
    );
    expect(refundedUpdate).toBeDefined();
    expect(refundedUpdate!.eqCalls).toContainEqual(['id', 'order-1']);
    expect(refundedUpdate!.eqCalls).toContainEqual(['status', 'paid']);
  });

  it('échec du remboursement lui-même -> logAnomaly(refund_failed), pas de throw, pas d\'email', async () => {
    setupStockShortfall();
    refundPaymentMock.mockRejectedValue(new Error('Stripe API down'));
    await handlePaidCheckout(session());
    expect(logAnomalyMock).toHaveBeenCalledWith({
      type: 'refund_failed',
      severity: 'blocked',
      siteId: 'site-1',
      details: { orderId: 'order-1', reason: 'Stripe API down' },
    });
    expect(sendOrderConfirmationEmailMock).not.toHaveBeenCalled();
  });

  it('CJ/POD ne sont pas affectés par un échec de stock (chemins indépendants)', async () => {
    setupStockShortfall();
    await handlePaidCheckout(session());
    expect(fulfillCjOrderMock).toHaveBeenCalledTimes(1);
    expect(fulfillPodOrderMock).toHaveBeenCalledTimes(1);
  });
});

describe('handlePaidCheckout — audit adresse Reseller/CJ, partie 7 : fusion du téléphone', () => {
  it('customer_details.phone présent -> fusionné dans shipping_address (jamais une colonne séparée)', async () => {
    setupTables({
      shop_orders: { data: [ORDER], error: null },
      shop_order_items: { data: [], error: null },
      sites: { data: [{ name: 'Ma Boutique' }], error: null },
    });
    await handlePaidCheckout(session({
      shipping_details: { address: { line1: '1 rue Test', city: 'Montreal', country: 'CA', postal_code: 'H1A1A1', state: 'QC' } },
      customer_details: { email: 'client@test.com', name: 'Client Test', phone: '+15145551234' },
    }));
    const write = updateCalls.find((u) => u.table === 'shop_orders' && (u.payload as any).status === 'paid');
    expect((write!.payload as any).shipping_address).toMatchObject({
      line1: '1 rue Test', city: 'Montreal', country: 'CA', phone: '+15145551234',
    });
  });

  it('customer_details.phone absent -> shipping_address.phone undefined, pas de valeur fabriquée ici', async () => {
    setupTables({
      shop_orders: { data: [ORDER], error: null },
      shop_order_items: { data: [], error: null },
      sites: { data: [{ name: 'Ma Boutique' }], error: null },
    });
    await handlePaidCheckout(session({
      shipping_details: { address: { line1: '1 rue Test', city: 'Montreal', country: 'CA', postal_code: 'H1A1A1' } },
    }));
    const write = updateCalls.find((u) => u.table === 'shop_orders' && (u.payload as any).status === 'paid');
    expect((write!.payload as any).shipping_address.phone).toBeUndefined();
  });

  it('pas d\'adresse de livraison du tout -> shipping_address reste null, jamais un objet {phone} orphelin', async () => {
    setupTables({
      shop_orders: { data: [ORDER], error: null },
      shop_order_items: { data: [], error: null },
      sites: { data: [{ name: 'Ma Boutique' }], error: null },
    });
    await handlePaidCheckout(session({ customer_details: { email: 'c@test.com', phone: '+15145551234' } }));
    const write = updateCalls.find((u) => u.table === 'shop_orders' && (u.payload as any).status === 'paid');
    expect((write!.payload as any).shipping_address).toBeNull();
  });
});

// ============================================================
// PHASE 3 — L'AIGUILLAGE AIGUILLE.
// Plan de reference : docs/PLAN-SEPARATION-MODE2-MODE3.md
//
// Ces tests existent parce qu'un controle de mutation a montre que rendre
// l'aiguillage inconditionnel (`if (true)`) ne faisait echouer AUCUN test.
// C'etait pourtant EXACTEMENT le defaut d'origine : les deux moteurs
// fournisseur appeles sans aucune condition, et une commande Mode 2
// atteignant reellement CJ et Printful sur le code deploye.
//
// Ils verrouillent aussi la separation entre ce qui est propre au domaine
// fournisseur (les deux moteurs) et ce qui appartient au tronc commun (le
// decrement de stock, l'e-mail acheteur) : une commande marchande doit etre
// privee des premiers, jamais des seconds.
// ============================================================
describe('PHASE 3 — aiguillage par domaine', () => {
  it.each([
    ['merchant', 'merchant'],
    ['absent (commande anterieure a la migration)', null],
    ['valeur inattendue', 'autre'],
  ])('domaine %s -> AUCUN moteur fournisseur appele', async (_l, domaine) => {
    setupTables({
      shop_orders: { data: [{ ...ORDER, fulfillment_domain: domaine }], error: null },
      shop_order_items: { data: [{ product_id: 'p1', quantity: 1 }], error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: null }], error: null },
      sites: { data: { name: 'S', slug: 'b' }, error: null },
    });
    decrementStockMock.mockResolvedValue({ success: true });
    await handlePaidCheckout(session());
    expect(fulfillCjOrderMock).not.toHaveBeenCalled();
    expect(fulfillPodOrderMock).not.toHaveBeenCalled();
  });

  it('domaine merchant -> le stock marchand reste decremente (responsabilite COMMUNE)', async () => {
    setupTables({
      shop_orders: { data: [{ ...ORDER, fulfillment_domain: 'merchant' }], error: null },
      shop_order_items: { data: [{ product_id: 'p1', quantity: 1 }], error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: null }], error: null },
      sites: { data: { name: 'S', slug: 'b' }, error: null },
    });
    decrementStockMock.mockResolvedValue({ success: true });
    await handlePaidCheckout(session());
    expect(fulfillCjOrderMock).not.toHaveBeenCalled();
    expect(decrementStockMock).toHaveBeenCalled();   // le tronc commun n'est pas ampute
  });

  it('domaine supplier -> les deux moteurs sont appeles, comme avant', async () => {
    setupTables({
      shop_orders: { data: [ORDER], error: null },
      shop_order_items: { data: [{ product_id: 'p1', quantity: 1 }], error: null },
      shop_products: { data: [{ id: 'p1', cj_vid: 'vid-1' }], error: null },
      sites: { data: { name: 'S', slug: 'b' }, error: null },
    });
    decrementStockMock.mockResolvedValue({ success: true });
    await handlePaidCheckout(session());
    expect(fulfillCjOrderMock).toHaveBeenCalledWith('order-1');
    expect(fulfillPodOrderMock).toHaveBeenCalledWith('order-1');
  });
});
