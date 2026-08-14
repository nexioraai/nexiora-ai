import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock du client Supabase AVANT tout import du module testé — évite de
// toucher un vrai réseau/DB et évite le throw de supabase-admin.ts si
// SUPABASE_SERVICE_ROLE_KEY est absent dans l'environnement de test.
// vi.hoisted() nécessaire : vi.mock() est hoisté au-dessus des imports,
// donc toute variable qu'il référence doit l'être aussi.
const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { rpc: rpcMock, from: fromMock },
}));

import {
  createProviderSubmission,
  claimSubmissionAttempt,
  transitionSubmissionStatus,
  isSubmissionFullyCovered,
  recoverStaleProcessingSubmissions,
} from '../submission-service';

// Chaîne fluent Supabase minimale : .select().eq() résolvant directement
// en liste (comme utilisé par isSubmissionFullyCovered/recoverStaleProcessingSubmissions).
function tableChain(response: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.lt = vi.fn(self);
  chain.limit = vi.fn(async () => response);
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
});

describe('createProviderSubmission', () => {
  it('appelle create_provider_submission avec la clé dérivée correcte (printful = unité)', async () => {
    rpcMock.mockResolvedValue({ data: { success: true, submission_id: 'sub-1' }, error: null });

    const unitId = '22222222-2222-2222-2222-222222222222';
    const result = await createProviderSubmission({
      orderId: '11111111-1111-1111-1111-111111111111',
      provider: 'printful',
      fulfillmentUnitIds: [unitId],
    });

    expect(result.success).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith(
      'create_provider_submission',
      expect.objectContaining({
        p_provider: 'printful',
        p_fulfillment_unit_ids: [unitId],
      })
    );
  });

  it('EMPTY_UNIT_LIST sans appeler le RPC', async () => {
    const result = await createProviderSubmission({ orderId: 'o1', provider: 'gelato', fulfillmentUnitIds: [] });
    expect(result.success).toBe(false);
    expect(result.reason).toBe('EMPTY_UNIT_LIST');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('Attack 1/3/9/10 (P0-3.7T/U/V/Z) : une course détectée côté SQL (CONCURRENT_SUBMISSION_RACE) devient un échec propre, pas un crash', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'CONCURRENT_SUBMISSION_RACE unit=xyz' } });

    const result = await createProviderSubmission({
      orderId: 'o1',
      provider: 'gelato',
      fulfillmentUnitIds: ['u1'],
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('ACTIVE_SUBMISSION_NOT_TERMINAL');
  });

  it('propage une erreur SQL inattendue (pas une race connue) comme une vraie exception', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    await expect(
      createProviderSubmission({ orderId: 'o1', provider: 'gelato', fulfillmentUnitIds: ['u1'] })
    ).rejects.toThrow('connection reset');
  });
});

describe('claimSubmissionAttempt', () => {
  it('retourne success:false si le claim est perdu (retry concurrent, P0-3.7T Partie 16)', async () => {
    rpcMock.mockResolvedValue({ data: { success: false, reason: 'CLAIM_LOST_OR_INVALID_STATE' }, error: null });
    const result = await claimSubmissionAttempt('sub-1');
    expect(result.success).toBe(false);
  });
});

describe('transitionSubmissionStatus', () => {
  it('inclut expectedStatuses dans l\'appel — jamais de réécriture inconditionnelle (P0-3.7Z Partie 4)', async () => {
    rpcMock.mockResolvedValue({ data: { success: true }, error: null });
    await transitionSubmissionStatus('sub-1', 'failed_confirmed', ['uncertain']);
    expect(rpcMock).toHaveBeenCalledWith(
      'transition_submission_status',
      expect.objectContaining({ p_expected_statuses: ['uncertain'], p_new_status: 'failed_confirmed' })
    );
  });
});

describe('isSubmissionFullyCovered — P0-3.9.6 Gap #1, couverture par différence d\'ensembles', () => {
  it('true si chaque fulfillment_unit_id attendu a un provider_order_item correspondant (couverture complète)', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'provider_submission_items') {
        return tableChain({ data: [{ fulfillment_unit_id: 'u1' }, { fulfillment_unit_id: 'u2' }], error: null });
      }
      if (table === 'provider_order_items') {
        return tableChain({ data: [{ fulfillment_unit_id: 'u2' }, { fulfillment_unit_id: 'u1' }], error: null });
      }
      return tableChain({ data: [], error: null });
    });
    expect(await isSubmissionFullyCovered('sub-1')).toBe(true);
  });

  it('false si un connected order/item manque encore (couverture partielle, jamais comptée par nombre de Provider Orders)', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'provider_submission_items') {
        return tableChain({ data: [{ fulfillment_unit_id: 'u1' }, { fulfillment_unit_id: 'u2' }], error: null });
      }
      if (table === 'provider_order_items') {
        return tableChain({ data: [{ fulfillment_unit_id: 'u1' }], error: null }); // u2 manquant
      }
      return tableChain({ data: [], error: null });
    });
    expect(await isSubmissionFullyCovered('sub-1')).toBe(false);
  });

  it('false si provider_order_items est totalement absent (aucune preuve de couverture)', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'provider_submission_items') {
        return tableChain({ data: [{ fulfillment_unit_id: 'u1' }], error: null });
      }
      if (table === 'provider_order_items') {
        return tableChain({ data: [], error: null });
      }
      return tableChain({ data: [], error: null });
    });
    expect(await isSubmissionFullyCovered('sub-1')).toBe(false);
  });

  it('false pour une submission à zéro unité (provider_submission_items vide) — jamais vraie par défaut', async () => {
    fromMock.mockImplementation(() => tableChain({ data: [], error: null }));
    expect(await isSubmissionFullyCovered('sub-empty')).toBe(false);
  });
});

describe('recoverStaleProcessingSubmissions — P0-3.9.6 Gap #2, récupération après crash/abandon worker', () => {
  it('transitionne chaque submission PROCESSING périmée vers UNCERTAIN via la primitive existante (aucune nouvelle Submission, aucun pointeur touché)', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'provider_submissions') {
        return tableChain({ data: [{ id: 'sub-a' }, { id: 'sub-b' }], error: null });
      }
      return tableChain({ data: [], error: null });
    });
    rpcMock.mockResolvedValue({ data: { success: true }, error: null });

    const result = await recoverStaleProcessingSubmissions('2026-01-01T00:00:00.000Z');

    expect(result).toEqual({ recovered: 2, candidates: 2 });
    expect(rpcMock).toHaveBeenCalledWith(
      'transition_submission_status',
      expect.objectContaining({ p_submission_id: 'sub-a', p_new_status: 'uncertain', p_expected_statuses: ['processing'] })
    );
    expect(rpcMock).toHaveBeenCalledWith(
      'transition_submission_status',
      expect.objectContaining({ p_submission_id: 'sub-b', p_new_status: 'uncertain', p_expected_statuses: ['processing'] })
    );
  });

  it('double récupération concurrente (deux workers de reconciliation) : le second appel échoue proprement via la garde conditionnelle existante, sans nouveau verrou (Gap #2D)', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'provider_submissions') {
        return tableChain({ data: [{ id: 'sub-race' }], error: null });
      }
      return tableChain({ data: [], error: null });
    });
    // Simule le RPC réel refusant la transition car un autre worker a déjà
    // fait passer la submission hors de 'processing' entre-temps (P0-3.8B :
    // comportement réellement démontré sous transactions concurrentes).
    rpcMock.mockResolvedValue({ data: { success: false, reason: 'UNEXPECTED_CURRENT_STATUS' }, error: null });

    const result = await recoverStaleProcessingSubmissions('2026-01-01T00:00:00.000Z');

    expect(result).toEqual({ recovered: 0, candidates: 1 });
  });

  it('aucune submission périmée trouvée -> recovered:0, candidates:0, aucun appel RPC', async () => {
    fromMock.mockImplementation(() => tableChain({ data: [], error: null }));

    const result = await recoverStaleProcessingSubmissions('2026-01-01T00:00:00.000Z');

    expect(result).toEqual({ recovered: 0, candidates: 0 });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('P0-3.9.7 Audit #1 — une panne DB (RPC en erreur, pas un simple refus métier) sur UN candidat propage l\'exception sans corrompre le candidat déjà traité ni en simuler un succès', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'provider_submissions') {
        return tableChain({ data: [{ id: 'sub-ok' }, { id: 'sub-db-failure' }], error: null });
      }
      return tableChain({ data: [], error: null });
    });
    // Premier appel RPC (sub-ok) : succès normal. Deuxième appel (sub-db-failure) :
    // une vraie panne DB/réseau au niveau du RPC lui-même (error non-null, pas un
    // simple {success:false} métier) — transitionSubmissionStatus() la propage en
    // exception (comportement existant, inchangé, src/lib/fulfillment/submission-service.ts).
    rpcMock
      .mockResolvedValueOnce({ data: { success: true }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'connection reset' } });

    await expect(recoverStaleProcessingSubmissions('2026-01-01T00:00:00.000Z')).rejects.toThrow(
      'transition_submission_status failed: connection reset'
    );

    // sub-ok a bien été transitionné AVANT la panne — aucune corruption, aucune
    // écriture partielle : chaque appel RPC est une UPDATE atomique indépendante
    // (P0-3.7Z), la panne du deuxième candidat n'affecte jamais le premier.
    expect(rpcMock).toHaveBeenNthCalledWith(
      1,
      'transition_submission_status',
      expect.objectContaining({ p_submission_id: 'sub-ok', p_new_status: 'uncertain', p_expected_statuses: ['processing'] })
    );
    // Propagation de l'exception (pas de swallow silencieux) : le cron appelant
    // (pod-reconciliation/route.ts) capte cette erreur dans son propre try/catch
    // englobant et marque le run comme 'error' via finishCronRun — jamais un faux
    // succès. Le candidat en échec (sub-db-failure) reste 'processing' inchangé :
    // il sera re-sélectionné (même requête idempotente) au prochain passage du cron.
  });

  it('ne cible jamais un état terminal ou UNCERTAIN en entrée — seul PROCESSING est éligible (Gap #2B : create_provider_submission reste bloqué par le guard existant tant que non terminal)', async () => {
    let capturedEq: [string, unknown] | null = null;
    fromMock.mockImplementation((table: string) => {
      if (table === 'provider_submissions') {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = vi.fn(self);
        chain.eq = vi.fn((col: string, val: unknown) => {
          capturedEq = [col, val];
          return chain;
        });
        chain.lt = vi.fn(self);
        chain.limit = vi.fn(async () => ({ data: [], error: null }));
        return chain;
      }
      return tableChain({ data: [], error: null });
    });

    await recoverStaleProcessingSubmissions('2026-01-01T00:00:00.000Z');

    expect(capturedEq).toEqual(['status', 'processing']);
  });
});
