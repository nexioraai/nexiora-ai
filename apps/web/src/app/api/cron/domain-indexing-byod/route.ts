import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { startCronRun, finishCronRun } from '@/lib/cron-tracker';
import { getVercelDomainStatus } from '@/lib/domains/vercel';
import { getDnsVerificationToken, verifyDomain, addSite, submitSitemap } from '@/lib/domains/searchconsole';

export const maxDuration = 120;

/**
 * Verification de propriete Google + soumission sitemap pour les domaines
 * BYOD (le marchand possede sa propre zone DNS — contrairement au chemin
 * achete, Nexiora n'ecrit jamais rien dans cette zone).
 *
 * Strictement separe du pipeline achat : lit et ecrit uniquement les 5
 * colonnes google_* de `sites`, jamais `site_domains`. L'eligibilite exclut
 * tout site deja gere par le pipeline achat pour SON domaine actuel
 * (site_id ET domain correspondants — pas seulement l'existence d'une
 * ligne site_domains pour ce site_id, qui pourrait etre une ancienne
 * tentative d'achat abandonnee sans rapport avec le domaine BYOD actuel).
 *
 * Concurrence : aucun verrou n'existe nulle part dans ce projet (memes
 * crons achat). Chaque transition de statut est protegee individuellement
 * par une ecriture conditionnelle (CAS) sur l'etat precedent attendu — si
 * aucune ligne n'est affectee, une autre execution a deja gagne la course
 * et ce passage abandonne la suite pour ce site sans rien ecraser.
 */

const BATCH_SIZE = 10;
// ~1 tentative reelle par passage une fois Vercel verifie (cron toutes les
// 2h) : 20 tentatives = ~1.7 jour, coherent avec le pipeline achat (~2 jours).
export const MAX_ATTEMPTS = 20;
const RETRY_DELAY_MS = 30 * 60 * 1000;

type Candidate = {
  id: string;
  custom_domain: string;
  custom_domain_google_status: string | null;
  custom_domain_google_token: string | null;
  custom_domain_google_attempts: number | null;
};

export async function GET(req: NextRequest) {
  // Fail-closed (lot crons fail-open) : un secret absent doit refuser
  // l'acces, jamais le desactiver silencieusement.
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== 'Bearer ' + secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = await startCronRun('domain-indexing-byod');

  try {
    const since = new Date(Date.now() - RETRY_DELAY_MS).toISOString();

    const { data: candidates } = await supabaseAdmin
      .from('sites')
      .select('id, custom_domain, custom_domain_google_status, custom_domain_google_token, custom_domain_google_attempts')
      .not('custom_domain', 'is', null)
      .eq('published', true)
      .or('custom_domain_google_status.is.null,custom_domain_google_status.neq.sitemap_submitted')
      .or(`custom_domain_google_attempts.is.null,custom_domain_google_attempts.lt.${MAX_ATTEMPTS}`)
      .or(`custom_domain_google_last_attempt_at.is.null,custom_domain_google_last_attempt_at.lt.${since}`)
      .limit(BATCH_SIZE * 3);

    if (!candidates || candidates.length === 0) {
      await finishCronRun(runId, { itemsProcessed: 0 });
      return NextResponse.json({ done: true, processed: 0 });
    }

    // Exclusion des sites deja geres par le pipeline achat pour LEUR
    // domaine actuel (site_id + domain, pas site_id seul).
    const domains = candidates.map((c) => c.custom_domain);
    const { data: purchased } = await supabaseAdmin
      .from('site_domains')
      .select('site_id, domain')
      .in('domain', domains);
    const purchasedSet = new Set((purchased || []).map((p) => `${p.site_id}:${p.domain}`));
    const rows: Candidate[] = candidates
      .filter((c) => !purchasedSet.has(`${c.id}:${c.custom_domain}`))
      .slice(0, BATCH_SIZE);

    let pending = 0;
    let verified = 0;
    let submitted = 0;
    let failedTerminal = 0;

    for (const row of rows) {
      const now = new Date().toISOString();

      try {
        // Garde-fou Vercel : verifie en direct a chaque passage, jamais
        // une valeur stockee.
        const vercelStatus = await getVercelDomainStatus(row.custom_domain);
        if (!vercelStatus.verified) {
          // Le marchand n'a pas (encore) pose son DNS externe — c'est de son
          // ressort, pas un probleme Google/Nexiora. On ne compte PAS ce
          // passage dans custom_domain_google_attempts : sinon un marchand
          // simplement lent a configurer son DNS declencherait une alerte
          // "echec" au bout de MAX_ATTEMPTS alors que rien n'est casse.
          // Seul last_attempt_at avance, pour espacer les prochains appels
          // Vercel.
          await supabaseAdmin
            .from('sites')
            .update({ custom_domain_google_last_attempt_at: now })
            .eq('id', row.id);
          pending++;
          continue;
        }

        // A partir d'ici, le blocage eventuel est reellement du cote
        // Google/Nexiora : les tentatives ne comptent qu'a partir de ce
        // point, symetrique du pipeline achat ou gsc_attempts ne compte
        // qu'une fois le DNS deja configure par Nexiora elle-meme.
        const attempts = (row.custom_domain_google_attempts || 0) + 1;
        await supabaseAdmin
          .from('sites')
          .update({
            custom_domain_google_attempts: attempts,
            custom_domain_google_last_attempt_at: now,
          })
          .eq('id', row.id);

        const markFailed = async (msg: string, expectedStatus: string | null) => {
          let q = supabaseAdmin
            .from('sites')
            .update({ custom_domain_google_status: 'failed', custom_domain_google_last_error: msg.slice(0, 500) })
            .eq('id', row.id);
          q = expectedStatus === null ? q.is('custom_domain_google_status', null) : q.eq('custom_domain_google_status', expectedStatus);
          const { data: claimed } = await q.select('id');
          if (claimed && claimed.length > 0) failedTerminal++;
        };

        let status = row.custom_domain_google_status;

        if (!status) {
          try {
            const token = await getDnsVerificationToken(row.custom_domain);
            const { data: claimed } = await supabaseAdmin
              .from('sites')
              .update({ custom_domain_google_token: token, custom_domain_google_status: 'token_issued' })
              .eq('id', row.id)
              .is('custom_domain_google_status', null)
              .select('id');
            if (!claimed || claimed.length === 0) {
              // Une autre execution a deja initialise ce site : le jeton
              // fraichement genere est abandonne, jamais ecrit ni affiche.
              continue;
            }
            pending++;
            // Laisser le temps au marchand de poser le TXT avant de
            // tenter une verification qui echouerait a coup sur.
            continue;
          } catch (e: any) {
            if (attempts >= MAX_ATTEMPTS) {
              await markFailed('Jeton Google jamais genere apres ' + MAX_ATTEMPTS + ' tentatives : ' + (e?.message || e), null);
              continue;
            }
            throw e;
          }
        }

        if (status === 'token_issued') {
          const ok = await verifyDomain(row.custom_domain);
          if (!ok) {
            if (attempts >= MAX_ATTEMPTS) {
              await markFailed('Propriete Google non verifiee apres ' + MAX_ATTEMPTS + ' tentatives (TXT jamais vu par Google — verifier que le marchand a bien pose le bon enregistrement).', 'token_issued');
              continue;
            }
            pending++;
            continue;
          }
          const { data: claimed } = await supabaseAdmin
            .from('sites')
            .update({ custom_domain_google_status: 'verified' })
            .eq('id', row.id)
            .eq('custom_domain_google_status', 'token_issued')
            .select('id');
          if (!claimed || claimed.length === 0) continue;
          status = 'verified';
          verified++;
        }

        if (status === 'verified') {
          try {
            const siteUrl = 'sc-domain:' + row.custom_domain;
            await addSite(siteUrl);
            await submitSitemap(siteUrl, 'https://' + row.custom_domain + '/sitemap.xml');
            const { data: claimed } = await supabaseAdmin
              .from('sites')
              .update({ custom_domain_google_status: 'sitemap_submitted', custom_domain_google_last_error: null })
              .eq('id', row.id)
              .eq('custom_domain_google_status', 'verified')
              .select('id');
            if (claimed && claimed.length > 0) submitted++;
          } catch (e: any) {
            if (attempts >= MAX_ATTEMPTS) {
              await markFailed(String(e?.message || e), 'verified');
              continue;
            }
            throw e;
          }
        }
      } catch (e: any) {
        await supabaseAdmin
          .from('sites')
          .update({ custom_domain_google_last_error: String(e?.message || e).slice(0, 500) })
          .eq('id', row.id);
        console.error('[domain-indexing-byod]', row.custom_domain, e?.message || e);
      }
    }

    await finishCronRun(runId, { itemsProcessed: rows.length });
    return NextResponse.json({ done: true, processed: rows.length, verified, submitted, pending, failedTerminal });
  } catch (e: any) {
    await finishCronRun(runId, { itemsProcessed: 0, status: 'error', errorMessage: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
