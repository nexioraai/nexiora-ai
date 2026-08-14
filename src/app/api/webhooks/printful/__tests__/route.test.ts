import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodeIdempotencyKey } from '@/lib/fulfillment/idempotency-key';

// ============================================================
// P0-3.9.7 Audit #2 — Route webhook Printful. Mocks uniquement, aucun
// appel réseau réel.
// ============================================================

const UNIT_A = '11111111-1111-1111-1111-111111111111';

const processWebhookEventMock = vi.fn();
vi.mock('@/lib/fulfillment/webhook-handler', () => ({
  processWebhookEvent: (...args: unknown[]) => processWebhookEventMock(...args),
}));

import { POST } from '../route';

function makeRequest(body: unknown) {
  return new Request('https://woorri.test/api/webhooks/printful', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  processWebhookEventMock.mockReset();
  delete process.env.PRINTFUL_WEBHOOK_SECRET;
  processWebhookEventMock.mockResolvedValue({ outcome: 'processed', providerOrderRowId: 'row-1', lateWebhook: false, submissionResolved: true });
});

describe('Printful webhook route — payload incomplet', () => {
  it('external_id absent -> ignored:true, processWebhookEvent jamais appelé', async () => {
    const res = await POST(makeRequest({ data: { order: { id: 123 } } }));
    const json = await res.json();
    expect(json).toEqual({ ok: true, ignored: true });
    expect(processWebhookEventMock).not.toHaveBeenCalled();
  });

  it('order.id absent -> ignored:true', async () => {
    const res = await POST(makeRequest({ data: { order: { external_id: encodeIdempotencyKey(UNIT_A) } } }));
    const json = await res.json();
    expect(json).toEqual({ ok: true, ignored: true });
  });

  it('JSON invalide -> 400', async () => {
    const req = new Request('https://woorri.test/api/webhooks/printful', { method: 'POST', body: '{not json' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('Printful webhook route — external_id non décodable', () => {
  it('CONSTAT (identique à Gelato, Audit #2) : decodeIdempotencyKey ne lève pas sur une chaîne malformée non-vide — ce test documente le comportement réel plutôt que de présumer que le catch se déclenche', async () => {
    const res = await POST(makeRequest({ data: { order: { external_id: 'garbage-not-encoded', id: 999 } } }));
    await res.json();
    // Le décodage réussit silencieusement (Buffer.from base64url est
    // permissif) : processWebhookEvent EST appelé avec un fulfillment_unit_id
    // bogus, jamais filtré côté route — protection réelle à la couche DB (FK).
    expect(processWebhookEventMock).toHaveBeenCalledTimes(1);
  });
});

describe('Printful webhook route — cas nominal', () => {
  it('décode external_id, transmet fulfillmentUnitIds: [unit] (granularité 1:1, P0-3.7P)', async () => {
    const res = await POST(makeRequest({ data: { order: { external_id: encodeIdempotencyKey(UNIT_A), id: 555, status: 'fulfilled' } } }));
    const json = await res.json();
    expect(json).toEqual({ ok: true, outcome: 'processed' });
    expect(processWebhookEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'printful',
        fulfillmentUnitIds: [UNIT_A],
        providerOrderId: '555',
        rawStatus: 'fulfilled',
      })
    );
  });
});

describe('Printful webhook route — doublon webhook', () => {
  it('deux requêtes identiques -> processWebhookEvent appelé deux fois (idempotence gérée en aval)', async () => {
    const body = { data: { order: { external_id: encodeIdempotencyKey(UNIT_A), id: 555, status: 'fulfilled' } } };
    await POST(makeRequest(body));
    await POST(makeRequest(body));
    expect(processWebhookEventMock).toHaveBeenCalledTimes(2);
  });
});

describe('Printful webhook route — unknown submission', () => {
  it('reflète unknown_submission tel quel, 200 OK', async () => {
    processWebhookEventMock.mockResolvedValue({ outcome: 'unknown_submission' });
    const res = await POST(makeRequest({ data: { order: { external_id: encodeIdempotencyKey(UNIT_A), id: 555 } } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, outcome: 'unknown_submission' });
  });
});

describe('Printful webhook route — secret partagé', () => {
  it('401 si PRINTFUL_WEBHOOK_SECRET est configuré et absent/incorrect', async () => {
    process.env.PRINTFUL_WEBHOOK_SECRET = 's3cr3t';
    const res = await POST(makeRequest({ data: { order: { external_id: encodeIdempotencyKey(UNIT_A), id: 555 } } }));
    expect(res.status).toBe(401);
    delete process.env.PRINTFUL_WEBHOOK_SECRET;
  });
});
