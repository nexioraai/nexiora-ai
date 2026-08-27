import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodeIdempotencyKey } from '@/lib/fulfillment/idempotency-key';

// ============================================================
// P0-3.9.7 Audit #2, puis LOT I (F-I-1) — Route webhook Gelato. Mocks
// uniquement, AUCUN appel réseau réel (getGelatoOrderById et
// processWebhookEvent sont tous deux mockés). Couvre les 11 cas listés
// dans l'audit de clôture P0-3.9.7 + les cas d'authentification LOT I.
//
// LOT I : l'authentification par secret est désormais fail-closed
// (webhook-auth.ts) -- GELATO_WEBHOOK_SECRET est TOUJOURS défini dans
// beforeEach et TOUTES les requêtes de ce fichier (hors bloc dédié
// "authentification") portent l'en-tête X-Webhook-Secret correspondant.
// ============================================================

const UNIT_A = '11111111-1111-1111-1111-111111111111';
const UNIT_B = '22222222-2222-2222-2222-222222222222';
const SECRET = 'test-gelato-secret';

const processWebhookEventMock = vi.fn();
vi.mock('@/lib/fulfillment/webhook-handler', () => ({
  processWebhookEvent: (...args: unknown[]) => processWebhookEventMock(...args),
}));

const getGelatoOrderByIdMock = vi.fn();
vi.mock('@/lib/fulfillment/provider-lookup', () => ({
  getGelatoOrderById: (...args: unknown[]) => getGelatoOrderByIdMock(...args),
}));

const reportReconciliationConflictMock = vi.fn();
vi.mock('@/lib/fulfillment/observability', () => ({
  reportReconciliationConflict: (...args: unknown[]) => reportReconciliationConflictMock(...args),
}));

import { POST } from '../route';

function makeRequest(body: unknown, opts: { secret?: string | null; useQuery?: boolean } = {}) {
  const { secret = SECRET, useQuery = false } = opts;
  const url = useQuery && secret
    ? `https://woorri.test/api/webhooks/gelato?secret=${encodeURIComponent(secret)}`
    : 'https://woorri.test/api/webhooks/gelato';
  const headers: Record<string, string> = {};
  if (secret && !useQuery) headers['x-webhook-secret'] = secret;
  return new Request(url, { method: 'POST', headers, body: JSON.stringify(body) });
}

beforeEach(() => {
  processWebhookEventMock.mockReset();
  getGelatoOrderByIdMock.mockReset();
  reportReconciliationConflictMock.mockReset();
  process.env.GELATO_WEBHOOK_SECRET = SECRET;
  processWebhookEventMock.mockResolvedValue({ outcome: 'processed', providerOrderRowId: 'row-1', lateWebhook: false, submissionResolved: true });
});

describe('Gelato webhook route — cas 1 : orderReferenceId absent', () => {
  it('ignored:true, aucun GET order, aucun processWebhookEvent', async () => {
    const res = await POST(makeRequest({ orderId: 'gl-order-1' }));
    const json = await res.json();
    expect(json).toEqual({ ok: true, ignored: true });
    expect(getGelatoOrderByIdMock).not.toHaveBeenCalled();
    expect(processWebhookEventMock).not.toHaveBeenCalled();
  });
});

describe('Gelato webhook route — cas 2 : orderId absent', () => {
  it('ignored:true (id de repli absent aussi)', async () => {
    const res = await POST(makeRequest({ orderReferenceId: 'ref-abc' }));
    const json = await res.json();
    expect(json).toEqual({ ok: true, ignored: true });
    expect(getGelatoOrderByIdMock).not.toHaveBeenCalled();
  });

  it('accepte body.id comme repli si orderId absent', async () => {
    getGelatoOrderByIdMock.mockResolvedValue({
      found: true,
      items: [{ itemReferenceId: encodeIdempotencyKey(UNIT_A) }],
      fulfillmentStatus: 'shipped',
      raw: {},
    });
    const res = await POST(makeRequest({ orderReferenceId: 'ref-abc', id: 'gl-order-fallback' }));
    await res.json();
    expect(getGelatoOrderByIdMock).toHaveBeenCalledWith('gl-order-fallback', expect.any(String));
  });
});

describe('Gelato webhook route — cas 3 : GET order 404 (found:false)', () => {
  it('ignored:true, processWebhookEvent jamais appelé, aucune anomalie (404 n\'est pas une erreur)', async () => {
    getGelatoOrderByIdMock.mockResolvedValue({ found: false });
    const res = await POST(makeRequest({ orderReferenceId: 'ref-abc', orderId: 'gl-1' }));
    const json = await res.json();
    expect(json).toEqual({ ok: true, ignored: true });
    expect(processWebhookEventMock).not.toHaveBeenCalled();
    expect(reportReconciliationConflictMock).not.toHaveBeenCalled();
  });
});

describe('Gelato webhook route — cas 4 : GET order 500 (throw)', () => {
  it('enrichment_failed:true, anomalie journalisée, processWebhookEvent JAMAIS appelé (Gap #1A : jamais de succès inventé)', async () => {
    getGelatoOrderByIdMock.mockRejectedValue(new Error('Gelato getOrder 500: internal error'));
    const res = await POST(makeRequest({ orderReferenceId: 'ref-abc', orderId: 'gl-1' }));
    const json = await res.json();
    expect(json).toEqual({ ok: true, enrichment_failed: true });
    expect(processWebhookEventMock).not.toHaveBeenCalled();
    expect(reportReconciliationConflictMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'gelato', submissionId: 'ref-abc' })
    );
  });
});

describe('Gelato webhook route — cas 5 : GET order sans items exploitables', () => {
  it('found:true mais items:[] -> ignored:true, processWebhookEvent jamais appelé', async () => {
    getGelatoOrderByIdMock.mockResolvedValue({ found: true, items: [], fulfillmentStatus: 'pending', raw: {} });
    const res = await POST(makeRequest({ orderReferenceId: 'ref-abc', orderId: 'gl-1' }));
    const json = await res.json();
    expect(json).toEqual({ ok: true, ignored: true });
    expect(processWebhookEventMock).not.toHaveBeenCalled();
  });

  it('items undefined -> ignored:true (pas de crash)', async () => {
    getGelatoOrderByIdMock.mockResolvedValue({ found: true, fulfillmentStatus: 'pending', raw: {} });
    const res = await POST(makeRequest({ orderReferenceId: 'ref-abc', orderId: 'gl-1' }));
    const json = await res.json();
    expect(json).toEqual({ ok: true, ignored: true });
  });
});

describe('Gelato webhook route — cas 6 : itemReferenceId non exploitable', () => {
  it('P0-3.9.7 CONSTAT : decodeIdempotencyKey (Buffer.from base64url) ne lève JAMAIS sur une chaîne non-vide malformée — le try/catch de la route est mort pour ce cas précis. La protection réelle contre un itemReferenceId invalide vit à la couche DB (FK provider_order_items_intent_fk, P0-3.7V), pas dans cette route. Documenté ici tel quel, non corrigé (comportement hérité, identique côté Printful, hors périmètre des 3 gaps).', async () => {
    getGelatoOrderByIdMock.mockResolvedValue({
      found: true,
      items: [{ itemReferenceId: 'not-a-valid-encoded-uuid!!!' }],
      fulfillmentStatus: 'shipped',
      raw: {},
    });
    const res = await POST(makeRequest({ orderReferenceId: 'ref-abc', orderId: 'gl-1' }));
    await res.json();
    // Le décodage ne lève pas : la requête PROCÈDE avec un fulfillment_unit_id
    // syntaxiquement UUID mais sémantiquement bogus — processWebhookEvent EST
    // appelé (contrairement à ce qu'un lecteur pourrait déduire du try/catch).
    expect(processWebhookEventMock).toHaveBeenCalledTimes(1);
    expect((processWebhookEventMock.mock.calls[0][0] as { fulfillmentUnitIds: string[] }).fulfillmentUnitIds).toHaveLength(1);
  });
});

describe('Gelato webhook route — cas 7 : plusieurs items (granularité order-level)', () => {
  it('décode chaque itemReferenceId, transmet fulfillmentUnitIds complet à processWebhookEvent', async () => {
    getGelatoOrderByIdMock.mockResolvedValue({
      found: true,
      items: [{ itemReferenceId: encodeIdempotencyKey(UNIT_A) }, { itemReferenceId: encodeIdempotencyKey(UNIT_B) }],
      fulfillmentStatus: 'delivered',
      raw: {},
    });
    const res = await POST(makeRequest({ orderReferenceId: 'ref-abc', orderId: 'gl-1' }));
    await res.json();
    expect(processWebhookEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ fulfillmentUnitIds: [UNIT_A, UNIT_B], provider: 'gelato', submissionKeyRaw: 'ref-abc' })
    );
  });
});

describe('Gelato webhook route — cas 8 : doublon webhook', () => {
  it('deux requêtes identiques appellent processWebhookEvent deux fois — idempotence gérée en aval (UNIQUE DB), pas par la route elle-même', async () => {
    getGelatoOrderByIdMock.mockResolvedValue({
      found: true,
      items: [{ itemReferenceId: encodeIdempotencyKey(UNIT_A) }],
      fulfillmentStatus: 'shipped',
      raw: {},
    });
    const body = { orderReferenceId: 'ref-abc', orderId: 'gl-1' };
    await POST(makeRequest(body));
    await POST(makeRequest(body));
    expect(processWebhookEventMock).toHaveBeenCalledTimes(2);
  });
});

describe('Gelato webhook route — cas 9 : unknown submission', () => {
  it('processWebhookEvent renvoie unknown_submission -> la route le reflète tel quel, 200 OK', async () => {
    getGelatoOrderByIdMock.mockResolvedValue({
      found: true,
      items: [{ itemReferenceId: encodeIdempotencyKey(UNIT_A) }],
      fulfillmentStatus: 'shipped',
      raw: {},
    });
    processWebhookEventMock.mockResolvedValue({ outcome: 'unknown_submission' });
    const res = await POST(makeRequest({ orderReferenceId: 'ref-inconnue', orderId: 'gl-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, outcome: 'unknown_submission' });
  });
});

describe('Gelato webhook route — cas 10 : late webhook', () => {
  it('processWebhookEvent renvoie processed avec lateWebhook:true — la route retourne outcome:processed (le détail late_webhook est interne à processWebhookEvent/reportLateWebhook, pas ré-exposé par la route)', async () => {
    getGelatoOrderByIdMock.mockResolvedValue({
      found: true,
      items: [{ itemReferenceId: encodeIdempotencyKey(UNIT_A) }],
      fulfillmentStatus: 'shipped',
      raw: {},
    });
    processWebhookEventMock.mockResolvedValue({ outcome: 'processed', providerOrderRowId: 'row-x', lateWebhook: true, submissionResolved: true });
    const res = await POST(makeRequest({ orderReferenceId: 'ref-abc', orderId: 'gl-1' }));
    const json = await res.json();
    expect(json).toEqual({ ok: true, outcome: 'processed' });
  });
});

describe('Gelato webhook route — cas 11 : Submission terminale', () => {
  it('processWebhookEvent gère l\'immutabilité en interne (transitionSubmissionStatus refusé silencieusement) — la route reçoit quand même outcome:processed, aucune erreur ne remonte', async () => {
    getGelatoOrderByIdMock.mockResolvedValue({
      found: true,
      items: [{ itemReferenceId: encodeIdempotencyKey(UNIT_A) }],
      fulfillmentStatus: 'delivered',
      raw: {},
    });
    processWebhookEventMock.mockResolvedValue({ outcome: 'processed', providerOrderRowId: 'row-y', lateWebhook: false, submissionResolved: true });
    const res = await POST(makeRequest({ orderReferenceId: 'ref-abc', orderId: 'gl-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.outcome).toBe('processed');
  });
});

describe('Gelato webhook route — authentification (LOT I, F-I-1)', () => {
  it('fail-closed : GELATO_WEBHOOK_SECRET absent -> 401 même avec un secret fourni côté requête', async () => {
    delete process.env.GELATO_WEBHOOK_SECRET;
    const res = await POST(makeRequest({ orderReferenceId: 'ref-abc', orderId: 'gl-1' }));
    expect(res.status).toBe(401);
    expect(getGelatoOrderByIdMock).not.toHaveBeenCalled();
  });

  it('secret absent de la requête -> 401', async () => {
    const res = await POST(makeRequest({ orderReferenceId: 'ref-abc', orderId: 'gl-1' }, { secret: null }));
    expect(res.status).toBe(401);
  });

  it('secret incorrect (en-tête) -> 401', async () => {
    const res = await POST(makeRequest({ orderReferenceId: 'ref-abc', orderId: 'gl-1' }, { secret: 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('secret correct via en-tête X-Webhook-Secret -> 200', async () => {
    getGelatoOrderByIdMock.mockResolvedValue({ found: true, items: [{ itemReferenceId: encodeIdempotencyKey(UNIT_A) }], fulfillmentStatus: 'shipped', raw: {} });
    const res = await POST(makeRequest({ orderReferenceId: 'ref-abc', orderId: 'gl-1' }));
    expect(res.status).toBe(200);
  });

  it('secret correct via ?secret= en repli (rétro-compatibilité dashboard déjà configuré) -> 200', async () => {
    getGelatoOrderByIdMock.mockResolvedValue({ found: true, items: [{ itemReferenceId: encodeIdempotencyKey(UNIT_A) }], fulfillmentStatus: 'shipped', raw: {} });
    const res = await POST(makeRequest({ orderReferenceId: 'ref-abc', orderId: 'gl-1' }, { useQuery: true }));
    expect(res.status).toBe(200);
  });
});
