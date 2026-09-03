import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { provisionDomain } from '@/lib/domains/provision';
import { resilierRenouvellement } from '@/lib/domains/renewal';
import { startCronRun, finishCronRun } from '@/lib/cron-tracker';

export const maxDuration = 120;

export const MAX_ATTEMPTS = 5;

// provisionDomain() enchaine Porkbun + Vercel + DNS + Google en serie : si
// la fonction est interrompue en route (timeout, deploiement), la ligne
// peut rester bloquee a 'paid' sans jamais devenir 'failed' — et sans passer
// par ce cron, qui ne surveillait jusqu'ici que 'failed'. Un domaine reste
// 'paid' au-dela de ce delai n'est plus une execution legitime en cours.
const PAID_STALE_MS = 10 * 60 * 1000;

/**
 * Cron : reprend les provisionings de domaine en echec, ainsi que les
 * paiements encaisses dont le provisioning ne s'est jamais termine.
 * provisionDomain est idempotent : chaque etape deja aboutie n'est pas rejouee.
 * Au-dela de MAX_ATTEMPTS on arrete : le watchdog alerte, traitement manuel.
 */
export async function GET(req: NextRequest) {
  // Fail-closed (lot crons fail-open) : un secret absent doit refuser
  // l'acces, jamais le desactiver silencieusement -- particulierement
  // important ici, ce cron declenche provisionDomain() (effets reels
  // Porkbun/Vercel, idempotent mais un appel non autorise consommerait tout
  // de meme du quota API reel).
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== 'Bearer ' + secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = await startCronRun('domain-retry');

  try {
    const staleSince = new Date(Date.now() - PAID_STALE_MS).toISOString();
    // Audit Mode 3/POD BRAND, perfectionnement (fermeture dette Porkbun/DEBT-019) --
    // 'purchase_uncertain' est desormais repris ici aussi : provisionDomain()
    // reconcilie cet etat via listAllDomains() (verite Porkbun reelle) avant
    // toute action, avec son propre delai de securite interne
    // (PURCHASE_UNCERTAIN_RECHECK_COOLDOWN_MS = 30 min, tres largement couvert
    // par l'intervalle de ce cron, 2h) -- jamais un rachat a l'aveugle. Aucun
    // filtre de fraicheur supplementaire necessaire ici : la garde vit dans
    // provisionDomain() elle-meme (retourne immediatement, sans appel Porkbun
    // ni ecriture, si le delai n'est pas encore ecoule), source unique de
    // verite plutot que dupliquee dans la requete du cron.
    const { data: rows } = await supabaseAdmin
      .from('site_domains')
      .select('id, domain, provision_attempts')
      .or(`status.eq.failed,and(status.eq.paid,updated_at.lt.${staleSince}),status.eq.purchase_uncertain`)
      .lt('provision_attempts', MAX_ATTEMPTS)
      .order('last_attempt_at', { ascending: true, nullsFirst: true })
      .limit(10);

    const results: any[] = [];

    for (const row of rows || []) {
      await supabaseAdmin
        .from('site_domains')
        .update({
          provision_attempts: (row.provision_attempts || 0) + 1,
          last_attempt_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      try {
        const r = await provisionDomain(row.id);
        results.push({ domain: row.domain, ok: r.ok, status: r.status });
      } catch (e: any) {
        console.error('[domain-retry]', row.domain, e?.message || e);
        results.push({ domain: row.domain, ok: false, status: 'exception' });
      }
    }

    // ============================================================
    // AUDIT AGRESSIF -- LA FUITE PERSISTAIT DANS LE CAS D'ECHEC.
    //
    // F-2 a rendu l'annulation effective : le webhook appelle desormais le
    // registraire. Mais quand CET APPEL echoue, la ligne garde
    // `renewal_sync_error` et... plus rien ne s'en occupe. La requete
    // ci-dessus ne cible que `failed`, `paid` perime et `purchase_uncertain`.
    //
    // Consequence : precisement dans le cas ou la resiliation a rate, le
    // registraire continuait d'auto-renouveler AUX FRAIS DE DERIBFY, sans
    // qu'aucune reprise n'existe. F-2 fermait le chemin nominal et laissait le
    // chemin d'echec ouvert -- c'est l'audit agressif qui l'a trouve, pas les
    // tests de F-2.
    //
    // `resilierRenouvellement` est IDEMPOTENT et rejoue precisement cet etat
    // (resilie mais non confirme) : aucune garde supplementaire ici.
    // ============================================================
    const { data: aReconcilier } = await supabaseAdmin
      .from('site_domains')
      .select('id, site_id, domain')
      .not('renewal_sync_error', 'is', null)
      .limit(10);

    const reconciliations: any[] = [];
    for (const row of aReconcilier || []) {
      if (!row.site_id || !row.domain) continue;
      const r = await resilierRenouvellement({
        siteId: row.site_id as string,
        domain: row.domain as string,
        origine: 'cron',
      });
      reconciliations.push({ domain: row.domain, ok: r.ok });
    }

    await finishCronRun(runId, { itemsProcessed: results.length + reconciliations.length });
    return NextResponse.json({ done: true, processed: results.length, results, reconciliations });
  } catch (e: any) {
    await finishCronRun(runId, { itemsProcessed: 0, status: 'error', errorMessage: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
