import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Audit Mode 3/POD BRAND, perfectionnement -- checkout.session.expired
// était la SEULE écriture de statut de tout le repo sans garde CAS
// (.eq('status', ...)) avant ce correctif, contrairement au patron
// systématiquement appliqué ailleurs (handlePaidCheckout.ts, orders/route.ts
// PATCH, cj-tracking/route.ts). Sans garde, un webhook 'expired' reçu après
// un 'completed' déjà traité (retry Stripe, désordre de livraison) aurait
// écrasé silencieusement une commande payée en 'canceled'. Aucune
// couverture n'existait pour cette route avant ce lot.
// ============================================================

const constructEventMock = vi.fn();
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: { constructEvent: (...args: unknown[]) => constructEventMock(...args) },
  }),
}));

const handlePaidCheckoutMock = vi.fn();
vi.mock('@/lib/shop/handlePaidCheckout', () => ({
  handlePaidCheckout: (...args: unknown[]) => handlePaidCheckoutMock(...args),
}));

function makeSupabaseMock() {
  const updateCalls: { table: string; payload: any; eqCalls: [string, unknown][] }[] = [];
  const from = vi.fn((table: string) => {
    const eqCalls: [string, unknown][] = [];
    const b: any = {};
    b.update = (payload: unknown) => {
      updateCalls.push({ table, payload, eqCalls });
      return b;
    };
    b.eq = (col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return b;
    };
    b.then = (resolve: any) => resolve({ data: null, error: null });
    return b;
  });
  return { supabaseAdmin: { from }, updateCalls };
}

let currentMock: ReturnType<typeof makeSupabaseMock>;
vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() {
    return currentMock.supabaseAdmin;
  },
}));

import { POST } from '../route';

function makeRequest(rawBody = '{}') {
  return new Request('https://deribfy.test/api/stripe/connect-webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig-test' },
    body: rawBody,
  });
}

beforeEach(() => {
  constructEventMock.mockReset();
  handlePaidCheckoutMock.mockReset();
  currentMock = makeSupabaseMock();
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_test';
});

describe('POST /api/stripe/connect-webhook — checkout.session.expired', () => {
  it("guarde la transition par .eq('status', 'pending') -- ne doit jamais écraser une commande déjà payée/expédiée", async () => {
    constructEventMock.mockReturnValue({
      type: 'checkout.session.expired',
      data: { object: { id: 'cs_test_123' } },
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const update = currentMock.updateCalls.find((c) => c.table === 'shop_orders');
    expect(update?.payload).toEqual({ status: 'canceled' });
    expect(update?.eqCalls).toContainEqual(['payment_ref', 'cs_test_123']);
    expect(update?.eqCalls).toContainEqual(['status', 'pending']);
  });

  it('checkout.session.completed (mode payment) -> handlePaidCheckout, jamais un simple UPDATE direct', async () => {
    constructEventMock.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_456', mode: 'payment' } },
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(handlePaidCheckoutMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'cs_test_456' }));
  });
});
