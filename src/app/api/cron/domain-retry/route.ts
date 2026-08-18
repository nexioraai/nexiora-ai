import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { provisionDomain } from '@/lib/domains/provision';
import { startCronRun, finishCronRun } from '@/lib/cron-tracker';

export const maxDuration = 120;

const MAX_ATTEMPTS = 5;

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
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = await startCronRun('domain-retry');

  try {
    const staleSince = new Date(Date.now() - PAID_STALE_MS).toISOString();
    const { data: rows } = await supabaseAdmin
      .from('site_domains')
      .select('id, domain, provision_attempts')
      .or(`status.eq.failed,and(status.eq.paid,updated_at.lt.${staleSince})`)
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

    await finishCronRun(runId, { itemsProcessed: results.length });
    return NextResponse.json({ done: true, processed: results.length, results });
  } catch (e: any) {
    await finishCronRun(runId, { itemsProcessed: 0, status: 'error', errorMessage: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
