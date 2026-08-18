import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Resend } from 'resend';

export const maxDuration = 30;

const ADMIN_EMAIL = 'issayamiyoussouf@gmail.com';

const EXPECTED_CRONS: Record<string, number> = {
  'catalog-sync': 14,
  'supplier-watch': 14,
  'domain-indexing': 14,
  'cj-tracking': 26,
  'instant-payout': 26,
  'catalog-suggest': 180,
  'domain-retry': 4,
};

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
        from: 'Deribfy Alerts <no-reply@deribfy.com>',
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

  // #3 — Crons qui finissent à 0 items alors qu'ils ne devraient pas
  const NEVER_ZERO = ['catalog-sync', 'supplier-watch'];
  const zeroAlerts: string[] = [];

  for (const cronName of NEVER_ZERO) {
    const cutoff = new Date(now.getTime() - 26 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from('cron_runs')
      .select('items_processed, status')
      .eq('cron_name', cronName)
      .eq('status', 'success')
      .gte('started_at', cutoff)
      .order('started_at', { ascending: false })
      .limit(3);

    if (recent && recent.length > 0 && recent.every(r => r.items_processed === 0)) {
      zeroAlerts.push(cronName);
    }
  }

  if (zeroAlerts.length > 0) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Deribfy Alerts <no-reply@deribfy.com>',
        to: ADMIN_EMAIL,
        subject: `\u26a0\ufe0f ${zeroAlerts.length} cron(s) \u00e0 0 r\u00e9sultats`,
        html: [
          '<p>Ces crons ont retourn\u00e9 0 items sur leurs derni\u00e8res ex\u00e9cutions :</p>',
          '<ul>',
          ...zeroAlerts.map(c => `<li><strong>${c}</strong></li>`),
          '</ul>',
        ].join(''),
      });
    } catch (e) {
      console.error('Watchdog zero-result alert failed:', e);
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
        from: 'Deribfy Alerts <no-reply@deribfy.com>',
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

  // #2bis \u2014 Domaines bloques sur la verification Google apres epuisement des
  // tentatives (domaine en ligne et fonctionnel, seule l'indexation Google
  // est bloquee \u2014 categorie distincte de #2, qui couvre l'echec de
  // provisioning lui-meme).
  const { data: googleFailedDomains } = await supabaseAdmin
    .from('site_domains')
    .select('id, domain, site_id, last_error, updated_at')
    .eq('status', 'google_failed');

  if (googleFailedDomains && googleFailedDomains.length > 0) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Deribfy Alerts <no-reply@deribfy.com>',
        to: ADMIN_EMAIL,
        subject: `\u26a0\ufe0f ${googleFailedDomains.length} domaine(s) bloqu\u00e9(s) sur Google Search Console`,
        html: [
          '<p>Domaines en ligne mais dont la v\u00e9rification Google Search Console n\'a jamais abouti (intervention manuelle requise) :</p>',
          '<ul>',
          ...googleFailedDomains.map(d => `<li><strong>${d.domain}</strong> \u2014 ${d.last_error || 'pas de d\u00e9tail'}</li>`),
          '</ul>',
        ].join(''),
      });
    } catch (e) {
      console.error('Watchdog Google domain alert failed:', e);
    }
  }

  // #2ter — Meme categorie, pour les domaines BYOD (colonnes sites.custom_domain_google_*,
  // jamais site_domains).
  const { data: byodGoogleFailed } = await supabaseAdmin
    .from('sites')
    .select('id, slug, custom_domain, custom_domain_google_last_error')
    .eq('custom_domain_google_status', 'failed');

  if (byodGoogleFailed && byodGoogleFailed.length > 0) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Deribfy Alerts <no-reply@deribfy.com>',
        to: ADMIN_EMAIL,
        subject: `⚠️ ${byodGoogleFailed.length} domaine(s) BYOD bloqué(s) sur Google Search Console`,
        html: [
          '<p>Domaines BYOD dont la vérification Google Search Console n\'a jamais abouti (intervention manuelle requise) :</p>',
          '<ul>',
          ...byodGoogleFailed.map(d => `<li><strong>${d.custom_domain}</strong> (${d.slug}) — ${d.custom_domain_google_last_error || 'pas de détail'}</li>`),
          '</ul>',
        ].join(''),
      });
    } catch (e) {
      console.error('Watchdog BYOD Google domain alert failed:', e);
    }
  }

  // #2quater — Paiement encaissé mais provisioning jamais terminé, y compris
  // après épuisement des tentatives de domain-retry (provision_attempts a
  // atteint son plafond sans que le statut n'ait jamais avancé au-delà de
  // 'paid'). Cas volontairement distinct de #2 : ici aucune erreur explicite
  // n'a jamais été capturée par provisionDomain (sinon le statut serait déjà
  // 'failed') — le domaine est resté bloqué avant même le premier essai réel,
  // typiquement une fonction interrompue en route.
  const { data: stuckPaid } = await supabaseAdmin
    .from('site_domains')
    .select('id, domain, updated_at')
    .eq('status', 'paid')
    .gte('provision_attempts', 5);

  if (stuckPaid && stuckPaid.length > 0) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Deribfy Alerts <no-reply@deribfy.com>',
        to: ADMIN_EMAIL,
        subject: `⚠️ ${stuckPaid.length} domaine(s) payé(s) jamais provisionnés`,
        html: [
          '<p>Domaines encaissés dont le provisioning ne s\'est jamais terminé, même après plusieurs tentatives (intervention manuelle requise) :</p>',
          '<ul>',
          ...stuckPaid.map(d => `<li><strong>${d.domain}</strong> — payé le ${d.updated_at}</li>`),
          '</ul>',
        ].join(''),
      });
    } catch (e) {
      console.error('Watchdog stuck-paid domain alert failed:', e);
    }
  }

  return NextResponse.json({
    checked: Object.keys(EXPECTED_CRONS).length,
    missing,
    failedDomains: failedDomains?.length || 0,
    zeroAlerts,
    ok: missing.length === 0 && (!failedDomains || failedDomains.length === 0) && zeroAlerts.length === 0,
  });
}
