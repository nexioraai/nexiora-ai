import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { deriveIdempotencyKey } from './idempotency-key';
import type {
  ClaimAttemptResult,
  CreateSubmissionResult,
  SupplierId,
  TransitionSubmissionResult,
} from './types';

// ============================================================
// P0-3.7U/V Phase 3+13 — Couche de service pour Provider Submission.
// N'exécute jamais de SQL directement : toute opération qui touche à
// l'atomicité du pointeur (fulfillment_unit_active_submission) passe
// par les fonctions PostgreSQL (supabase/sql/fulfillment_functions.sql),
// seules capables d'exprimer les séquences multi-instructions verrouillées
// dans P0-3.7 (contradiction technique signalée et validée en P0-3.8).
// ============================================================

export interface CreateSubmissionParams {
  orderId: string;
  provider: SupplierId;
  fulfillmentUnitIds: string[];
}

/**
 * Crée une nouvelle Provider Submission et revendique/déplace le pointeur
 * actif pour toutes les unités couvertes, atomiquement (P0-3.7V Partie 1,
 * P0-3.7T Partie 4-5). Utilisé aussi bien pour la toute première tentative
 * que pour un Provider Change (P0-3.7Q-V — le guard "échec terminal requis"
 * est appliqué côté fonction SQL, pas ici).
 */
export async function createProviderSubmission(
  params: CreateSubmissionParams
): Promise<CreateSubmissionResult> {
  if (params.fulfillmentUnitIds.length === 0) {
    return { success: false, reason: 'EMPTY_UNIT_LIST' };
  }

  const idempotencyKey = deriveIdempotencyKey(
    params.provider === 'gelato' || params.provider === 'cj' ? params.provider : 'printful',
    { orderId: params.orderId, fulfillmentUnitId: params.fulfillmentUnitIds[0] }
  );

  const { data, error } = await supabaseAdmin.rpc('create_provider_submission', {
    p_order_id: params.orderId,
    p_provider: params.provider,
    p_idempotency_key: idempotencyKey,
    p_fulfillment_unit_ids: params.fulfillmentUnitIds,
  });

  if (error) {
    // Un CONCURRENT_SUBMISSION_RACE (raise exception côté SQL, P0-3.7V
    // Partie 4) atterrit ici — c'est le résultat ATTENDU du perdant d'une
    // course de création, pas une erreur système à propager comme un crash.
    if (typeof error.message === 'string' && error.message.includes('CONCURRENT_SUBMISSION_RACE')) {
      return { success: false, reason: 'ACTIVE_SUBMISSION_NOT_TERMINAL' };
    }
    throw new Error(`create_provider_submission failed: ${error.message}`);
  }

  return data as CreateSubmissionResult;
}

/**
 * Revendique une tentative réseau sur une Submission EXISTANTE (retry ou
 * première tentative après création) — généralisation du pattern
 * cj_pay_status/cj_pay_attempts (src/lib/cj/fulfill.ts, jamais modifié).
 */
export async function claimSubmissionAttempt(submissionId: string): Promise<ClaimAttemptResult> {
  const { data, error } = await supabaseAdmin.rpc('claim_provider_submission_attempt', {
    p_submission_id: submissionId,
  });
  if (error) throw new Error(`claim_provider_submission_attempt failed: ${error.message}`);
  return data as ClaimAttemptResult;
}

/**
 * Transition conditionnelle générique de provider_submissions.status.
 * N'écrit jamais si l'état courant ne correspond pas à `expectedStatuses`
 * — protège contre toute réécriture rétroactive d'une submission déjà
 * terminale (P0-3.7Z Partie 4, invariant central de ce round).
 */
export async function transitionSubmissionStatus(
  submissionId: string,
  newStatus: string,
  expectedStatuses: string[],
  providerResponse?: unknown
): Promise<TransitionSubmissionResult> {
  const { data, error } = await supabaseAdmin.rpc('transition_submission_status', {
    p_submission_id: submissionId,
    p_new_status: newStatus,
    p_expected_statuses: expectedStatuses,
    p_provider_response: providerResponse ?? null,
  });
  if (error) throw new Error(`transition_submission_status failed: ${error.message}`);
  return data as TransitionSubmissionResult;
}

/**
 * P0-3.9.6 Gap #1 — Couverture d'une Submission : vraie ssi
 * provider_submission_items (intention) MINUS provider_order_items
 * (résultat) est vide (P0-3.9.5/3.9.6, règle verrouillée). Ne compte
 * jamais le nombre de Provider Orders/Connected Orders — seulement la
 * couverture des Fulfillment Units connues de Woorri. Lecture simple,
 * pas de RPC : une lecture légèrement obsolète ne retarde qu'une
 * transition SUCCESS (rattrapée par un webhook ultérieur ou la
 * réconciliation), jamais une fausse déclaration de succès — la garde
 * conditionnelle de transitionSubmissionStatus reste l'unique autorité
 * d'écriture.
 */
/**
 * P0-3.9.6 Gap #2 — Récupère les Submissions bloquées en PROCESSING depuis
 * plus de `staleMs` (crash/abandon de worker, jamais détecté auparavant :
 * la réconciliation ne regardait que UNCERTAIN). Ne crée jamais de
 * nouvelle Submission, ne touche jamais le pointeur actif — réutilise
 * uniquement transitionSubmissionStatus (transition_submission_status),
 * dont la garde conditionnelle (expected_statuses=['processing']) est
 * l'unique protection contre une double récupération concurrente (Gap
 * #2D) : si un autre worker de récupération a déjà transitionné la même
 * Submission en premier, ce deuxième appel échoue proprement (success:
 * false), sans nouveau verrou. Extrait du cron pod-reconciliation pour
 * rester testable en isolation (P0-3.9.6).
 */
export async function recoverStaleProcessingSubmissions(
  staleBeforeIso: string,
  limit = 200
): Promise<{ recovered: number; candidates: number }> {
  const { data: staleProcessing } = await supabaseAdmin
    .from('provider_submissions')
    .select('id')
    .eq('status', 'processing')
    .lt('updated_at', staleBeforeIso)
    .limit(limit);

  let recovered = 0;
  for (const stale of staleProcessing || []) {
    const t = await transitionSubmissionStatus(stale.id, 'uncertain', ['processing']);
    if (t.success) recovered++;
    // Transition refusée : soit le worker d'origine est encore vivant et a
    // déjà mis à jour updated_at, soit un autre worker de récupération est
    // arrivé en premier (Gap #2D) — dans les deux cas, rien à faire de plus,
    // c'est le comportement sûr démontré par la garde conditionnelle réelle
    // (P0-3.8B, transaction concurrente réelle).
  }
  return { recovered, candidates: (staleProcessing || []).length };
}

export async function isSubmissionFullyCovered(submissionId: string): Promise<boolean> {
  const [{ data: intended }, { data: covered }] = await Promise.all([
    supabaseAdmin.from('provider_submission_items').select('fulfillment_unit_id').eq('submission_id', submissionId),
    supabaseAdmin.from('provider_order_items').select('fulfillment_unit_id').eq('submission_id', submissionId),
  ]);

  if (!intended || intended.length === 0) return false;

  const coveredSet = new Set((covered || []).map((row: { fulfillment_unit_id: string }) => row.fulfillment_unit_id));
  return intended.every((row: { fulfillment_unit_id: string }) => coveredSet.has(row.fulfillment_unit_id));
}
