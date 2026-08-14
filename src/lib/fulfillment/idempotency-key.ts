import 'server-only';

// ============================================================
// P0-3.7N — Encodage Base64url réversible, sans collision (transformation
// bijective d'un UUID 128 bits, ~22 caractères, alphabet compatible avec
// la contrainte Printful external_id <= 32 caractères).
// ============================================================

export function encodeIdempotencyKey(uuid: string): string {
  const hex = uuid.replace(/-/g, '');
  const bytes = Buffer.from(hex, 'hex');
  return bytes.toString('base64url');
}

export function decodeIdempotencyKey(encoded: string): string {
  const bytes = Buffer.from(encoded, 'base64url');
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * P0-3.7P/Q — granularité de clé par fournisseur :
 *  - printful : submission = 1 Fulfillment Unit (pas de référence par
 *    ligne côté API v1 actuellement utilisée) -> clé dérivée de l'unité.
 *  - gelato / cj : submission peut couvrir plusieurs Fulfillment Units
 *    d'une même commande (CJ : déjà batché, cj/fulfill.ts, non modifié ;
 *    Gelato : batching à l'ordre, prouvé par calculateShipping()) -> clé
 *    dérivée de la commande.
 */
export function deriveIdempotencyKey(
  provider: 'printful' | 'gelato' | 'cj',
  params: { orderId: string; fulfillmentUnitId: string }
): string {
  if (provider === 'printful') {
    return encodeIdempotencyKey(params.fulfillmentUnitId);
  }
  return encodeIdempotencyKey(params.orderId);
}
