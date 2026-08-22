import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { startCronRun, finishCronRun } from '@/lib/cron-tracker';
import { fulfillCjOrder, MAX_CREATE_ATTEMPTS, STALE_LOCK_MS } from '@/lib/cj/fulfill';

export const maxDuration = 300;

/**
 * Cron de réconciliation/retry sûr pour Reseller/CJ (audit Mode 3, §9/§18).
 * Un seul cron gère pending/failed (retry création, sous budget) ET
 * processing-stale (verrou abandonné après crash, réconciliation sans
 * création tant que NOT_FOUND n'est pas confirmé) -- toute la logique de
 * décision réelle vit dans fulfillCjOrder() (mutex, réconciliation avant
 * création, 1603003, alerting), ce cron ne fait que sélectionner les
 * commandes éligibles et les traiter séquentiellement.
 *
 * Séquentiel, jamais Promise.all. Throttle CJ désormais global (cjFetch ->
 * acquireCjSlot, audit hostile Phase 1-2) : plus de sleep manuel entre
 * commandes ici, chaque appel réseau réel est déjà espacé au niveau le plus
 * bas, partagé avec toutes les autres routes/crons CJ. Isolé de Mode 1/2/POD :
 * ne touche que shop_orders via fulfillCjOrder, aucun import croisé.
 */
export async function GET(req: NextRequest) {
  // Fail-closed (audit cj-tracking / clôture Mode 3) : un secret absent doit
  // refuser l'acces, jamais le desactiver silencieusement -- meme correctif
  // deja applique a cj-tracking/route.ts et pod-reconciliation/route.ts.
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== 'Bearer ' + secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = await startCronRun('cj-fulfillment-reconciliation');
  try {
    // Groupe 1 : commandes eligibles a une nouvelle tentative de creation
    // (budget non epuise).
    const { data: retryable } = await supabaseAdmin
      .from('shop_orders')
      .select('id')
      .eq('status', 'paid')
      .in('cj_pay_status', ['pending', 'failed'])
      .lt('cj_pay_attempts', MAX_CREATE_ATTEMPTS)
      .limit(100);

    // Groupe 2 : verrous 'processing' abandonnes (crash/timeout precedent
    // sans ecriture d'etat terminal) -- eligibles a une reconciliation
    // (jamais une creation directe : fulfillCjOrder revalide via
    // reconcileWithCj avant tout createOrderV2).
    const staleThreshold = new Date(Date.now() - STALE_LOCK_MS).toISOString();
    const { data: staleProcessing } = await supabaseAdmin
      .from('shop_orders')
      .select('id')
      .eq('status', 'paid')
      .eq('cj_pay_status', 'processing')
      .or(`cj_pay_locked_at.is.null,cj_pay_locked_at.lt.${staleThreshold}`)
      .limit(100);

    const orderIds = Array.from(
      new Set([...(retryable || []).map((o) => o.id), ...(staleProcessing || []).map((o) => o.id)])
    );

    let processed = 0;
    let errors = 0;
    for (const orderId of orderIds) {
      try {
        await fulfillCjOrder(orderId);
      } catch (e) {
        errors++;
        console.error(`cj-fulfillment-reconciliation: echec pour ${orderId}:`, e);
        // Ne bloque jamais le reste du lot -- fulfillCjOrder gere deja ses
        // propres etats/alertes internes ; une exception ici est un incident
        // imprevu (bug), pas un echec CJ attendu.
      }
      processed++;
    }

    await finishCronRun(runId, { itemsProcessed: processed });
    return NextResponse.json({ done: true, eligible: orderIds.length, processed, errors });
  } catch (e: any) {
    await finishCronRun(runId, { itemsProcessed: 0, status: 'error', errorMessage: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
