import 'server-only';
import { PRINTFUL_TRACKING_STATUS_MAP } from '@/lib/suppliers/printful-adapter';
import type { ProviderOrderNormalizedStatus, SupplierId } from './types';

// ============================================================
// P0-3.7 Phase 7-8 — Normalisation raw → normalized, responsabilité
// UNIQUE par fournisseur, réutilisée par tous les points d'entrée
// (réponse HTTP de création, webhook, réconciliation).
//
// IMPORTANT — décision explicite, pas une omission :
// Pour Printful, on réutilise PRINTFUL_TRACKING_STATUS_MAP (extrait de
// printful-adapter.ts::getTracking(), comportement inchangé).
//
// Pour Gelato, on N'A PAS réutilisé `mapGelatoStatus()` existant
// (gelato-adapter.ts) : cette fonction retombe silencieusement sur
// 'pending' pour tout statut brut non reconnu, ce qui contredit
// directement la règle P0-3.7W/X (`raw inconnu → normalized=UNRECOGNIZED`,
// jamais une valeur inventée). Modifier le comportement de
// `mapGelatoStatus()` aurait changé le comportement existant du flux de
// tracking par polling (getTracking()), hors du périmètre de P0-3.7 —
// une nouvelle fonction, séparée, est donc écrite ici spécifiquement pour
// le nouveau système de fulfillment, sans toucher au code existant.
// ============================================================

function normalizePrintfulStatus(raw: string): ProviderOrderNormalizedStatus {
  const mapped = PRINTFUL_TRACKING_STATUS_MAP[raw];
  return mapped ?? 'unrecognized';
}

/**
 * Normalisation Gelato pour le fulfillment (P0-3.7) — DISTINCTE de
 * `mapGelatoStatus()` (gelato-adapter.ts), volontairement non réutilisée
 * (voir commentaire d'en-tête). `onhold`/`on_hold` reste un raw status
 * possible, mappé ici vers `processing` (P0-3.7Y/Z Partie 9 — ON_HOLD
 * n'est jamais une catégorie normalisée distincte).
 */
function normalizeGelatoStatus(raw: string): ProviderOrderNormalizedStatus {
  const s = (raw || '').toLowerCase();
  if (s.includes('delivered')) return 'delivered';
  if (s.includes('shipped')) return 'shipped';
  if (s.includes('transit')) return 'in_transit';
  if (s.includes('onhold') || s.includes('on_hold') || s.includes('printed') || s.includes('production') || s.includes('printing')) {
    return 'processing';
  }
  if (s.includes('cancel') || s.includes('failed')) return 'failed';
  if (s === 'pending' || s === '') return 'pending';
  return 'unrecognized';
}

const NORMALIZERS: Partial<Record<SupplierId, (raw: string) => ProviderOrderNormalizedStatus>> = {
  printful: normalizePrintfulStatus,
  gelato: normalizeGelatoStatus,
};

/**
 * Point d'entrée unique de normalisation (Phase 7 — responsabilité
 * conceptuelle unique). Utilisé par : réponse HTTP de création, webhook
 * handler, cron de réconciliation. Un fournisseur sans normalizer
 * enregistré (CJ — modèle order-level distinct, non concerné par cette
 * granularité de statut) retombe sur 'unrecognized', jamais une supposition.
 */
export function normalizeProviderStatus(provider: SupplierId, rawStatus: string): ProviderOrderNormalizedStatus {
  const normalizer = NORMALIZERS[provider];
  if (!normalizer) return 'unrecognized';
  return normalizer(rawStatus);
}
