import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { startCronRun, finishCronRun } from '@/lib/cron-tracker';
import { verifyDomain, addSite, submitSitemap } from '@/lib/domains/searchconsole';

export const maxDuration = 120;

/**
 * Termine l'indexation des domaines achetes via Nexiora.
 * Separe du webhook Stripe parce que la propagation DNS prend de quelques
 * minutes a plusieurs heures : Google echoue s'il interroge le DNS trop tot.
 * Ce cron repasse jusqu'a ce que la verification aboutisse.
 */

const BATCH_SIZE = 10;
// 4 passages/jour reels (vercel.json : 0 2,10,14,22h UTC) -- RETRY_DELAY_MS
// (30min) ne filtre jamais rien en pratique a cette cadence, l'espacement
// reel entre deux tentatives est donc celui du cron lui-meme. 8 tentatives
// = ~2 jours, corrige d'un ecart avec le commentaire d'origine qui visait
// 2 jours mais utilisait une valeur (20) correspondant en realite a ~5
// jours -- inutilement long pour un DNS entierement controle par Nexiora.
export const MAX_ATTEMPTS = 8; // ~2 jours a 4 passages par jour
const RETRY_DELAY_MS = 30 * 60 * 1000;

export async function GET(req: NextRequest) {
  // Fail-closed (lot crons fail-open) : un secret absent doit refuser
  // l'acces, jamais le desactiver silencieusement.
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== 'Bearer ' + secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = await startCronRun('domain-indexing');
  try {
    const since = new Date(Date.now() - RETRY_DELAY_MS).toISOString();

    // Domaines dont le DNS est pose mais l'indexation pas encore aboutie.
    const { data: rows } = await supabaseAdmin
      .from('site_domains')
      .select('id, domain, status, gsc_token, gsc_attempts, gsc_last_attempt_at')
      .in('status', ['dns_configured', 'google_verified'])
      .lt('gsc_attempts', MAX_ATTEMPTS)
      .or('gsc_last_attempt_at.is.null,gsc_last_attempt_at.lt.' + since)
      .limit(BATCH_SIZE);

    if (!rows || rows.length === 0) {
      await finishCronRun(runId, { itemsProcessed: 0 });
      return NextResponse.json({ done: true, processed: 0 });
    }

    let verified = 0;
    let submitted = 0;
    let pending = 0;
    let failedTerminal = 0;

    for (const row of rows) {
      const now = new Date().toISOString();
      const attempts = (row.gsc_attempts || 0) + 1;
      await supabaseAdmin
        .from('site_domains')
        .update({ gsc_attempts: attempts, gsc_last_attempt_at: now })
        .eq('id', row.id);

      // Suit le statut reellement applique (pas row.status, fige a la
      // lecture initiale) -- necessaire pour garder les gardes CAS
      // ci-dessous correctes apres une transition reussie dans cette meme
      // iteration, symetrique du pattern deja valide sur le sibling BYOD
      // (domain-indexing-byod/route.ts, `let status = row....`).
      let status = row.status;

      // Au-dela de MAX_ATTEMPTS, une tentative de plus n'apporterait rien :
      // si Google n'a toujours pas vu le TXT apres ~2 jours, rejouer la meme
      // verification ne resout pas un probleme qui n'est plus transitoire
      // (permissions du compte de service, TLD non standard, etc.). On sort
      // dans un etat terminal explicite plutot que de laisser la ligne
      // s'arreter silencieusement hors du WHERE gsc_attempts < MAX_ATTEMPTS.
      //
      // Garde CAS (audit timeouts/CAS, lot prioritaire) : deux passages du
      // cron qui se chevauchent (blocage anormal, declenchement manuel
      // duplique -- chevauchement normal quasi impossible vu l'espacement
      // reel de plusieurs heures) ne doivent pas ecraser une transition deja
      // appliquee par l'autre. `.eq('status', expectedStatus)` + verification
      // du nombre de lignes affectees, meme primitif que le sibling BYOD.
      const markTerminal = async (msg: string, expectedStatus: string) => {
        const { data: claimed } = await supabaseAdmin
          .from('site_domains')
          .update({ status: 'google_failed', last_error: msg.slice(0, 500) })
          .eq('id', row.id)
          .eq('status', expectedStatus)
          .select('id');
        if (claimed && claimed.length > 0) failedTerminal++;
      };

      try {
        // Verification de propriete, si pas deja acquise.
        if (status === 'dns_configured') {
          if (!row.gsc_token) {
            if (attempts >= MAX_ATTEMPTS) {
              await markTerminal('Jeton Google jamais genere apres ' + MAX_ATTEMPTS + ' tentatives.', status);
              continue;
            }
            pending++;
            continue;
          }
          const ok = await verifyDomain(row.domain);
          if (!ok) {
            // Propagation DNS incomplete : on repassera.
            if (attempts >= MAX_ATTEMPTS) {
              await markTerminal('Propriete Google non verifiee apres ' + MAX_ATTEMPTS + ' tentatives (TXT jamais vu par Google).', status);
              continue;
            }
            pending++;
            continue;
          }
          const { data: claimed } = await supabaseAdmin
            .from('site_domains')
            .update({ status: 'google_verified', google_verified_at: now, last_error: null })
            .eq('id', row.id)
            .eq('status', 'dns_configured')
            .select('id');
          if (!claimed || claimed.length === 0) continue; // course perdue, un autre passage a deja transitionne cette ligne
          status = 'google_verified';
          verified++;
        }

        if (status === 'google_verified') {
          // Propriete de type domaine : couvre www, non-www et sous-domaines.
          const siteUrl = 'sc-domain:' + row.domain;
          await addSite(siteUrl);
          await submitSitemap(siteUrl, 'https://' + row.domain + '/sitemap.xml');

          const { data: claimed } = await supabaseAdmin
            .from('site_domains')
            .update({
              status: 'sitemap_submitted',
              sitemap_submitted_at: new Date().toISOString(),
              last_error: null,
            })
            .eq('id', row.id)
            .eq('status', 'google_verified')
            .select('id');
          if (claimed && claimed.length > 0) submitted++;
        }
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (attempts >= MAX_ATTEMPTS) {
          await markTerminal(msg, status);
        } else {
          await supabaseAdmin
            .from('site_domains')
            .update({ last_error: msg.slice(0, 500) })
            .eq('id', row.id);
        }
        console.error('[domain-indexing]', row.domain, msg);
      }
    }

    await finishCronRun(runId, { itemsProcessed: rows.length });
    return NextResponse.json({ done: true, processed: rows.length, verified, submitted, pending, failedTerminal });
  } catch (e: any) {
    await finishCronRun(runId, { itemsProcessed: 0, status: 'error', errorMessage: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
