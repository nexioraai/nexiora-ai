import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Resend } from 'resend';

export const maxDuration = 30;

const ADMIN_EMAIL = 'issayamiyoussouf@gmail.com';

const EXPECTED_CRONS: Record<string, number> = {
  'catalog-sync': 14,
  'supplier-watch': 14,
  'domain-indexing': 14,
  'cj-tracking': 26,
  'cj-stock-sync': 26,
  'instant-payout': 26,
  'catalog-suggest': 170,
};

export async function GET() {
  const now = new Date();
  const missing: string[] = [];

  for (const [cronName, maxHours] of Object.entries(EXPECTED_CRONS)) {
    const cutoff = new Date(now.getTime() - maxHours * 60 * 60 * 1000).toISOString();

    const { data } = await supabaseAdmin
      .from('cron_runs')
      .select('id, status, started_at')
      .eq('cron_name', cronName)
      .gte('started_at', cutoff)
      .order('started_at', { ascending: false })
      .limit(1);

    if (!data || data.length === 0) {
      missing.push(cronName);
    }
  }

  if (missing.length > 0) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Nexiora Alerts <no-reply@nexiora.ca>',
        to: ADMIN_EMAIL,
        subject: `\u26a0\ufe0f ${missing.length} cron(s) silencieux`,
        html: [
          '<p>Les crons suivants n\u2019ont pas tourn\u00e9 dans leur fen\u00eatre attendue :</p>',
          '<ul>',
          ...missing.map(c => `<li><strong>${c}</strong> (attendu toutes les ${EXPECTED_CRONS[c]}h)</li>`),
          '</ul>',
          `<p>V\u00e9rifi\u00e9 le ${now.toISOString()}</p>`,
        ].join(''),
      });
    } catch (e) {
      console.error('Watchdog email failed:', e);
    }
  }

  // #2 — Domaines en échec (marchand a payé mais provisioning raté)
  const { data: failedDomains } = await supabaseAdmin
    .from('site_domains')
    .select('id, domain, site_id, last_error, updated_at')
    .eq('status', 'failed');

  if (failedDomains && failedDomains.length > 0) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Nexiora Alerts <no-reply@nexiora.ca>',
        to: ADMIN_EMAIL,
        subject: `\u26a0\ufe0f ${failedDomains.length} domaine(s) en \u00e9chec`,
        html: [
          '<p>Domaines pay\u00e9s mais provisioning \u00e9chou\u00e9 :</p>',
          '<ul>',
          ...failedDomains.map(d => `<li><strong>${d.domain}</strong> \u2014 ${d.last_error || 'pas de d\u00e9tail'}</li>`),
          '</ul>',
        ].join(''),
      });
    } catch (e) {
      console.error('Watchdog domain alert failed:', e);
    }
  }

  return NextResponse.json({
    checked: Object.keys(EXPECTED_CRONS).length,
    missing,
    failedDomains: failedDomains?.length || 0,
    ok: missing.length === 0 && (!failedDomains || failedDomains.length === 0),
  });
}
