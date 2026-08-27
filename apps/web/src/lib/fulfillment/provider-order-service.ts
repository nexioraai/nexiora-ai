import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeProviderStatus } from './status-normalization';
import type {
  ApplyProviderOrderStatusResult,
  ProviderOrderNormalizedStatus,
  SupplierId,
  UpsertProviderOrderResult,
} from './types';

// ============================================================
// P0-3.7V/W/X Phase 5-6-10-12 — Couche de service pour Provider Order.
// Point d'entrée unique pour toute preuve d'existence/statut d'une
// commande fournisseur, qu'elle vienne d'une réponse HTTP de création ou
// d'un webhook (Phase 7 — même chemin de normalisation, même chemin
// d'écriture, jamais trois logiques séparées).
// ============================================================

export interface UpsertProviderOrderParams {
  submissionId: string;
  provider: SupplierId;
  providerOrderId: string;
  rawStatus: string;
  providerResponse: unknown;
  fulfillmentUnitIds: string[];
}

/**
 * Enregistre l'existence d'un Provider Order (création OU webhook —
 * idempotent via UNIQUE(provider, provider_order_id), P0-3.7V Partie 11/14)
 * et calcule le diagnostic "late webhook" (P0-3.7Z) : compare le
 * submission_id résolu avec le pointeur actif de chaque unité, SANS jamais
 * déplacer le pointeur ni réécrire l'historique — signalement seul.
 */
export async function upsertProviderOrder(
  params: UpsertProviderOrderParams
): Promise<UpsertProviderOrderResult> {
  const normalizedStatus = normalizeProviderStatus(params.provider, params.rawStatus);

  const { data, error } = await supabaseAdmin.rpc('upsert_provider_order', {
    p_submission_id: params.submissionId,
    p_provider: params.provider,
    p_provider_order_id: params.providerOrderId,
    p_raw_status: params.rawStatus,
    p_normalized_status: normalizedStatus,
    p_provider_response: params.providerResponse ?? null,
    p_fulfillment_unit_ids: params.fulfillmentUnitIds,
  });

  if (error) throw new Error(`upsert_provider_order failed: ${error.message}`);
  return data as UpsertProviderOrderResult;
}

/**
 * Applique une mise à jour de statut (webhook de suivi ultérieur, une fois
 * le Provider Order déjà créé) sous la garde catégorielle P0-3.7W/X —
 * garantie en base par apply_provider_order_status(), pas seulement en
 * discipline applicative (amélioration par rapport à ce qui avait été
 * jugé nécessaire en P0-3.7Y Partie 14 — voir rapport).
 */
export async function applyProviderOrderStatus(
  providerOrderRowId: string,
  provider: SupplierId,
  rawStatus: string
): Promise<ApplyProviderOrderStatusResult> {
  const normalizedStatus = normalizeProviderStatus(provider, rawStatus);

  const { data, error } = await supabaseAdmin.rpc('apply_provider_order_status', {
    p_provider_order_row_id: providerOrderRowId,
    p_raw_status: rawStatus,
    p_new_normalized_status: normalizedStatus,
  });

  if (error) throw new Error(`apply_provider_order_status failed: ${error.message}`);
  return data as ApplyProviderOrderStatusResult;
}

export function isKnownNormalizedStatus(status: string): status is ProviderOrderNormalizedStatus {
  return ['pending', 'processing', 'shipped', 'in_transit', 'delivered', 'failed', 'unrecognized'].includes(status);
}
