import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodeIdempotencyKey } from '@/lib/fulfillment/idempotency-key';

// ============================================================
// P0-3.9.7 Audit #2, puis LOT I (F-I-1) -- Route webhook Printful. Mocks
// uniquement, aucun appel réseau réel.
//
// LOT I : l'authentification par secret est désormais fail-closed
// (webhook-auth.ts) -- PRINTFUL_WEBHOOK_SECRET est TOUJOURS défini dans
// beforeEach et TOUTES les requêtes de ce fichier (hors bloc dédié
// "authentification") portent l'en-tête X-Webhook-Secret correspondant,
// pour continuer à exercer le comportement métier sans re-tester l'auth à
// chaque cas.
// ============================================================

const UNIT_A = '11111111-1111-1111-1111-111111111111';
const SECRET = 'test-printful-secret';

const processWebhookEventMock = vi.fn();
vi.mock('@/lib/fulfillment/webhook-handler', () => ({
  processWebhookEvent: (...args: unknown[]) => processWebhookEventMock(...args),
}));

const lookupPrintfulOrderByExternalIdMock = vi.fn();
vi.mock('@/lib/fulfillment/provider-lookup', () => ({
  lookupPrintfulOrderByExternalId: (...args: unknown[]) => lookupPrintfulOrderByExternalIdMock(...args),
}));

const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({
  logAnomaly: (...args: unknown[]) => logAnomalyMock(...args),
}));

import { POST } from '../route';

function makeRequest(body: unknown, opts: { secret?: string | null; useQuery?: boolean } = {}) {
  const { secret = SECRET, useQuery = false } = opts;
  const url = useQuery && secret
    ? `https://woorri.test/api/webhooks/printful?secret=${encodeURIComponent(secret)}`
    : 'https://woorri.test/api/webhooks/printful';
  const headers: Record<string, string> = {};
  if (secret && !useQuery) headers['x-webhook-secret'] = secret;
  return new Request(url, { method: 'POST', headers, body: JSON.stringify(body) });
}

beforeEach(() => {
  processWebhookEventMock.mockReset();
  lookupPrintfulOrderByExternalIdMock.mockReset();
  logAnomalyMock.mockReset().mockResolvedValue(undefined);
  process.env.PRINTFUL_WEBHOOK_SECRET = SECRET;
  // Token absent par défaut : la vérification croisée (lookup) est alors
  // sautée, comportement identique à avant ce lot pour les cas qui ne
  // testent pas explicitement le lookup -- évite de devoir mocker le
  // lookup dans chaque test hérité de l'audit précédent.
  delete process.env.PRINTFUL_API_TOKEN;
  processWebhookEventMock.mockResolvedValue({ outcome: 'processed', providerOrderRowId: 'row-1', lateWebhook: false, submissionResolved: true });
});

describe('Printful webhook route — authentification (LOT I, F-I-1)', () => {
  it('fail-closed : PRINTFUL_WEBHOOK_SECRET absent -> 401 même avec un secret fourni côté requête', async () => {
    delete process.env.PRINTFUL_WEBHOOK_SECRET;
    const res = await POST(makeRequest({ data: { order: { external_id: encodeIdempotencyKey(UNIT_A), id: 555 } } }));
    expect(res.status).toBe(401);
    expect(processWebhookEventMock).not.toHaveBeenCalled();
  });

  it('secret absent de la requête -> 401', async () => {
    const res = await POST(makeRequest({ data: { order: { external_id: encodeIdempotencyKey(UNIT_A), id: 555 } } }, { secret: null }));
    expect(res.status).toBe(401);
  });

  it('secret incorrect (en-tête) -> 401', async () => {
    const res = await POST(makeRequest({ data: { order: { external_id: encodeIdempotencyKey(UNIT_A), id: 555 } } }, { secret: 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('secret correct via en-tête X-Webhook-Secret -> 200', async () => {
    const res = await POST(makeRequest({ data: { order: { external_id: encodeIdempotencyKey(UNIT_A), id: 555, status: 'fulfilled' } } }));
    expect(res.status).toBe(200);
  });

  it('secret correct via ?secret= en repli (rétro-compatibilité dashboard déjà configuré) -> 200', async () => {
    const res = await POST(makeRequest({ data: { order: { external_id: encodeIdempotencyKey(UNIT_A), id: 555, status: 'fulfilled' } } }, { useQuery: true }));
    expect(res.status).toBe(200);
  });
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
    const req = new Request('https://woorri.test/api/webhooks/printful', {
      method: 'POST',
      headers: { 'x-webhook-secret': SECRET },
      body: '{not json',
    });
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

describe('Printful webhook route — vérification croisée API (LOT I, F-I-1)', () => {
  beforeEach(() => {
    process.env.PRINTFUL_API_TOKEN = 'fake-token';
  });

  it('lookup confirme found:true + même statut -> aucune anomalie, statut du webhook conservé', async () => {
    lookupPrintfulOrderByExternalIdMock.mockResolvedValue({ found: true, providerOrderId: '555', rawStatus: 'fulfilled', raw: {} });
    const res = await POST(makeRequest({ data: { order: { external_id: encodeIdempotencyKey(UNIT_A), id: 555, status: 'fulfilled' } } }));
    await res.json();
    expect(processWebhookEventMock).toHaveBeenCalledWith(expect.objectContaining({ rawStatus: 'fulfilled' }));
    expect(logAnomalyMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'printful_webhook_status_mismatch' }));
  });

  it('lookup confirme found:true mais statut DIFFÉRENT du corps -> le statut authentifié (API) prime, anomalie journalisée', async () => {
    lookupPrintfulOrderByExternalIdMock.mockResolvedValue({ found: true, providerOrderId: '555', rawStatus: 'canceled', raw: {} });
    const res = await POST(makeRequest({ data: { order: { external_id: encodeIdempotencyKey(UNIT_A), id: 555, status: 'fulfilled' } } }));
    await res.json();
    expect(processWebhookEventMock).toHaveBeenCalledWith(expect.objectContaining({ rawStatus: 'canceled' }));
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'printful_webhook_status_mismatch',
      details: expect.objectContaining({ webhookStatus: 'fulfilled', apiStatus: 'canceled' }),
    }));
  });

  it("lookup confirme found:false -> NE bloque PAS le traitement (endpoint [NON DÉMONTRÉ] : un faux négatif casserait tout le trafic Printful réel), anomalie journalisée, statut du corps conservé", async () => {
    lookupPrintfulOrderByExternalIdMock.mockResolvedValue({ found: false });
    const res = await POST(makeRequest({ data: { order: { external_id: encodeIdempotencyKey(UNIT_A), id: 555, status: 'fulfilled' } } }));
    const json = await res.json();
    expect(json).toEqual({ ok: true, outcome: 'processed' });
    expect(processWebhookEventMock).toHaveBeenCalledWith(expect.objectContaining({ rawStatus: 'fulfilled' }));
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'printful_webhook_order_not_found' }));
  });

  it('lookup échoue (endpoint [NON DÉMONTRÉ], timeout/5xx) -> repli sur le statut du corps, jamais de blocage, anomalie journalisée', async () => {
    lookupPrintfulOrderByExternalIdMock.mockRejectedValue(new Error('Printful lookup 500: internal error'));
    const res = await POST(makeRequest({ data: { order: { external_id: encodeIdempotencyKey(UNIT_A), id: 555, status: 'fulfilled' } } }));
    const json = await res.json();
    expect(json).toEqual({ ok: true, outcome: 'processed' });
    expect(processWebhookEventMock).toHaveBeenCalledWith(expect.objectContaining({ rawStatus: 'fulfilled' }));
    expect(logAnomalyMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'printful_webhook_lookup_unavailable' }));
  });

  it('PRINTFUL_API_TOKEN absent -> lookup jamais tenté, comportement historique (statut du corps utilisé tel quel)', async () => {
    delete process.env.PRINTFUL_API_TOKEN;
    const res = await POST(makeRequest({ data: { order: { external_id: encodeIdempotencyKey(UNIT_A), id: 555, status: 'fulfilled' } } }));
    await res.json();
    expect(lookupPrintfulOrderByExternalIdMock).not.toHaveBeenCalled();
    expect(processWebhookEventMock).toHaveBeenCalledWith(expect.objectContaining({ rawStatus: 'fulfilled' }));
  });
});
