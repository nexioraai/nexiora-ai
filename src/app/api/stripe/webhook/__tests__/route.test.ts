import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Chantier Site Web / Mode 1 — le webhook Stripe est le seul point d'entrée
// qui engage une vraie dépense (achat Porkbun) : jamais testé avant ce
// chantier. Verrouille la frontière entre abonnement domaine et abonnement
// site (metadata.nexiora_domain_id), et que provisionDomain() n'est appelé
// que dans les cas réellement attendus.
// ============================================================

const constructEventMock = vi.fn();
const subscriptionsRetrieveMock = vi.fn();
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: { constructEvent: (...args: unknown[]) => constructEventMock(...args) },
    subscriptions: { retrieve: (...args: unknown[]) => subscriptionsRetrieveMock(...args) },
  }),
}));

const provisionDomainMock = vi.fn();
vi.mock('@/lib/domains/provision', () => ({
  provisionDomain: (...args: unknown[]) => provisionDomainMock(...args),
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

function makeRequest(rawBody = '{}') {
  return new Request('https://woorri.test/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig-test' },
    body: rawBody,
  });
}

beforeEach(() => {
  constructEventMock.mockReset();
  subscriptionsRetrieveMock.mockReset();
  provisionDomainMock.mockReset().mockResolvedValue({ ok: true, status: 'dns_configured' });
  handlePaidCheckoutMock.mockReset();
  currentMock = makeSupabaseMock();
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
});

describe('POST /api/stripe/webhook — invoice.paid (frontière domaine vs abonnement site)', () => {
  it('appelle provisionDomain avec le bon domainId quand la facture porte metadata.nexiora_domain_id', async () => {
    constructEventMock.mockReturnValue({
      type: 'invoice.paid',
      data: { object: { subscription: 'sub_123' } },
    });
    subscriptionsRetrieveMock.mockResolvedValue({
      metadata: { nexiora_domain_id: 'dom-abc' },
      current_period_end: 1735689600,
    });

    const { POST } = await import('../route');
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(provisionDomainMock).toHaveBeenCalledWith('dom-abc');
    const paidUpdate = currentMock.updateCalls.find((u) => u.payload.status === 'paid');
    expect(paidUpdate).toBeDefined();
    expect(paidUpdate!.payload.updated_at).toBeDefined();
    expect(paidUpdate!.eqCalls).toContainEqual(['status', 'pending']);
  });

  it('n\'appelle JAMAIS provisionDomain pour une facture d\'abonnement SANS metadata.nexiora_domain_id (abonnement site, pas domaine)', async () => {
    constructEventMock.mockReturnValue({
      type: 'invoice.paid',
      data: { object: { subscription: 'sub_456' } },
    });
    subscriptionsRetrieveMock.mockResolvedValue({ metadata: {}, current_period_end: null });

    const { POST } = await import('../route');
    await POST(makeRequest());

    expect(provisionDomainMock).not.toHaveBeenCalled();
  });

  it('n\'appelle jamais provisionDomain si la facture n\'a aucun abonnement rattaché', async () => {
    constructEventMock.mockReturnValue({
      type: 'invoice.paid',
      data: { object: { subscription: null } },
    });

    const { POST } = await import('../route');
    await POST(makeRequest());

    expect(subscriptionsRetrieveMock).not.toHaveBeenCalled();
    expect(provisionDomainMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/stripe/webhook — invoice.payment_failed', () => {
  it('marque le domaine failed et n\'appelle jamais provisionDomain', async () => {
    constructEventMock.mockReturnValue({
      type: 'invoice.payment_failed',
      data: { object: { subscription: 'sub_789' } },
    });
    subscriptionsRetrieveMock.mockResolvedValue({ metadata: { nexiora_domain_id: 'dom-xyz' } });

    const { POST } = await import('../route');
    await POST(makeRequest());

    expect(provisionDomainMock).not.toHaveBeenCalled();
    const failedUpdate = currentMock.updateCalls.find((u) => u.payload.status === 'failed');
    expect(failedUpdate).toBeDefined();
    expect(failedUpdate!.eqCalls).toContainEqual(['id', 'dom-xyz']);
  });
});

describe('POST /api/stripe/webhook — signature invalide', () => {
  it('rejette avec 400 et n\'exécute aucune logique métier', async () => {
    constructEventMock.mockImplementation(() => {
      throw new Error('signature invalide');
    });

    const { POST } = await import('../route');
    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    expect(provisionDomainMock).not.toHaveBeenCalled();
  });
});
