import 'server-only';
import { cjGetOrderDetail } from './client';
import { classifyCjOrderStatus } from './statusMap';

/**
 * Résultat d'une réconciliation avec CJ -- traduction complète statut CJ
 * externe -> résultat métier fermé (audit Reseller/CJ §3-4). Un seul point
 * d'entrée : plus aucun appelant ne doit lire `orderStatus` directement.
 */
export type ReconciliationOutcome =
  | { kind: 'NOT_FOUND' }
  | { kind: 'FOUND_PAID'; cjOrderId: string; raw: any }
  | { kind: 'FOUND_AWAITING'; cjOrderId: string; raw: any }
  | { kind: 'FOUND_TERMINAL'; cjOrderId: string; raw: any }
  | { kind: 'FOUND_UNRECOGNIZED'; cjOrderId: string; raw: any }
  | { kind: 'UNKNOWN'; reason: string };

/**
 * Détermine l'état réel d'une commande chez CJ pour notre `orderNumber`
 * (= shop_orders.id). Seul `NOT_FOUND` autorise une création côté appelant --
 * `UNKNOWN` ne doit jamais être traité comme une absence confirmée.
 */
export async function reconcileWithCj(
  email: string,
  apiKey: string,
  orderNumber: string
): Promise<ReconciliationOutcome> {
  const result = await cjGetOrderDetail(email, apiKey, orderNumber);

  if (result.outcome === 'not_found') return { kind: 'NOT_FOUND' };
  if (result.outcome === 'unknown') return { kind: 'UNKNOWN', reason: result.reason };

  const data = result.data;
  const cjOrderId = data?.orderId || data?.cjOrderId || null;
  if (!cjOrderId) {
    // "found" sans identifiant exploitable : ne devrait pas arriver d'après
    // toutes les réponses observées, mais on ne suppose rien -- traité comme
    // UNKNOWN plutôt que de persister un état classé sans cj_order_id fiable.
    return { kind: 'UNKNOWN', reason: 'found_without_order_id' };
  }

  const cls = classifyCjOrderStatus(data?.orderStatus);
  if (cls === 'paid') return { kind: 'FOUND_PAID', cjOrderId, raw: data };
  if (cls === 'awaiting') return { kind: 'FOUND_AWAITING', cjOrderId, raw: data };
  if (cls === 'terminal') return { kind: 'FOUND_TERMINAL', cjOrderId, raw: data };
  return { kind: 'FOUND_UNRECOGNIZED', cjOrderId, raw: data };
}
