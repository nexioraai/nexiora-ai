// F7 (audit stock Mode 2) — refundPayment() n'utilisait aucune clé
// d'idempotence Stripe : un appel dupliqué (par n'importe quel appelant,
// present ou futur -- cancel-order/route.ts et handlePaidCheckout.ts
// l'utilisent tous deux) pouvait créer un second remboursement au lieu de
// renvoyer le premier. Ce test prouve que la clé est bien transmise à
// l'appel Stripe réel, déterministe par payment_intent.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refundsCreateMock = vi.fn();
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    refunds: { create: (...a: unknown[]) => refundsCreateMock(...a) },
  }),
}));

import { stripeProvider } from '../stripe';

beforeEach(() => {
  refundsCreateMock.mockReset();
  refundsCreateMock.mockResolvedValue({ id: 're_1', status: 'succeeded', amount: 3000 });
});

describe('stripeProvider.refundPayment — clé d\'idempotence Stripe', () => {
  it('transmet une idempotencyKey déterministe, dérivée du payment_intent', async () => {
    await stripeProvider.refundPayment('pi_abc123');
    expect(refundsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_abc123', reverse_transfer: true, refund_application_fee: true }),
      { idempotencyKey: 'refund_pi_abc123' }
    );
  });

  it('deux payment_intent différents -> deux clés différentes (pas de collision entre commandes distinctes)', async () => {
    await stripeProvider.refundPayment('pi_one');
    await stripeProvider.refundPayment('pi_two');
    const keys = refundsCreateMock.mock.calls.map((c) => c[1].idempotencyKey);
    expect(keys).toEqual(['refund_pi_one', 'refund_pi_two']);
  });
});
