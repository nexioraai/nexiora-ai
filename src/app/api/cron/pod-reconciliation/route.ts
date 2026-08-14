import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { startCronRun, finishCronRun } from '@/lib/cron-tracker';
import {
  claimSubmissionAttempt,
  transitionSubmissionStatus,
  recoverStaleProcessingSubmissions,
} from '@/lib/fulfillment/submission-service';
import { upsertProviderOrder } from '@/lib/fulfillment/provider-order-service';
import { lookupPrintfulOrderByExternalId, lookupGelatoOrderByReferenceId } from '@/lib/fulfillment/provider-lookup';
import { reportReconciliationConflict } from '@/lib/fulfillment/observability';

export const maxDuration = 300;

// Age minimal avant de considerer une submission UNCERTAIN eligible a la
// reconciliation — laisse une marge au traitement asynchrone eventuel du
// fournisseur (P0-3.7Z Partie 1) avant de conclure a une absence.
const MIN_AGE_MS = 15 * 60 * 1000;

// P0-3.9.6 Gap #2A — aucun timeout HTTP n'est configure sur les appels
// adaptateur (verifie : aucun AbortController/signal dans pfFetch/glFetch).
// Ce seuil est donc une politique operationnelle explicitement documentee,
// PAS une valeur derivee d'un timeout provider prouve. Volontairement
// inferieur a MIN_AGE_MS pour qu'une submission "processing" bloquee soit
// deja "uncertain" (et donc deja plus vieille que MIN_AGE_MS) au moment ou
// un futur passage du cron la considere eligible a la reconciliation.
const STALE_PROCESSING_MS = 10 * 60 * 1000;

/**
 * P0-3.7 Phase 14 — Reconciliation POD (Printful/Gelato). Pattern identique
 * a cj-tracking (src/app/api/cron/cj-tracking/route.ts, jamais modifie) :
 * CRON_SECRET, startCronRun/finishCronRun, traitement par lot.
 *
 * Ne cree JAMAIS automatiquement une nouvelle Submission — seule la
 * transition UNCERTAIN -> SUCCESS | FAILED_CONFIRMED de la submission
 * EXISTANTE est automatique (P0-3.7C/Q : la regle "jamais automatique"
 * concerne le Provider Change / la creation d'une nouvelle Submission,
 * pas la conclusion de reconciliation elle-meme).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = await startCronRun('pod-reconciliation');
  let checked = 0;
  let resolved = 0;
  let stillUncertain = 0;
  let recoveredStaleProcessing = 0;

  try {
    // P0-3.9.6 Gap #2 — recupere les submissions bloquees en PROCESSING
    // (crash/abandon de worker, jamais detecte auparavant : le cron ne
    // regardait que 'uncertain'). Ne cree jamais de nouvelle Submission,
    // ne modifie pas le pointeur actif, reutilise la primitive de
    // transition deja existante — meme garantie d'atomicite que partout
    // ailleurs (P0-3.8B).
    const staleProcessingCutoff = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
    const staleResult = await recoverStaleProcessingSubmissions(staleProcessingCutoff);
    recoveredStaleProcessing = staleResult.recovered;

    const cutoff = new Date(Date.now() - MIN_AGE_MS).toISOString();
    const { data: submissions } = await supabaseAdmin
      .from('provider_submissions')
      .select('id, order_id, provider, idempotency_key, updated_at')
      .in('status', ['uncertain'])
      .lt('updated_at', cutoff)
      .limit(200);

    if (!submissions || submissions.length === 0) {
      await finishCronRun(runId, { itemsProcessed: recoveredStaleProcessing });
      return NextResponse.json({ done: true, checked: 0, resolved: 0, recoveredStaleProcessing });
    }

    for (const submission of submissions) {
      checked++;
      const claim = await claimSubmissionAttempt(submission.id);
      if (!claim.success) continue; // un autre worker a deja pris cette submission

      try {
        const { data: items } = await supabaseAdmin
          .from('provider_submission_items')
          .select('fulfillment_unit_id')
          .eq('submission_id', submission.id);
        const unitIds = (items || []).map((i: { fulfillment_unit_id: string }) => i.fulfillment_unit_id);

        const lookup =
          submission.provider === 'printful'
            ? await lookupPrintfulOrderByExternalId(submission.idempotency_key, process.env.PRINTFUL_API_TOKEN || '')
            : submission.provider === 'gelato'
              ? await lookupGelatoOrderByReferenceId(submission.idempotency_key, process.env.GELATO_API_KEY || '')
              : { found: false, notImplemented: true };

        if (lookup.notImplemented) {
          // Lookup non disponible pour ce fournisseur (Gelato — endpoint
          // non confirme, provider-lookup.ts) : revient a UNCERTAIN sans
          // conclure, plutot que de risquer un FAILED_CONFIRMED errone.
          await transitionSubmissionStatus(submission.id, 'uncertain', ['processing']);
          stillUncertain++;
          continue;
        }

        if (lookup.found && lookup.providerOrderId) {
          await upsertProviderOrder({
            submissionId: submission.id,
            provider: submission.provider,
            providerOrderId: lookup.providerOrderId,
            rawStatus: lookup.rawStatus || '',
            providerResponse: lookup.raw,
            fulfillmentUnitIds: unitIds,
          });
          const t = await transitionSubmissionStatus(submission.id, 'success', ['processing']);
          if (t.success) resolved++;
        } else {
          const t = await transitionSubmissionStatus(submission.id, 'failed_confirmed', ['processing']);
          if (t.success) resolved++;
        }
      } catch (e) {
        await reportReconciliationConflict({
          submissionId: submission.id,
          provider: submission.provider,
          reason: e instanceof Error ? e.message : 'unknown_error',
        });
        // Ne pas laisser la submission bloquee en PROCESSING indefiniment :
        // repasse en UNCERTAIN pour un prochain passage du cron.
        await transitionSubmissionStatus(submission.id, 'uncertain', ['processing']);
      }
    }

    await finishCronRun(runId, { itemsProcessed: checked + recoveredStaleProcessing });
    return NextResponse.json({ done: true, checked, resolved, stillUncertain, recoveredStaleProcessing });
  } catch (e) {
    await finishCronRun(runId, { itemsProcessed: checked, status: 'error', errorMessage: e instanceof Error ? e.message : 'unknown_error' });
    throw e;
  }
}
