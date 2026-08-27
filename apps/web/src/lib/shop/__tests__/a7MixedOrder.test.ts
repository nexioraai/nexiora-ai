// src/lib/shop/__tests__/a7MixedOrder.test.ts
//
// PHASE 6 du chantier de séparation Mode 2 / Mode 3 — contrat A7, cas 5.
// Plan de référence : docs/PLAN-SEPARATION-MODE2-MODE3.md
//
// ============================================================
// COMMANDE MIXTE — LA CONJONCTION, DANS UN SEUL SCÉNARIO.
//
// §10 du plan, cas 5 : « seule la ligne mappée part chez CJ, stock marchand
// décrémenté ». Cette propriété était couverte en DEUX MOITIÉS, dans deux
// suites qui ne se rencontrent jamais :
//
//   · `cj/__tests__/fulfill.test.ts` prouve que seule la ligne portant un
//     `cj_vid` est soumise au fournisseur — et son commentaire AFFIRME que
//     « les lignes marchandes restent décrémentées en stock par l'aiguillage »
//     sans jamais l'asserter ;
//   · `shop/__tests__/handlePaidCheckout.test.ts` observe bien
//     `decrementStock`, mais mocke `@/lib/cj/fulfill` — la sélection des
//     lignes CJ n'y est donc jamais exécutée, et aucune de ses fixtures n'est
//     mixte (toutes portent `cj_vid: null`).
//
// CE QUE LA DISJONCTION LAISSE PASSER. Les deux modules calculent le MÊME
// ensemble — « les lignes portant un cj_vid » — mais chacun de son côté :
// l'aiguillage pour les EXCLURE du stock, le moteur pour les ENVOYER au
// fournisseur. Rien ne garantit qu'ils s'accordent. S'ils divergeaient, une
// ligne pourrait être exclue du stock sans jamais partir chez le fournisseur
// (payée, jamais honorée, stock jamais décrémenté), ou l'inverse (traitée
// deux fois). Aucune des deux suites ne verrait cette divergence.
//
// D'OÙ CE FICHIER : il exécute le VRAI `fulfillCjOrder` sous le VRAI
// aiguillage, sur une seule commande mixte, et observe dans la même exécution
// ce qui part chez le fournisseur ET ce qui est décrémenté.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Le moteur CJ refuse tout traitement sans identifiants plateforme. Meme
// amorcage que cj/__tests__/fulfill.test.ts -- ce n'est pas une hypothese de
// test, c'est la configuration que le moteur exige pour s'executer du tout.
// HISSE : `fulfill.ts` lit ces variables au niveau MODULE (l. 19-20), donc
// avant tout `beforeEach`. Meme mecanisme que cj/__tests__/fulfill.test.ts.
vi.hoisted(() => {
  process.env.CJ_EMAIL = 'nexiora@test.com';
  process.env.CJ_API_KEY = 'test-key';
});

// ---- Frontière fournisseur : mockée au niveau du CLIENT, pas du moteur ----
const cjCreateOrderMock = vi.fn();
const cjGetVariantsMock = vi.fn();
const cjCalculateFreightMock = vi.fn();
vi.mock('@/lib/cj/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cj/client')>('@/lib/cj/client');
  return {
    ...actual,
    cjCreateOrder: (...a: unknown[]) => cjCreateOrderMock(...a),
    cjGetVariants: (...a: unknown[]) => cjGetVariantsMock(...a),
    cjCalculateFreight: (...a: unknown[]) => cjCalculateFreightMock(...a),
  };
});

const reconcileWithCjMock = vi.fn();
vi.mock('@/lib/cj/reconcile', () => ({ reconcileWithCj: (...a: unknown[]) => reconcileWithCjMock(...a) }));

const fulfillPodOrderMock = vi.fn();
vi.mock('@/lib/suppliers/pod-fulfill', () => ({ fulfillPodOrder: (...a: unknown[]) => fulfillPodOrderMock(...a) }));

// ---- Stock marchand : la seconde moitié de la conjonction ----
const decrementStockMock = vi.fn();
vi.mock('@/lib/shop', () => ({ decrementStock: (...a: unknown[]) => decrementStockMock(...a) }));

const sendOrderConfirmationEmailMock = vi.fn();
vi.mock('@/lib/email/sendOrderConfirmationEmail', () => ({
  sendOrderConfirmationEmail: (...a: unknown[]) => sendOrderConfirmationEmailMock(...a),
}));

const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({ logAnomaly: (...a: unknown[]) => logAnomalyMock(...a) }));

const refundPaymentMock = vi.fn();
vi.mock('@/lib/payments', () => ({
  getProvider: vi.fn(() => ({ refundPayment: (...a: unknown[]) => refundPaymentMock(...a) })),
}));

type Handlers = Record<string, { data: unknown; error?: unknown }>;

function tableChain(response: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'in', 'insert', 'update', 'upsert', 'delete', 'lt', 'gte', 'is', 'order', 'limit', 'not']) {
    chain[m] = vi.fn(self);
  }
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

function setupTables(handlers: Handlers) {
  fromMock.mockImplementation((table: string) => tableChain(handlers[table] ?? { data: null, error: null }));
}

const ORDER = {
  id: 'order-1',
  site_id: 'site-1',
  status: 'pending',
  payment_ref: 'cs_test_1',
  fulfillment_domain: 'supplier',
  shipping_address: { country: 'US', city: 'NYC', postal_code: '10001', line1: '123 Main St', state: 'NY', phone: '+15550001111' },
  customer_name: 'Client',
  customer_email: 'c@test.com',
  cj_pay_status: 'pending',
  cj_pay_attempts: 0,
  cj_pay_locked_at: null,
  shipping_amount: 10,
  shipment_logistic_name: 'Standard',
  estimated_delivery: '12 days',
  total: 50,
};

/** LA commande mixte : `sp1` est mappée chez le fournisseur, `sp2` non. */
const ITEMS_MIXTES = [
  { product_id: 'sp1', quantity: 1 },
  { product_id: 'sp2', quantity: 2 },
];
const PRODUITS_MIXTES = [
  { id: 'sp1', cj_vid: 'vid-1' },
  { id: 'sp2', cj_vid: null },
];

function session() {
  return {
    id: 'cs_test_1',
    payment_intent: 'pi_1',
    customer_details: { email: 'client@test.com', name: 'Client Test' },
    amount_total: 5000,
    currency: 'usd',
  };
}

function setupCommande(produits: unknown) {
  setupTables({
    shop_orders: { data: [ORDER], error: null },
    shop_order_items: { data: ITEMS_MIXTES, error: null },
    shop_products: { data: produits, error: null },
    sites: { data: [{ name: 'Ma Boutique' }], error: null },
  });
}

beforeEach(() => {
  fromMock.mockReset();
  cjCreateOrderMock.mockReset().mockResolvedValue({ orderId: 'cj-1' });
  cjGetVariantsMock.mockReset();
  // Devis exploitable : sans lui, le moteur refuse toute creation (garde
  // `cj_freight_unavailable`). Meme forme que les cas nominaux de
  // cj/__tests__/fulfill.test.ts -- le devis n'est pas l'objet de ce contrat,
  // il est la condition pour l'atteindre.
  cjCalculateFreightMock.mockReset().mockResolvedValue([
    { logisticName: 'Standard', logisticPrice: '5', logisticAging: '7-12' },
  ]);
  reconcileWithCjMock.mockReset().mockResolvedValue({ kind: 'NOT_FOUND' });
  fulfillPodOrderMock.mockReset().mockResolvedValue([]);
  decrementStockMock.mockReset().mockResolvedValue({ ok: true });
  sendOrderConfirmationEmailMock.mockReset().mockResolvedValue(true);
  logAnomalyMock.mockReset();
  refundPaymentMock.mockReset();
});

describe('A7 cas 5 — commande mixte : la conjonction, dans une seule exécution', () => {
  it('la ligne mappée part chez le fournisseur ET seule la ligne marchande est décrémentée', async () => {
    setupCommande(PRODUITS_MIXTES);

    await handlePaidCheckout(session());

    // --- A. LA LIGNE FOURNISSEUR ---
    expect(
      cjCreateOrderMock,
      'la ligne mappée doit réellement être soumise au fournisseur'
    ).toHaveBeenCalledTimes(1);
    expect(
      cjCreateOrderMock.mock.calls[0][2].products,
      "seule la ligne mappée part, avec SON identifiant fournisseur et SA quantité -- jamais celle de l'autre ligne"
    ).toEqual([{ vid: 'vid-1', quantity: 1 }]);

    // --- B. LA LIGNE MARCHANDE ---
    expect(
      decrementStockMock,
      'le stock marchand doit être décrémenté : cette ligne, le marchand la détient et l’expédie'
    ).toHaveBeenCalledTimes(1);
    expect(
      decrementStockMock.mock.calls[0][0],
      "la ligne mappée n'a pas de stock local : la décrémenter serait décompter un stock que le marchand ne détient pas"
    ).toEqual([{ id: 'sp2', quantity: 2 }]);

    // --- C. LES DEUX ENSEMBLES SONT COMPLÉMENTAIRES ---
    const envoyeesAuFournisseur = cjCreateOrderMock.mock.calls[0][2].products.length;
    const decrementees = (decrementStockMock.mock.calls[0][0] as unknown[]).length;
    expect(
      envoyeesAuFournisseur + decrementees,
      'toute ligne de la commande est traitée par exactement un des deux chemins -- ni oubliée, ni traitée deux fois'
    ).toBe(ITEMS_MIXTES.length);
  });

  it('CONTRÔLE — commande entièrement fournisseur : les deux lignes partent, aucun stock décrémenté', async () => {
    setupCommande([
      { id: 'sp1', cj_vid: 'vid-1' },
      { id: 'sp2', cj_vid: 'vid-2' },
    ]);

    await handlePaidCheckout(session());

    expect(
      cjCreateOrderMock.mock.calls[0][2].products,
      'sans ce cas, les assertions ci-dessus pourraient être vertes avec un harnais inerte'
    ).toEqual([
      { vid: 'vid-1', quantity: 1 },
      { vid: 'vid-2', quantity: 2 },
    ]);
    expect(
      decrementStockMock,
      "aucune ligne n'est détenue par le marchand : il n'y a aucun stock local à décrémenter"
    ).not.toHaveBeenCalled();
  });

  it('CONTRÔLE — commande entièrement marchande : rien ne part, tout est décrémenté', async () => {
    setupCommande([
      { id: 'sp1', cj_vid: null },
      { id: 'sp2', cj_vid: null },
    ]);

    await handlePaidCheckout(session());

    expect(cjCreateOrderMock).not.toHaveBeenCalled();
    expect(decrementStockMock.mock.calls[0][0]).toEqual([
      { id: 'sp1', quantity: 1 },
      { id: 'sp2', quantity: 2 },
    ]);
  });
});
