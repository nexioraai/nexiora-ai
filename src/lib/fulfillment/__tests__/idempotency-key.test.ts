import { describe, it, expect } from 'vitest';
import { encodeIdempotencyKey, decodeIdempotencyKey, deriveIdempotencyKey } from '../idempotency-key';

const SAMPLE_UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('encodeIdempotencyKey / decodeIdempotencyKey (P0-3.7N)', () => {
  it('round-trip exact', () => {
    const encoded = encodeIdempotencyKey(SAMPLE_UUID);
    expect(decodeIdempotencyKey(encoded)).toBe(SAMPLE_UUID);
  });

  it('produit une clé <= 32 caractères (contrainte Printful external_id)', () => {
    const encoded = encodeIdempotencyKey(SAMPLE_UUID);
    expect(encoded.length).toBeLessThanOrEqual(32);
  });

  it('est déterministe (même UUID -> même clé, stable across retries, P0-3.7O)', () => {
    expect(encodeIdempotencyKey(SAMPLE_UUID)).toBe(encodeIdempotencyKey(SAMPLE_UUID));
  });
});

describe('deriveIdempotencyKey — granularité par fournisseur (P0-3.7P/Q)', () => {
  const orderId = '11111111-1111-1111-1111-111111111111';
  const unitId = '22222222-2222-2222-2222-222222222222';

  it('printful : dérive de l\'unité (submission = 1 item, 1:1)', () => {
    const key = deriveIdempotencyKey('printful', { orderId, fulfillmentUnitId: unitId });
    expect(decodeIdempotencyKey(key)).toBe(unitId);
  });

  it('gelato : dérive de la commande (batching order-level, calculateShipping preuve P0-3.7P)', () => {
    const key = deriveIdempotencyKey('gelato', { orderId, fulfillmentUnitId: unitId });
    expect(decodeIdempotencyKey(key)).toBe(orderId);
  });

  it('cj : dérive de la commande (batching existant, cj/fulfill.ts non modifié)', () => {
    const key = deriveIdempotencyKey('cj', { orderId, fulfillmentUnitId: unitId });
    expect(decodeIdempotencyKey(key)).toBe(orderId);
  });
});
