import 'server-only';

// ============================================================
// P0-3.7 — Types verrouillés du modèle de fulfillment.
// Contrat architectural : voir P0-3.7A→Z (débat), P0-3.7 Final Gate
// (verdict), P0-3.8 (implémentation).
//
// Volontairement pas d'enum PostgreSQL / contrainte CHECK en base
// (cohérent avec la convention existante du repo — aucune colonne de
// statut n'est contrainte par un enum ailleurs, P0-3.7Q). La validation
// vit ici, côté TypeScript.
// ============================================================

/** Statut d'une Provider Submission (P0-3.7A-F, verrouillé P0-3.7Y/Z — 6 valeurs, pas de FAILED_RETRYABLE distinct : un échec transitoire retryable retombe sur UNCERTAIN). */
export type SubmissionStatus =
  | 'pending'
  | 'processing'
  | 'success'
  | 'uncertain'
  | 'failed_confirmed'
  | 'failed_permanent';

/** Statuts qui autorisent une nouvelle tentative de claim (retry) sur la même Submission. */
export const SUBMISSION_CLAIMABLE_STATUSES: SubmissionStatus[] = ['pending', 'uncertain'];

/** Statuts terminaux d'échec — seuls états depuis lesquels un Provider Change est autorisé (P0-3.7Q-V). */
export const SUBMISSION_TERMINAL_FAILURE_STATUSES: SubmissionStatus[] = ['failed_confirmed', 'failed_permanent'];

/**
 * Statut normalisé d'un Provider Order (P0-3.7W/X/Y — modèle catégoriel,
 * pas un rang total). `unrecognized` = incertitude interprétative
 * (P0-3.7X Partie 7, distinct de `uncertain` côté Submission qui est une
 * incertitude existentielle).
 *
 * CANCELED / RETURNED / ON_HOLD ne sont PAS des valeurs de ce type —
 * retirés explicitement (P0-3.7X/Y) :
 *  - CANCELED : le code existant (printful/printify adapters)
 *    mappe déjà `canceled`/`cancelled` vers `failed` — aligné, pas réintroduit.
 *  - RETURNED : appartient à une couche commerciale non modélisée ici.
 *  - ON_HOLD : reste un raw status possible (`onhold` chez Printful,
 *    mappé vers `processing`), jamais une catégorie normalisée.
 */
export type ProviderOrderNormalizedStatus =
  | 'pending'
  | 'processing'
  | 'shipped'
  | 'in_transit'
  | 'delivered'
  | 'failed'
  | 'unrecognized';

export const PROVIDER_ORDER_PROGRESSION_RANK: Record<string, number> = {
  pending: 1,
  processing: 2,
  shipped: 3,
  in_transit: 4,
  delivered: 5,
};

export type SupplierId = 'printful' | 'gelato' | 'cj' | 'printify';

export interface ProviderSubmissionRow {
  id: string;
  order_id: string;
  provider: SupplierId;
  idempotency_key: string;
  status: SubmissionStatus;
  attempt_count: number;
  last_provider_response: unknown;
  created_at: string;
  updated_at: string;
}

export interface ProviderOrderRow {
  id: string;
  submission_id: string;
  provider: SupplierId;
  provider_order_id: string;
  raw_provider_status: string | null;
  normalized_status: ProviderOrderNormalizedStatus;
  last_provider_response: unknown;
  created_at: string;
  updated_at: string;
}

export interface CreateSubmissionResult {
  success: boolean;
  submission_id?: string;
  reason?: 'ACTIVE_SUBMISSION_NOT_TERMINAL' | 'EMPTY_UNIT_LIST';
  fulfillment_unit_id?: string;
  active_submission_id?: string;
  active_status?: SubmissionStatus;
}

export interface ClaimAttemptResult {
  success: boolean;
  attempt_count?: number;
  reason?: 'CLAIM_LOST_OR_INVALID_STATE';
}

export interface TransitionSubmissionResult {
  success: boolean;
  reason?: 'UNEXPECTED_CURRENT_STATUS';
}

export interface UpsertProviderOrderResult {
  success: boolean;
  provider_order_row_id?: string;
  was_new?: boolean;
  late_webhook?: boolean;
  late_units?: string[];
}

export interface ApplyProviderOrderStatusResult {
  success: boolean;
  from_status?: ProviderOrderNormalizedStatus;
  to_status?: ProviderOrderNormalizedStatus;
  reason?: 'PROVIDER_ORDER_NOT_FOUND' | 'TRANSITION_REJECTED';
}
