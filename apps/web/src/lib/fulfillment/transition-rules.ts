import 'server-only';
import { PROVIDER_ORDER_PROGRESSION_RANK, type ProviderOrderNormalizedStatus } from './types';

// ============================================================
// P0-3.7W/X — Modèle catégoriel de transition pour ProviderOrder.status.
//
// Miroir logique PUR (aucun accès DB) de la fonction SQL
// `apply_provider_order_status` (supabase/sql/fulfillment_functions.sql).
// La fonction SQL reste la source de vérité autoritaire (elle seule
// s'exécute atomiquement contre l'état réel en base) — ce module existe
// pour : (a) être testable unitairement sans base de données, (b) une
// validation de confort côté application avant l'appel RPC (évite un
// aller-retour réseau pour un rejet déjà évident).
//
// Toute divergence entre ce module et la fonction SQL est un bug —
// les deux DOIVENT encoder exactement la même règle (vérifié par les
// tests, voir src/lib/fulfillment/__tests__/transition-rules.test.ts).
// ============================================================

export interface TransitionCheckResult {
  allowed: boolean;
  reason?: 'NO_OP' | 'PROGRESSION' | 'BRANCH_TO_FAILED' | 'UNRECOGNIZED_ENTRY_OR_EXIT' | 'REGRESSION_REJECTED';
}

export function isProviderOrderTransitionAllowed(
  from: ProviderOrderNormalizedStatus,
  to: ProviderOrderNormalizedStatus
): TransitionCheckResult {
  if (from === to) {
    return { allowed: true, reason: 'NO_OP' };
  }
  if (from === 'unrecognized' || to === 'unrecognized') {
    return { allowed: true, reason: 'UNRECOGNIZED_ENTRY_OR_EXIT' };
  }
  if (to === 'failed' && from !== 'delivered') {
    return { allowed: true, reason: 'BRANCH_TO_FAILED' };
  }
  const fromRank = PROVIDER_ORDER_PROGRESSION_RANK[from];
  const toRank = PROVIDER_ORDER_PROGRESSION_RANK[to];
  if (fromRank !== undefined && toRank !== undefined && toRank > fromRank) {
    return { allowed: true, reason: 'PROGRESSION' };
  }
  return { allowed: false, reason: 'REGRESSION_REJECTED' };
}
