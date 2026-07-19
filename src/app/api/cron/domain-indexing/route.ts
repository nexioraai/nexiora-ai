import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { startCronRun, finishCronRun } from '@/lib/cron-tracker';
import { verifyDomain, addSite, submitSitemap } from '@/lib/domains/searchconsole';

export const maxDuration = 60;

/**
 * Termine l'indexation des domaines achetes via Nexiora.
 * Separe du webhook Stripe parce que la propagation DNS prend de quelques
 * minutes a plusieurs heures : Google echoue s'il interroge le DNS trop tot.
 * Ce cron repasse jusqu'a ce que la verification aboutisse.
 */

const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 20;      // ~2 jours a 4 passages par jour
const RETRY_DELAY_MS = 30 * 60 * 1000;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET) {
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

    for (const row of rows) {
      const now = new Date().toISOString();
      await supabaseAdmin
        .from('site_domains')
        .update({ gsc_attempts: (row.gsc_attempts || 0) + 1, gsc_last_attempt_at: now })
        .eq('id', row.id);

      try {
        // Verification de propriete, si pas deja acquise.
        if (row.status === 'dns_configured') {
          if (!row.gsc_token) {
            pending++;
            continue;
          }
          const ok = await verifyDomain(row.domain);
          if (!ok) {
            // Propagation DNS incomplete : on repassera.
            pending++;
            continue;
          }
          await supabaseAdmin
            .from('site_domains')
            .update({ status: 'google_verified', google_verified_at: now, last_error: null })
            .eq('id', row.id);
          verified++;
        }

        // Propriete de type domaine : couvre www, non-www et sous-domaines.
        const siteUrl = 'sc-domain:' + row.domain;
        await addSite(siteUrl);
        await submitSitemap(siteUrl, 'https://' + row.domain + '/sitemap.xml');

        await supabaseAdmin
          .from('site_domains')
          .update({
            status: 'sitemap_submitted',
            sitemap_submitted_at: new Date().toISOString(),
            last_error: null,
          })
          .eq('id', row.id);
        submitted++;
      } catch (e: any) {
        await supabaseAdmin
          .from('site_domains')
          .update({ last_error: String(e?.message || e).slice(0, 500) })
          .eq('id', row.id);
        console.error('[domain-indexing]', row.domain, e?.message || e);
      }
    }

    await finishCronRun(runId, { itemsProcessed: rows.length });
    return NextResponse.json({ done: true, processed: rows.length, verified, submitted, pending });
  } catch (e: any) {
    await finishCronRun(runId, { itemsProcessed: 0, status: 'error', errorMessage: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
