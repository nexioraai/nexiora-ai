import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodeIdempotencyKey } from '../idempotency-key';

const SUBMISSION_ID = 'sub-123';
const ORDER_ID = 'order-abc';
const UNIT_ID = '22222222-2222-2222-2222-222222222222';
const UNIT_ID_2 = '33333333-3333-3333-3333-333333333333';

// Chaîne fluent Supabase minimale pour resolveSubmissionByKey().
function makeMaybeSingleChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => result);
  return chain;
}

const fromMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));

const upsertProviderOrderMock = vi.fn();
const applyProviderOrderStatusMock = vi.fn();
vi.mock('../provider-order-service', () => ({
  upsertProviderOrder: (...args: unknown[]) => upsertProviderOrderMock(...args),
  applyProviderOrderStatus: (...args: unknown[]) => applyProviderOrderStatusMock(...args),
}));

const reportLateWebhookMock = vi.fn();
const reportUnrecognizedMock = vi.fn();
const reportRejectedMock = vi.fn();
const reportUnknownWebhookSubmissionMock = vi.fn();
vi.mock('../observability', () => ({
  reportLateWebhook: (...args: unknown[]) => reportLateWebhookMock(...args),
  reportUnrecognizedProviderStatus: (...args: unknown[]) => reportUnrecognizedMock(...args),
  reportRejectedTransition: (...args: unknown[]) => reportRejectedMock(...args),
  reportUnknownWebhookSubmission: (...args: unknown[]) => reportUnknownWebhookSubmissionMock(...args),
}));

const isSubmissionFullyCoveredMock = vi.fn();
const transitionSubmissionStatusMock = vi.fn();
vi.mock('../submission-service', () => ({
  isSubmissionFullyCovered: (...args: unknown[]) => isSubmissionFullyCoveredMock(...args),
  transitionSubmissionStatus: (...args: unknown[]) => transitionSubmissionStatusMock(...args),
}));

import { processWebhookEvent } from '../webhook-handler';

function baseUpsertResult(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    provider_order_row_id: 'row-1',
    was_new: true,
    late_webhook: false,
    late_units: [],
    ...overrides,
  };
}

beforeEach(() => {
  fromMock.mockReset();
  upsertProviderOrderMock.mockReset();
  applyProviderOrderStatusMock.mockReset();
  reportLateWebhookMock.mockReset();
  reportUnrecognizedMock.mockReset();
  reportRejectedMock.mockReset();
  reportUnknownWebhookSubmissionMock.mockReset();
  isSubmissionFullyCoveredMock.mockReset();
  transitionSubmissionStatusMock.mockReset();

  fromMock.mockReturnValue(
    makeMaybeSingleChain({ data: { id: SUBMISSION_ID, order_id: ORDER_ID }, error: null })
  );
  isSubmissionFullyCoveredMock.mockResolvedValue(false);
  transitionSubmissionStatusMock.mockResolvedValue({ success: true });
});

describe('processWebhookEvent — résolution et clé inconnue', () => {
  it('unknown_submission si la clé ne correspond à aucune submission, et journalise l\'anomalie (Gap #1E)', async () => {
    fromMock.mockReturnValue(makeMaybeSingleChain({ data: null, error: null }));
    const outcome = await processWebhookEvent({
      provider: 'printful',
      submissionKeyRaw: encodeIdempotencyKey(UNIT_ID),
      fulfillmentUnitIds: [UNIT_ID],
      providerOrderId: 'p-1',
      rawStatus: 'fulfilled',
      rawPayload: {},
    });
    expect(outcome.outcome).toBe('unknown_submission');
    expect(reportUnknownWebhookSubmissionMock).toHaveBeenCalledTimes(1);
    expect(reportUnknownWebhookSubmissionMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'printful', providerOrderId: 'p-1' })
    );
  });

  it('unknown_submission si fulfillmentUnitIds est vide — jamais deviné, résolution même pas tentée', async () => {
    const outcome = await processWebhookEvent({
      provider: 'gelato',
      submissionKeyRaw: 'ref-abc',
      fulfillmentUnitIds: [],
      providerOrderId: 'p-2',
      rawStatus: 'shipped',
      rawPayload: {},
    });
    expect(outcome.outcome).toBe('unknown_submission');
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('processWebhookEvent — Attack 9 : duplicate webhook (P0-3.7Z)', () => {
  it('deux traitements identiques restent success, idempotence gérée par upsert_provider_order (UNIQUE constraint)', async () => {
    upsertProviderOrderMock.mockResolvedValue(baseUpsertResult());

    const input = {
      provider: 'printful' as const,
      submissionKeyRaw: encodeIdempotencyKey(UNIT_ID),
      fulfillmentUnitIds: [UNIT_ID],
      providerOrderId: 'p-1',
      rawStatus: 'inprocess',
      rawPayload: {},
    };

    const first = await processWebhookEvent(input);
    upsertProviderOrderMock.mockResolvedValue(baseUpsertResult({ was_new: false }));
    applyProviderOrderStatusMock.mockResolvedValue({ success: true, from_status: 'processing', to_status: 'processing' });
    const second = await processWebhookEvent(input);

    expect(first.outcome).toBe('processed');
    expect(second.outcome).toBe('processed');
  });
});

describe('processWebhookEvent — Attack 3 : late webhook (P0-3.7Z, invariant central)', () => {
  it('signale via reportLateWebhook sans jamais faire échouer le traitement, et NE tente PAS la transition de couverture (Gap #1 : jamais sur une submission qui n\'est plus active)', async () => {
    upsertProviderOrderMock.mockResolvedValue(baseUpsertResult({ late_webhook: true, late_units: [UNIT_ID] }));

    const outcome = await processWebhookEvent({
      provider: 'printful',
      submissionKeyRaw: encodeIdempotencyKey(UNIT_ID),
      fulfillmentUnitIds: [UNIT_ID],
      providerOrderId: 'p-1',
      rawStatus: 'inprocess',
      rawPayload: {},
    });

    expect(outcome.outcome).toBe('processed');
    expect(reportLateWebhookMock).toHaveBeenCalledTimes(1);
    expect(isSubmissionFullyCoveredMock).not.toHaveBeenCalled();
    expect(transitionSubmissionStatusMock).not.toHaveBeenCalled();
  });
});

describe('processWebhookEvent — Attack 6 : statut inconnu (P0-3.7W/X)', () => {
  it('signale via reportUnrecognizedProviderStatus, ne bloque pas le traitement', async () => {
    upsertProviderOrderMock.mockResolvedValue(baseUpsertResult());

    const outcome = await processWebhookEvent({
      provider: 'printful',
      submissionKeyRaw: encodeIdempotencyKey(UNIT_ID),
      fulfillmentUnitIds: [UNIT_ID],
      providerOrderId: 'p-1',
      rawStatus: 'totally_unknown_status',
      rawPayload: {},
    });

    expect(outcome.outcome).toBe('processed');
    expect(reportUnrecognizedMock).toHaveBeenCalledTimes(1);
  });
});

describe('processWebhookEvent — Attack 5 : régression rejetée sur événement de suivi', () => {
  it('applique la garde catégorielle quand la ligne existe déjà (was_new=false)', async () => {
    upsertProviderOrderMock.mockResolvedValue(baseUpsertResult({ was_new: false }));
    applyProviderOrderStatusMock.mockResolvedValue({
      success: false,
      reason: 'TRANSITION_REJECTED',
      from_status: 'delivered',
      to_status: 'shipped',
    });

    const outcome = await processWebhookEvent({
      provider: 'printful',
      submissionKeyRaw: encodeIdempotencyKey(UNIT_ID),
      fulfillmentUnitIds: [UNIT_ID],
      providerOrderId: 'p-1',
      rawStatus: 'partial', // -> shipped
      rawPayload: {},
    });

    expect(outcome.outcome).toBe('transition_rejected');
    expect(reportRejectedMock).toHaveBeenCalledTimes(1);
    expect(isSubmissionFullyCoveredMock).not.toHaveBeenCalled();
  });
});

describe('processWebhookEvent — P0-3.9.6 Gap #1 : fermeture de boucle sur couverture complète', () => {
  it('couverture complète (provider_submission_items MINUS provider_order_items = ∅) -> transitionSubmissionStatus(success, [processing, uncertain])', async () => {
    upsertProviderOrderMock.mockResolvedValue(baseUpsertResult());
    isSubmissionFullyCoveredMock.mockResolvedValue(true);

    const outcome = await processWebhookEvent({
      provider: 'gelato',
      submissionKeyRaw: 'ref-abc',
      fulfillmentUnitIds: [UNIT_ID, UNIT_ID_2],
      providerOrderId: 'gl-order-1',
      rawStatus: 'delivered',
      rawPayload: {},
    });

    expect(outcome.outcome).toBe('processed');
    expect(isSubmissionFullyCoveredMock).toHaveBeenCalledWith(SUBMISSION_ID);
    expect(transitionSubmissionStatusMock).toHaveBeenCalledWith(SUBMISSION_ID, 'success', ['processing', 'uncertain']);
  });

  it('couverture partielle (connected orders manquants) -> transitionSubmissionStatus jamais appelé, Submission reste en l\'état', async () => {
    upsertProviderOrderMock.mockResolvedValue(baseUpsertResult());
    isSubmissionFullyCoveredMock.mockResolvedValue(false);

    const outcome = await processWebhookEvent({
      provider: 'gelato',
      submissionKeyRaw: 'ref-abc',
      fulfillmentUnitIds: [UNIT_ID],
      providerOrderId: 'gl-order-1',
      rawStatus: 'shipped',
      rawPayload: {},
    });

    expect(outcome.outcome).toBe('processed');
    expect(isSubmissionFullyCoveredMock).toHaveBeenCalledWith(SUBMISSION_ID);
    expect(transitionSubmissionStatusMock).not.toHaveBeenCalled();
  });

  it('immutabilité terminale : même si isSubmissionFullyCovered=true, une Submission déjà terminale n\'est jamais rouverte — la garde RPC réelle refuse silencieusement (expected_statuses ne contient jamais un état terminal)', async () => {
    upsertProviderOrderMock.mockResolvedValue(baseUpsertResult());
    isSubmissionFullyCoveredMock.mockResolvedValue(true);
    // Simule le comportement réel de la garde conditionnelle RPC sur une
    // submission déjà success/failed_* : refus propre, pas une exception.
    transitionSubmissionStatusMock.mockResolvedValue({ success: false, reason: 'UNEXPECTED_CURRENT_STATUS' });

    const outcome = await processWebhookEvent({
      provider: 'printful',
      submissionKeyRaw: encodeIdempotencyKey(UNIT_ID),
      fulfillmentUnitIds: [UNIT_ID],
      providerOrderId: 'p-1',
      rawStatus: 'delivered',
      rawPayload: {},
    });

    expect(outcome.outcome).toBe('processed'); // pas de crash, comportement sûr
    const call = transitionSubmissionStatusMock.mock.calls[0];
    expect((call[2] as string[])).not.toContain('success');
    expect((call[2] as string[])).not.toContain('failed_confirmed');
    expect((call[2] as string[])).not.toContain('failed_permanent');
  });

  it('webhook Gelato avec plusieurs fulfillmentUnitIds (Gap #1A, enrichissement GET order) résout correctement la même Submission order-level', async () => {
    upsertProviderOrderMock.mockResolvedValue(baseUpsertResult());
    isSubmissionFullyCoveredMock.mockResolvedValue(true);

    await processWebhookEvent({
      provider: 'gelato',
      submissionKeyRaw: 'ref-abc',
      fulfillmentUnitIds: [UNIT_ID, UNIT_ID_2],
      providerOrderId: 'gl-order-2',
      rawStatus: 'delivered',
      rawPayload: {},
    });

    expect(upsertProviderOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ fulfillmentUnitIds: [UNIT_ID, UNIT_ID_2] })
    );
  });
});
