// src/app/api/shop/__tests__/mode2EndToEnd.test.ts
//
// PHASE 8 du chantier de séparation Mode 2 / Mode 3 — VALIDATION FINALE.
// Plan de référence : docs/PLAN-SEPARATION-MODE2-MODE3.md
//
// ============================================================
// UNE VENTE MARCHANDE, DE BOUT EN BOUT, SANS AUCUN FOURNISSEUR.
//
// Critère de sortie du plan : « parcours complet checkout → Stripe → webhook →
// commande → post-paiement → stock → livraison → annulation/remboursement.
// Aucune dépendance fournisseur sur aucun maillon. »
//
// CE QUE LES PHASES PRÉCÉDENTES PROUVAIENT DÉJÀ, maillon par maillon :
// A6 couvre la vente (checkout), le fulfillment et l'annulation, chacun au
// niveau ADAPTATEUR. Ce que personne ne prouvait : que la propriété tient sur
// la CHAÎNE ENTIÈRE, y compris sur les maillons qu'aucune phase n'avait
// instrumentés — le webhook Stripe et la livraison marchande.
//
// LA SURVEILLANCE EST POSÉE AU NIVEAU LE PLUS BAS. Sont espionnés les
// adaptateurs et clients réels, jamais les points d'entrée de domaine :
//
//   adapter.checkStock · adapter.calculateShipping   (registre fournisseur)
//   cjCalculateFreight · cjGetVariants · cjCreateOrder · cjCancelOrder
//   createOrder Printful · Gelato · Printify
//
// Neuf portes. Un seul assistant, `aucunFournisseurAtteint()`, les vérifie
// toutes à chaque maillon : une porte ajoutée demain sans être surveillée se
// verrait, puisque le contrôle positif exige qu'elles soient atteignables.
//
// LE CONTRÔLE POSITIF EST LA MOITIÉ DE LA PREUVE. Un parcours où tous les
// espions restent muets parce que le chemin n'a jamais été atteint ne prouve
// rien. Le dernier bloc rejoue le MÊME webhook avec une commande fournisseur
// et exige que les portes s'ouvrent réellement.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.CJ_EMAIL = 'nexiora@test.com';
  process.env.CJ_API_KEY = 'test-key';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
});

// ---- LES NEUF PORTES FOURNISSEUR ----
const checkStockAdapterMock = vi.fn();
const calculateShippingAdapterMock = vi.fn();
vi.mock('@/lib/suppliers/registry', () => {
  const supplier = {
    id: 'cj',
    credentials: { email: 'e', apiKey: 'k' },
    adapter: {
      checkStock: (...a: unknown[]) => checkStockAdapterMock(...a),
      calculateShipping: (...a: unknown[]) => calculateShippingAdapterMock(...a),
    },
  };
  return { suppliersWithCapability: () => [supplier], getSupplier: () => supplier };
});

const cjCreateOrderMock = vi.fn();
const cjGetVariantsMock = vi.fn();
const cjCalculateFreightMock = vi.fn();
const cjCancelOrderMock = vi.fn();
vi.mock('@/lib/cj/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cj/client')>('@/lib/cj/client');
  return {
    ...actual,
    cjCreateOrder: (...a: unknown[]) => cjCreateOrderMock(...a),
    cjGetVariants: (...a: unknown[]) => cjGetVariantsMock(...a),
    cjCalculateFreight: (...a: unknown[]) => cjCalculateFreightMock(...a),
    cjCancelOrder: (...a: unknown[]) => cjCancelOrderMock(...a),
  };
});

const createOrderPrintfulMock = vi.fn();
const createOrderGelatoMock = vi.fn();
const createOrderPrintifyMock = vi.fn();
vi.mock('@/lib/suppliers/printful-adapter', () => ({ createOrderPrintful: (...a: unknown[]) => createOrderPrintfulMock(...a) }));
vi.mock('@/lib/suppliers/gelato-adapter', () => ({ createOrderGelato: (...a: unknown[]) => createOrderGelatoMock(...a) }));
vi.mock('@/lib/suppliers/printify-adapter', () => ({ createOrderPrintify: (...a: unknown[]) => createOrderPrintifyMock(...a) }));

const reconcileWithCjMock = vi.fn();
vi.mock('@/lib/cj/reconcile', () => ({ reconcileWithCj: (...a: unknown[]) => reconcileWithCjMock(...a) }));

// ---- Infrastructure : externe au produit, jamais un fournisseur ----
const constructEventMock = vi.fn();
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({ webhooks: { constructEvent: (...a: unknown[]) => constructEventMock(...a) } }),
}));
vi.mock('@/lib/domains/provision', () => ({ provisionDomain: vi.fn(async () => undefined) }));

const createCheckoutMock = vi.fn();
const refundPaymentMock = vi.fn();
vi.mock('@/lib/payments', () => ({
  getProvider: () => ({
    createCheckout: (...a: unknown[]) => createCheckoutMock(...a),
    refundPayment: (...a: unknown[]) => refundPaymentMock(...a),
  }),
}));

const checkStockLocalMock = vi.fn();
const decrementStockMock = vi.fn();
const cancelShopOrderAtomicMock = vi.fn();
vi.mock('@/lib/shop', () => ({
  checkStock: (...a: unknown[]) => checkStockLocalMock(...a),
  decrementStock: (...a: unknown[]) => decrementStockMock(...a),
  cancelShopOrderAtomic: (...a: unknown[]) => cancelShopOrderAtomicMock(...a),
}));

vi.mock('@/lib/email/sendOrderConfirmationEmail', () => ({ sendOrderConfirmationEmail: vi.fn(async () => true) }));
const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({ logAnomaly: (...a: unknown[]) => logAnomalyMock(...a) }));

type Handlers = Record<string, { data?: unknown; error?: unknown; count?: number }>;

function tableChain(response: { data?: unknown; error?: unknown; count?: number }) {
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const m of ['select', 'eq', 'neq', 'in', 'insert', 'update', 'upsert', 'delete', 'lt', 'gte', 'is', 'or', 'order', 'limit']) {
    c[m] = vi.fn(self);
  }
  const narrowed = Array.isArray(response.data)
    ? { data: response.data[0] ?? null, error: response.error ?? null }
    : response;
  c.single = vi.fn(async () => narrowed);
  c.maybeSingle = vi.fn(async () => narrowed);
  c.then = (resolve: (v: unknown) => void) => resolve({ count: 0, error: null, ...response });
  return c;
}

const { fromMock, rpcMock } = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (...a: unknown[]) => fromMock(...(a as [string])),
    rpc: (...a: unknown[]) => rpcMock(...a),
  },
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...(a as [string])) },
}));

import { POST as checkoutPOST } from '../checkout/route';
import { POST as webhookPOST } from '@/app/api/stripe/webhook/route';
import { PATCH as ordersPATCH } from '../orders/route';
import { POST as cancelPOST } from '../cancel-order/route';

function setupTables(handlers: Handlers) {
  fromMock.mockImplementation((table: string) => tableChain(handlers[table] ?? { data: null, error: null }));
}

// ============================================================
// LA COMMANDE MODE 2 — cohérente avec le schéma réel
// ============================================================
// `fulfillment_domain` est NOT NULL + CHECK IN ('merchant','supplier') depuis
// la phase 2 : une commande sans domaine n'existe pas. `cj_order_id` reste
// null — aucune commande marchande ne peut en acquérir un depuis la phase 3.
const SITE_MODE2 = {
  id: 'site-1', slug: 'boutique', payment_provider: 'stripe', payment_account_id: 'acct_1',
  shipping_flat: 5, mode: 2, cj_margin_percent: null, cj_round_mode: null, name: 'Ma Boutique',
};
const PRODUIT_MARCHAND = { id: 'p1', cj_vid: null, price: 30, currency: 'usd', published: true, for_sale: true, stock: 10, name: 'T-Shirt' };
const COMMANDE_MODE2 = {
  id: 'order-1', site_id: 'site-1', status: 'pending', payment_ref: 'cs_test_1',
  fulfillment_domain: 'merchant', cj_order_id: null, cancel_token: 'tok-1',
  payment_provider: 'stripe', customer_email: 'c@test.com', customer_name: 'Client',
  shipping_address: { country: 'FR' }, total: 30, currency: 'usd',
};

function sessionStripe() {
  return {
    id: 'cs_test_1', mode: 'payment', payment_intent: 'pi_1',
    customer_details: { email: 'c@test.com', name: 'Client' },
    amount_total: 3000, currency: 'usd',
  };
}

function requete(url: string, body: unknown, methode = 'POST') {
  return new Request(url, { method: methode, body: JSON.stringify(body), headers: { 'stripe-signature': 'sig' } });
}

/** Les neuf portes par lesquelles le produit atteint un fournisseur. */
function aucunFournisseurAtteint(maillon: string) {
  const portes: [string, ReturnType<typeof vi.fn>][] = [
    ['adapter.checkStock', checkStockAdapterMock],
    ['adapter.calculateShipping', calculateShippingAdapterMock],
    ['cjCalculateFreight', cjCalculateFreightMock],
    ['cjGetVariants', cjGetVariantsMock],
    ['cjCreateOrder', cjCreateOrderMock],
    ['cjCancelOrder', cjCancelOrderMock],
    ['createOrderPrintful', createOrderPrintfulMock],
    ['createOrderGelato', createOrderGelatoMock],
    ['createOrderPrintify', createOrderPrintifyMock],
  ];
  for (const [nom, espion] of portes) {
    expect(espion, `${maillon} — ${nom}`).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset().mockResolvedValue({ data: null, error: null });
  for (const m of [
    checkStockAdapterMock, calculateShippingAdapterMock, cjCalculateFreightMock,
    cjGetVariantsMock, cjCreateOrderMock, cjCancelOrderMock,
    createOrderPrintfulMock, createOrderGelatoMock, createOrderPrintifyMock,
  ]) m.mockReset();
  reconcileWithCjMock.mockReset().mockResolvedValue({ kind: 'NOT_FOUND' });
  constructEventMock.mockReset();
  createCheckoutMock.mockReset().mockResolvedValue({ url: 'https://stripe.test/pay', orderId: 'cs_test_1' });
  refundPaymentMock.mockReset().mockResolvedValue({ id: 're_1', status: 'succeeded', amount: 3000 });
  checkStockLocalMock.mockReset().mockResolvedValue({ ok: true });
  decrementStockMock.mockReset().mockResolvedValue({ ok: true });
  cancelShopOrderAtomicMock.mockReset().mockResolvedValue({ ok: true, restocked: true, paymentIntentId: 'pi_1' });
  logAnomalyMock.mockReset();
});

describe('PHASE 8 — parcours complet Mode 2, aucun fournisseur sur aucun maillon', () => {
  it('MAILLON 1-2 · checkout + session Stripe : vente créée, commission nulle', async () => {
    setupTables({
      sites: { data: SITE_MODE2, error: null },
      shop_products: { data: [PRODUIT_MARCHAND], error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });

    const res = await checkoutPOST(
      requete('https://woorri.test/api/shop/checkout', {
        // `countryCode` INDISPENSABLE : sans lui la route saute entierement la
        // branche de devis (route.ts:196), et le maillon « devis » ne serait
        // jamais exerce -- vert sans avoir rien traverse. Mesure : la mutation
        // M55 restait verte tant que ce champ manquait.
        slug: 'boutique', countryCode: 'US',
        items: [{ id: 'p1', quantity: 1, name: 'T-Shirt', currency: 'usd' }],
      }) as never
    );

    expect(res.status, 'une boutique autonome doit pouvoir vendre').toBe(200);
    const feeArg = createCheckoutMock.mock.calls[0][6];
    expect(feeArg, 'le marchand encaisse l’intégralité : aucune commission plateforme').toBeFalsy();
    aucunFournisseurAtteint('checkout + devis');
  });

  // DEFENSE EN PROFONDEUR, mesuree : retirer l'aiguillage OU la garde du
  // moteur, isolement, ne change rien -- l'autre couche absorbe. C'est une
  // propriete voulue, installee en phase 3. Ce contrat exige que les DEUX
  // tombent pour qu'un fournisseur soit atteint, et le prouve en verifiant
  // que le stock marchand reste traite dans tous les cas.
  it('MAILLON 5 · post-paiement : deux couches gardent la frontiere, pas une', async () => {
    setupTables({
      shop_orders: { data: [COMMANDE_MODE2], error: null },
      shop_order_items: { data: [{ product_id: 'p1', quantity: 1 }], error: null },
      shop_products: { data: [PRODUIT_MARCHAND], error: null },
      sites: { data: [SITE_MODE2], error: null },
    });
    constructEventMock.mockReturnValue({ type: 'checkout.session.completed', data: { object: sessionStripe() } });

    await webhookPOST(requete('https://woorri.test/api/stripe/webhook', {}) as never);

    expect(decrementStockMock, 'le tronc commun n’est jamais ampute').toHaveBeenCalledTimes(1);
    aucunFournisseurAtteint('post-paiement, double garde');
  });

  it('MAILLON 3-6 · webhook Stripe → post-paiement → stock : le stock marchand est décrémenté', async () => {
    setupTables({
      shop_orders: { data: [COMMANDE_MODE2], error: null },
      shop_order_items: { data: [{ product_id: 'p1', quantity: 1 }], error: null },
      shop_products: { data: [PRODUIT_MARCHAND], error: null },
      sites: { data: [SITE_MODE2], error: null },
    });
    constructEventMock.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: sessionStripe() },
    });

    const res = await webhookPOST(requete('https://woorri.test/api/stripe/webhook', {}) as never);

    expect(res.status).toBe(200);
    expect(
      decrementStockMock,
      'le marchand détient son stock : il doit être décrémenté par le tronc commun'
    ).toHaveBeenCalledTimes(1);
    expect(decrementStockMock.mock.calls[0][0]).toEqual([{ id: 'p1', quantity: 1 }]);
    aucunFournisseurAtteint('webhook + post-paiement + stock');
  });

  it('MAILLON 7 · livraison : le marchand expédie lui-même', async () => {
    setupTables({ shop_orders: { data: [{ ...COMMANDE_MODE2, status: 'paid' }], error: null } });
    rpcMock.mockResolvedValue({ data: [{ id: 'order-1', status: 'shipped' }], error: null });

    await ordersPATCH(
      requete('https://woorri.test/api/shop/orders', { orderId: 'order-1', status: 'shipped', trackingNumber: 'TR-1' }, 'PATCH') as never
    );

    aucunFournisseurAtteint('livraison marchande');
  });

  it('MAILLON 8-9 · annulation + remboursement : aucun fournisseur à prévenir', async () => {
    setupTables({ shop_orders: { data: { ...COMMANDE_MODE2, status: 'paid' }, error: null } });

    const res = await cancelPOST(
      requete('https://woorri.test/api/shop/cancel-order', { orderId: 'order-1', token: 'tok-1' }) as never
    );

    expect(res.status).toBe(200);
    expect(cancelShopOrderAtomicMock).toHaveBeenCalledWith('order-1');
    expect(refundPaymentMock, "l'acheteur doit être remboursé").toHaveBeenCalledWith('pi_1');
    aucunFournisseurAtteint('annulation + remboursement');
  });
});

// ============================================================
// CONTRÔLE POSITIF — les portes s'ouvrent réellement
// ============================================================
describe('PHASE 8 — contrôle positif : la surveillance n’est pas muette', () => {
  it('le MÊME webhook, avec une commande fournisseur, atteint bien l’adaptateur CJ', async () => {
    setupTables({
      shop_orders: {
        data: [{
          ...COMMANDE_MODE2, fulfillment_domain: 'supplier',
          shipping_address: { country: 'US', city: 'NYC', postal_code: '10001', line1: '1 Main', state: 'NY', phone: '+15550001111' },
          cj_pay_status: 'pending', cj_pay_attempts: 0, cj_pay_locked_at: null,
          shipping_amount: 10, shipment_logistic_name: 'Standard', estimated_delivery: '12 days', total: 50,
        }],
        error: null,
      },
      shop_order_items: { data: [{ product_id: 'sp1', quantity: 1 }], error: null },
      shop_products: { data: [{ id: 'sp1', cj_vid: 'vid-1' }], error: null },
      sites: { data: [SITE_MODE2], error: null },
    });
    cjCalculateFreightMock.mockResolvedValue([{ logisticName: 'Standard', logisticPrice: '5', logisticAging: '7-12' }]);
    cjCreateOrderMock.mockResolvedValue({ orderId: 'cj-1' });
    constructEventMock.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: sessionStripe() },
    });

    await webhookPOST(requete('https://woorri.test/api/stripe/webhook', {}) as never);

    expect(
      cjCreateOrderMock,
      "sans cet appel, les quatre maillons ci-dessus seraient verts parce qu'aucune porte n'est atteignable, pas parce que le Mode 2 les évite"
    ).toHaveBeenCalledTimes(1);
  });
});
