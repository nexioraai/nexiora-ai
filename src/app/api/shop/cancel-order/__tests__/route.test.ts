import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================
// F9/F10 (audit annulation Mode 2) — couverture de
// /api/shop/cancel-order, jusqu'ici sans aucun test. Teste
// l'ORCHESTRATION de la route : gardes d'idempotence, décision CJ
// (Mode 3, inchangée), et surtout le nouveau contrat avec
// cancelShopOrderAtomic() (restock atomique + garde de statut, RPC
// cancel_shop_order testée séparément en conditions réelles Supabase).
// getProvider/refundPayment et cjCancelOrder sont mockés — leur propre
// couverture existe déjà (stripeRefundIdempotency.test.ts, cj tests).
// ============================================================

const cancelShopOrderAtomicMock = vi.fn();
vi.mock('@/lib/shop', () => ({
  cancelShopOrderAtomic: (...a: unknown[]) => cancelShopOrderAtomicMock(...a),
}));

const cjCancelOrderMock = vi.fn();
vi.mock('@/lib/cj/client', () => ({
  cjCancelOrder: (...a: unknown[]) => cjCancelOrderMock(...a),
}));

const refundPaymentMock = vi.fn();
vi.mock('@/lib/payments', () => ({
  getProvider: vi.fn(() => ({ refundPayment: (...a: unknown[]) => refundPaymentMock(...a) })),
}));

const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({
  logAnomaly: (...a: unknown[]) => logAnomalyMock(...a),
}));

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { POST } from '../route';

function tableChain(response: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.update = vi.fn(self);
  chain.maybeSingle = vi.fn(async () => response);
  return chain;
}

// La route lit shop_orders DEUX fois dans le chemin "conflit" (lecture
// initiale, puis relecture après un cancelShopOrderAtomic non-ok) : une
// file de réponses successives reproduit ça sans complexifier le mock au
// prix d'un état partagé inutile ailleurs.
function setupOrderReads(...responses: { data: unknown; error?: unknown }[]) {
  const queue = [...responses];
  fromMock.mockImplementation((table: string) => {
    if (table !== 'shop_orders') return tableChain({ data: null, error: null });
    const next = queue.shift() ?? responses[responses.length - 1];
    return tableChain(next);
  });
}

function req(body: unknown): NextRequest {
  return new NextRequest('https://woorri.test/api/shop/cancel-order', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const ORDER_PENDING = { id: 'order-1', site_id: 'site-1', status: 'pending', cj_order_id: null, cancel_token: 'tok-1', payment_provider: 'stripe' };
const ORDER_PAID = { ...ORDER_PENDING, status: 'paid' };
const ORDER_CANCELED = { ...ORDER_PENDING, status: 'canceled' };
const ORDER_REFUNDED = { ...ORDER_PENDING, status: 'refunded' };
const ORDER_SHIPPED = { ...ORDER_PENDING, status: 'shipped' };
// PHASE 6 / A6 -- fixture COMPLETE, assertions inchangees. Une commande
// portant un `cj_order_id` EST une commande fournisseur : `fulfillment_domain`
// est NOT NULL + CHECK IN ('merchant','supplier') en base depuis la phase 2,
// une commande sans domaine n'existe donc pas. L'omettre ici decrivait un etat
// impossible, et masquait le fait que la route branchait sur l'identifiant
// plutot que sur le domaine.
const ORDER_CJ = { ...ORDER_PAID, cj_order_id: 'cj-order-1', fulfillment_domain: 'supplier' };

// PHASE 6 / A6 -- deux commandes IDENTIQUES a une seule chose pres : le
// domaine d'execution. C'est ce qui rend l'assertion discriminante.
const ORDER_SUPPLIER_AVEC_CJ = { ...ORDER_CJ, fulfillment_domain: 'supplier' };
const ORDER_MERCHANT_AVEC_CJ = { ...ORDER_CJ, fulfillment_domain: 'merchant' };

beforeEach(() => {
  fromMock.mockReset();
  cancelShopOrderAtomicMock.mockReset();
  cjCancelOrderMock.mockReset();
  refundPaymentMock.mockReset();
  logAnomalyMock.mockReset();
  cjCancelOrderMock.mockResolvedValue({ ok: true });
  refundPaymentMock.mockResolvedValue({ id: 're_1', status: 'succeeded', amount: 1000 });
});

describe('POST /api/shop/cancel-order — validation d\'entrée', () => {
  it('orderId ou token manquant -> 400, aucun appel DB', async () => {
    const res = await POST(req({ orderId: 'order-1' }));
    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('token ne correspond pas à cancel_token -> 403, jamais d\'action', async () => {
    setupOrderReads({ data: ORDER_PENDING, error: null });
    const res = await POST(req({ orderId: 'order-1', token: 'mauvais-token' }));
    expect(res.status).toBe(403);
    expect(cancelShopOrderAtomicMock).not.toHaveBeenCalled();
  });

  it('commande introuvable -> 403 (même réponse qu\'un token invalide, ne révèle pas l\'existence)', async () => {
    setupOrderReads({ data: null, error: null });
    const res = await POST(req({ orderId: 'order-x', token: 'tok-1' }));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/shop/cancel-order — gardes d\'idempotence (F9/F10)', () => {
  it('déjà canceled -> succès immédiat, aucune action', async () => {
    setupOrderReads({ data: ORDER_CANCELED, error: null });
    const res = await POST(req({ orderId: 'order-1', token: 'tok-1' }));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.alreadyCanceled).toBe(true);
    expect(cancelShopOrderAtomicMock).not.toHaveBeenCalled();
  });

  it('déjà refunded (chemin F7 stock insuffisant) -> succès immédiat, jamais de double traitement', async () => {
    setupOrderReads({ data: ORDER_REFUNDED, error: null });
    const res = await POST(req({ orderId: 'order-1', token: 'tok-1' }));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.alreadyCanceled).toBe(true);
    expect(cancelShopOrderAtomicMock).not.toHaveBeenCalled();
  });

  it('shipped -> 409, jamais annulable', async () => {
    setupOrderReads({ data: ORDER_SHIPPED, error: null });
    const res = await POST(req({ orderId: 'order-1', token: 'tok-1' }));
    expect(res.status).toBe(409);
    expect(cancelShopOrderAtomicMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/shop/cancel-order — Mode 3 : CJ (inchangé)', () => {
  it('CJ refuse -> 409, cancelShopOrderAtomic jamais appelé (aucun stock ni statut touché)', async () => {
    setupOrderReads({ data: ORDER_CJ, error: null });
    cjCancelOrderMock.mockRejectedValue(new Error('already shipped by supplier'));
    const res = await POST(req({ orderId: 'order-1', token: 'tok-1' }));
    expect(res.status).toBe(409);
    expect(cancelShopOrderAtomicMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'cancel_refused_by_supplier' }));
  });

  it('CJ accepte -> cancelShopOrderAtomic appelé ensuite normalement', async () => {
    setupOrderReads({ data: ORDER_CJ, error: null });
    cancelShopOrderAtomicMock.mockResolvedValue({ ok: true, restocked: true, paymentIntentId: 'pi_1' });
    await POST(req({ orderId: 'order-1', token: 'tok-1' }));
    expect(cjCancelOrderMock).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'cj-order-1');
    expect(cancelShopOrderAtomicMock).toHaveBeenCalledWith('order-1');
  });
});

describe('POST /api/shop/cancel-order — F9 : restauration de stock', () => {
  it('pending -> canceled : restocked:false, AUCUN remboursement appelé', async () => {
    setupOrderReads({ data: ORDER_PENDING, error: null });
    cancelShopOrderAtomicMock.mockResolvedValue({ ok: true, restocked: false });
    const res = await POST(req({ orderId: 'order-1', token: 'tok-1' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.refundId).toBeNull();
    expect(refundPaymentMock).not.toHaveBeenCalled();
  });

  it('paid -> canceled : restocked:true, remboursement appelé avec le payment_intent_id retourné par la RPC (jamais celui lu avant)', async () => {
    setupOrderReads({ data: ORDER_PAID, error: null });
    cancelShopOrderAtomicMock.mockResolvedValue({ ok: true, restocked: true, paymentIntentId: 'pi_from_rpc' });
    const res = await POST(req({ orderId: 'order-1', token: 'tok-1' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.refundId).toBe('re_1');
    expect(refundPaymentMock).toHaveBeenCalledWith('pi_from_rpc');
  });

  it('paid -> canceled mais remboursement Stripe échoue -> 500, anomalie loggée, commande reste annulée côté réponse (pas de rollback applicatif)', async () => {
    setupOrderReads({ data: ORDER_PAID, error: null });
    cancelShopOrderAtomicMock.mockResolvedValue({ ok: true, restocked: true, paymentIntentId: 'pi_1' });
    refundPaymentMock.mockRejectedValue(new Error('stripe down'));
    const res = await POST(req({ orderId: 'order-1', token: 'tok-1' }));
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.reason).toBe('refund_failed');
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'refund_failed' }));
  });
});

describe('POST /api/shop/cancel-order — F10 : conflit / course avec le webhook', () => {
  it('cancelShopOrderAtomic renvoie NOT_CANCELABLE, relecture montre "canceled" (le webhook ou une autre annulation a gagné la course) -> succès rassurant, pas d\'erreur', async () => {
    setupOrderReads(
      { data: ORDER_PAID, error: null },     // lecture initiale
      { data: ORDER_CANCELED, error: null }  // relecture après échec RPC
    );
    cancelShopOrderAtomicMock.mockResolvedValue({ ok: false, reason: 'NOT_CANCELABLE' });
    const res = await POST(req({ orderId: 'order-1', token: 'tok-1' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.alreadyCanceled).toBe(true);
    expect(refundPaymentMock).not.toHaveBeenCalled();
  });

  it('cancelShopOrderAtomic renvoie NOT_CANCELABLE, relecture montre un état inattendu -> 409 conflit, invite à réessayer (jamais un faux succès)', async () => {
    setupOrderReads(
      { data: ORDER_PAID, error: null },
      { data: ORDER_SHIPPED, error: null }
    );
    cancelShopOrderAtomicMock.mockResolvedValue({ ok: false, reason: 'NOT_CANCELABLE' });
    const res = await POST(req({ orderId: 'order-1', token: 'tok-1' }));
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.reason).toBe('conflict');
  });

  it('erreur RPC/réseau sur cancelShopOrderAtomic -> traité comme NOT_CANCELABLE (jamais un throw ni un faux succès)', async () => {
    setupOrderReads(
      { data: ORDER_PAID, error: null },
      { data: ORDER_PAID, error: null }
    );
    cancelShopOrderAtomicMock.mockResolvedValue({ ok: false, reason: 'connection refused' });
    const res = await POST(req({ orderId: 'order-1', token: 'tok-1' }));
    expect(res.status).toBe(409);
    expect(refundPaymentMock).not.toHaveBeenCalled();
  });
});


// ============================================================
// A6 -- CONTRAT COMPORTEMENTAL : une commande `merchant` n'atteint AUCUN
// adaptateur fournisseur.
// ============================================================
// Ce que la suite ci-dessus prouvait deja : « pas d'identifiant fournisseur
// -> pas d'appel ». Ce n'est PAS la proposition A6. La garde de cette route
// est `if (order.cj_order_id)` -- l'identifiant, jamais le domaine.
//
// Depuis la phase 3, aucune commande marchande ne peut acquerir un
// `cj_order_id` : les deux moteurs refusent avant d'en creer un. Mais c'est
// une garantie DE LA DONNEE, pas du code. A6 exige que la frontiere tienne
// meme si la donnee ment -- c'est tout l'objet d'un contrat de frontiere.
//
// Le couple de tests est indissociable : le cas `supplier` prouve que le
// harnais atteint reellement l'adaptateur, donc qu'un echec du cas
// `merchant` ne peut pas venir d'un fixture ou d'un mock inerte.

describe('A6 -- frontiere de domaine a l\'annulation', () => {
  it('CONTROLE -- domaine supplier + cj_order_id : l\'adaptateur EST atteint', async () => {
    setupOrderReads({ data: ORDER_SUPPLIER_AVEC_CJ, error: null });
    cancelShopOrderAtomicMock.mockResolvedValue({ ok: true, restocked: false, paymentIntentId: null });

    await POST(req({ orderId: 'order-1', token: 'tok-1' }));

    expect(
      cjCancelOrderMock,
      "sans cet appel, le test A6 ci-dessous serait vert pour la mauvaise raison"
    ).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'cj-order-1');
  });

  // FAIL-CLOSED -- meme pattern que cj/fulfill et suppliers/pod-fulfill, qui
  // caracterisent tous deux leur garde sur les TROIS memes valeurs. Sans ces
  // lignes, une garde ecrite `=== 'merchant'` passerait : elle protegerait le
  // cas nomme et laisserait filer un domaine absent ou inattendu -- exactement
  // l'asymetrie qui avait cree le trou d'origine (brancher sur une valeur
  // connue plutot que sur l'appartenance au domaine autorise).
  //
  // `cj_order_id` est present dans les quatre cas : c'est le domaine, et lui
  // seul, qui doit decider.
  it.each([
    ['merchant', 'merchant'],
    ['absent (colonne nulle)', null],
    ['absent (cle non renseignee)', undefined],
    ['valeur inattendue', 'autre'],
  ])('domaine %s + cj_order_id -> AUCUN appel adaptateur, refus trace', async (_libelle, domaine) => {
    setupOrderReads({ data: { ...ORDER_CJ, fulfillment_domain: domaine }, error: null });
    cancelShopOrderAtomicMock.mockResolvedValue({ ok: true, restocked: false, paymentIntentId: null });

    await POST(req({ orderId: 'order-1', token: 'tok-1' }));

    expect(
      cjCancelOrderMock,
      "seul le domaine `supplier` autorise un appel fournisseur : tout le reste, connu ou non, doit etre ferme"
    ).not.toHaveBeenCalled();
    expect(
      logAnomalyMock,
      "un etat contradictoire (identifiant fournisseur sans domaine fournisseur) ne doit jamais etre absorbe en silence"
    ).toHaveBeenCalledWith(expect.objectContaining({ type: 'cancel_supplier_domain_refuse' }));
  });

  it('l\'annulation LOCALE se poursuit malgre le refus fournisseur -- le marchand n\'est jamais bloque', async () => {
    setupOrderReads({ data: { ...ORDER_CJ, fulfillment_domain: 'merchant' }, error: null });
    cancelShopOrderAtomicMock.mockResolvedValue({ ok: true, restocked: false, paymentIntentId: null });

    const res = await POST(req({ orderId: 'order-1', token: 'tok-1' }));

    expect(res.status).toBe(200);
    expect(cancelShopOrderAtomicMock).toHaveBeenCalledWith('order-1');
  });

  it('A6 -- domaine merchant + cj_order_id : AUCUN adaptateur fournisseur atteint', async () => {
    setupOrderReads({ data: ORDER_MERCHANT_AVEC_CJ, error: null });
    cancelShopOrderAtomicMock.mockResolvedValue({ ok: true, restocked: false, paymentIntentId: null });

    await POST(req({ orderId: 'order-1', token: 'tok-1' }));

    expect(
      cjCancelOrderMock,
      "une commande executee par le marchand ne doit atteindre aucun fournisseur, quel que soit le contenu de ses colonnes fournisseur : la frontiere est le DOMAINE, jamais un identifiant"
    ).not.toHaveBeenCalled();
  });
});
