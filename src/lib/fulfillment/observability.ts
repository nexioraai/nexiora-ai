import 'server-only';
import { logAnomaly } from '@/lib/anomaly';

// ============================================================
// P0-3.7 Phase 21 — Observabilité minimale, réutilisant le mécanisme
// d'alerte existant (src/lib/anomaly.ts::logAnomaly, déjà utilisé par
// src/lib/cj/fulfill.ts) plutôt qu'un nouveau système d'event sourcing ou
// de journalisation massif (explicitement exclu par P0-3.7Z Partie 14 et
// P0-3.8 Phase 21).
// ============================================================

export async function reportLateWebhook(params: {
  submissionId: string;
  activeSubmissionId: string | null;
  provider: string;
  providerOrderId: string;
  lateUnits: string[];
}): Promise<void> {
  await logAnomaly({
    type: 'fulfillment_late_webhook',
    severity: 'warning',
    details: {
      submission_id: params.submissionId,
      active_submission_id: params.activeSubmissionId,
      provider: params.provider,
      provider_order_id: params.providerOrderId,
      late_units: params.lateUnits,
      note: 'Webhook confirmant un provider_order sous une submission qui n\'est plus active (P0-3.7Z) — décision business requise, aucun changement automatique effectué.',
    },
  });
}

export async function reportUnrecognizedProviderStatus(params: {
  provider: string;
  providerOrderId: string;
  rawStatus: string;
}): Promise<void> {
  await logAnomaly({
    type: 'fulfillment_unrecognized_provider_status',
    severity: 'info',
    details: params,
  });
}

export async function reportRejectedTransition(params: {
  provider: string;
  providerOrderId: string;
  fromStatus: string;
  toStatus: string;
}): Promise<void> {
  await logAnomaly({
    type: 'fulfillment_invalid_transition_rejected',
    severity: 'warning',
    details: params,
  });
}

export async function reportProviderChangeRace(params: {
  orderId: string;
  provider: string;
  fulfillmentUnitId?: string;
  activeSubmissionId?: string;
  activeStatus?: string;
}): Promise<void> {
  await logAnomaly({
    type: 'fulfillment_provider_change_race',
    severity: 'info',
    details: params,
  });
}

/** P0-3.9.6 Gap #1E — webhook reçu pour une clé ne correspondant à aucune Submission connue. */
export async function reportUnknownWebhookSubmission(params: {
  provider: string;
  providerOrderId: string;
  submissionKeyRaw: string;
}): Promise<void> {
  await logAnomaly({
    type: 'fulfillment_unknown_webhook_submission',
    severity: 'info',
    details: params,
  });
}

export async function reportReconciliationConflict(params: {
  submissionId: string;
  provider: string;
  reason: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await logAnomaly({
    type: 'fulfillment_reconciliation_conflict',
    severity: 'blocked',
    details: { submission_id: params.submissionId, provider: params.provider, reason: params.reason, ...params.details },
  });
}
