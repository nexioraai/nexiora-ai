import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createProviderSubmission } from './submission-service';
import { reportProviderChangeRace } from './observability';
import type { CreateSubmissionResult, SubmissionStatus, SupplierId } from './types';

// ============================================================
// P0-3.7Q-V/Z Phase 13 — Provider Change.
//
// Cette fonction est un alias sémantique explicite de
// createProviderSubmission() : la garde ("échec terminal requis") est
// appliquée par la fonction PostgreSQL sous-jacente (create_provider_submission),
// pas ici — il n'existe qu'UN SEUL mécanisme de création de Submission,
// que ce soit la toute première tentative ou un Provider Change
// (P0-3.7T Partie 7 : "une nouvelle Submission, jamais une mise à jour").
//
// Ne PAS ajouter ici de délai/fenêtre d'attente supplémentaire avant
// d'autoriser un Provider Change (P0-3.7Z Partie 7, démontré : le guard
// existant est suffisant pour ce qu'il peut garantir ; un délai
// supplémentaire ne ferait que réduire une probabilité déjà non
// quantifiable, au prix d'une politique arbitraire).
// ============================================================

export async function getActiveSubmission(
  fulfillmentUnitId: string
): Promise<{ submissionId: string; status: SubmissionStatus; provider: SupplierId } | null> {
  const { data: pointer } = await supabaseAdmin
    .from('fulfillment_unit_active_submission')
    .select('active_submission_id')
    .eq('fulfillment_unit_id', fulfillmentUnitId)
    .maybeSingle();

  if (!pointer) return null;

  const { data: submission } = await supabaseAdmin
    .from('provider_submissions')
    .select('id, status, provider')
    .eq('id', pointer.active_submission_id)
    .maybeSingle();

  if (!submission) return null;
  return { submissionId: submission.id, status: submission.status, provider: submission.provider };
}

export async function requestProviderChange(params: {
  orderId: string;
  newProvider: SupplierId;
  fulfillmentUnitIds: string[];
}): Promise<CreateSubmissionResult> {
  const result = await createProviderSubmission({
    orderId: params.orderId,
    provider: params.newProvider,
    fulfillmentUnitIds: params.fulfillmentUnitIds,
  });

  if (!result.success && result.reason === 'ACTIVE_SUBMISSION_NOT_TERMINAL') {
    await reportProviderChangeRace({
      orderId: params.orderId,
      provider: params.newProvider,
      fulfillmentUnitId: result.fulfillment_unit_id,
      activeSubmissionId: result.active_submission_id,
      activeStatus: result.active_status,
    });
  }

  return result;
}
