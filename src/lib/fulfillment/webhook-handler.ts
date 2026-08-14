import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { upsertProviderOrder, applyProviderOrderStatus } from './provider-order-service';
import {
  reportLateWebhook,
  reportUnrecognizedProviderStatus,
  reportRejectedTransition,
  reportUnknownWebhookSubmission,
} from './observability';
import { normalizeProviderStatus } from './status-normalization';
import { isSubmissionFullyCovered, transitionSubmissionStatus } from './submission-service';
import type { SupplierId } from './types';

// ============================================================
// P0-3.7Z Phase 10-12, P0-3.9.6 Gap #1 — Traitement webhook partagé
// (Printful/Gelato). Un seul chemin logique ; l'enrichissement
// provider-spécifique (GET order Gelato, Gap #1A) reste à la charge de
// chaque route, qui fournit ici une liste déjà résolue de
// fulfillment_unit_id — jamais devinée depuis un format de payload
// webhook non confirmé (P0-3.9.5/3.9.6).
// ============================================================

interface ResolvedSubmission {
  submissionId: string;
  orderId: string;
}

async function resolveSubmissionByKey(
  provider: SupplierId,
  idempotencyKey: string
): Promise<ResolvedSubmission | null> {
  const { data, error } = await supabaseAdmin
    .from('provider_submissions')
    .select('id, order_id')
    .eq('provider', provider)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error || !data) return null;
  return { submissionId: data.id, orderId: data.order_id };
}

export interface WebhookEventInput {
  provider: SupplierId;
  /** Clé décodable identifiant la Submission (external_id Printful, orderReferenceId Gelato). */
  submissionKeyRaw: string;
  /**
   * Unités concernées par ce Provider Order — toujours résolues par
   * l'appelant (route), jamais devinées ici. Printful : un seul élément
   * (granularité 1:1, P0-3.7P). Gelato : un ou plusieurs, obtenus via
   * enrichissement GET /v4/orders/{orderId} (Gap #1A), jamais depuis le
   * seul payload webhook dont la structure items[] reste [NON DÉMONTRÉ].
   */
  fulfillmentUnitIds: string[];
  providerOrderId: string;
  rawStatus: string;
  rawPayload: unknown;
}

export type WebhookProcessingOutcome =
  | { outcome: 'processed'; providerOrderRowId: string; lateWebhook: boolean; submissionResolved: boolean }
  | { outcome: 'unknown_submission' }
  | { outcome: 'transition_rejected' };

/**
 * Traite un événement webhook déjà résolu (provider-agnostic). Idempotent
 * par construction (UNIQUE(provider, provider_order_id) côté DB), tolérant
 * au désordre (garde catégorielle, P0-3.7W/X), et signale sans jamais
 * réécrire l'historique en cas de late webhook (P0-3.7Z). Referme la
 * boucle sur le statut de la Submission une fois la couverture complète
 * atteinte (P0-3.9.6 Gap #1) — jamais en rouvrant un état terminal
 * (Gap #1B/#3A : expected_statuses = ['processing', 'uncertain'] uniquement).
 */
export async function processWebhookEvent(event: WebhookEventInput): Promise<WebhookProcessingOutcome> {
  if (event.fulfillmentUnitIds.length === 0) {
    return { outcome: 'unknown_submission' };
  }

  const resolved = await resolveSubmissionByKey(event.provider, event.submissionKeyRaw);
  if (!resolved) {
    // Clé inconnue : ni une submission Woorri, ni décodable — signalé
    // (P0-3.9.6 Gap #1E), pas fatal (peut être un événement de
    // test/replay fournisseur).
    await reportUnknownWebhookSubmission({
      provider: event.provider,
      providerOrderId: event.providerOrderId,
      submissionKeyRaw: event.submissionKeyRaw,
    });
    return { outcome: 'unknown_submission' };
  }

  const normalizedStatus = normalizeProviderStatus(event.provider, event.rawStatus);

  if (normalizedStatus === 'unrecognized') {
    await reportUnrecognizedProviderStatus({
      provider: event.provider,
      providerOrderId: event.providerOrderId,
      rawStatus: event.rawStatus,
    });
  }

  const result = await upsertProviderOrder({
    submissionId: resolved.submissionId,
    provider: event.provider,
    providerOrderId: event.providerOrderId,
    rawStatus: event.rawStatus,
    providerResponse: event.rawPayload,
    fulfillmentUnitIds: event.fulfillmentUnitIds,
  });

  if (!result.success || !result.provider_order_row_id) {
    return { outcome: 'unknown_submission' };
  }

  if (result.late_webhook) {
    await reportLateWebhook({
      submissionId: resolved.submissionId,
      activeSubmissionId: null,
      provider: event.provider,
      providerOrderId: event.providerOrderId,
      lateUnits: result.late_units || [],
    });
  }

  // Si la ligne provider_orders existait déjà (webhook de suivi ultérieur,
  // pas la première preuve d'existence), appliquer la garde catégorielle
  // de transition (P0-3.7W/X) plutôt que le statut déjà écrit par l'upsert
  // initial.
  if (!result.was_new) {
    const applied = await applyProviderOrderStatus(result.provider_order_row_id, event.provider, event.rawStatus);
    if (!applied.success) {
      await reportRejectedTransition({
        provider: event.provider,
        providerOrderId: event.providerOrderId,
        fromStatus: applied.from_status || 'unknown',
        toStatus: applied.to_status || normalizedStatus,
      });
      return { outcome: 'transition_rejected' };
    }
  }

  // P0-3.9.6 Gap #1 — couverture de la Submission : SUCCESS uniquement si
  // provider_submission_items MINUS provider_order_items est vide (règle
  // verrouillée P0-3.9.5/3.9.6, jamais un comptage de Provider Orders).
  // Ne s'applique jamais si le webhook était "late" (Partie ci-dessus) :
  // dans ce cas, resolved.submissionId n'est plus la Submission active,
  // et late_webhook a déjà signalé la situation sans y toucher.
  if (!result.late_webhook) {
    const covered = await isSubmissionFullyCovered(resolved.submissionId);
    if (covered) {
      // Gap #1B/#3A : jamais depuis un état terminal — la transition
      // échoue silencieusement (et correctement) si la Submission est
      // déjà success/failed_*, sans jamais les rouvrir.
      await transitionSubmissionStatus(resolved.submissionId, 'success', ['processing', 'uncertain']);
    }
  }

  return {
    outcome: 'processed',
    providerOrderRowId: result.provider_order_row_id,
    lateWebhook: !!result.late_webhook,
    submissionResolved: true,
  };
}
