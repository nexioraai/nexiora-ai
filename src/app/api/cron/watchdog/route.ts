import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Resend } from 'resend';
import { startCronRun, finishCronRun } from '@/lib/cron-tracker';
import { MAX_ATTEMPTS as DOMAIN_RETRY_MAX_ATTEMPTS } from '@/app/api/cron/domain-retry/route';

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
  // meme cadence (toutes les 2h) que domain-retry : meme marge.
  'domain-indexing-byod': 4,
};

// Crons de la chaine domaine/Google : un cron qui tourne a l'heure mais dont
// TOUTES les executions recentes finissent en status='error' n'est jamais
// detecte par la boucle EXPECTED_CRONS ci-dessus (elle verifie seulement
// qu'UNE ligne existe dans la fenetre, peu importe son status) -- un cron
// silencieusement casse a chaque appel (ex. cle de service Google expiree,
// import brise par un deploiement) ne declenche donc aujourd'hui aucune
// alerte tant qu'il continue au moins a s'executer et a logger l'erreur.
const DOMAIN_CHAIN_CRONS = ['domain-indexing', 'domain-indexing-byod', 'domain-retry'];
const RECENT_FAILURE_WINDOW = 3;

export async function GET(req: NextRequest) {
  // Fail-closed (lot crons fail-open) : un secret absent doit refuser
  // l'acces, jamais le desactiver silencieusement.
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== 'Bearer ' + secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = await startCronRun('watchdog');
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

  // #1bis — Crons de la chaine domaine/Google qui s'executent a l'heure mais
  // echouent systematiquement (voir commentaire de DOMAIN_CHAIN_CRONS).
  // Distinct de #missing : ici le cron tourne bel et bien, seul son resultat
  // est mauvais a chaque fois.
  const failingCrons: string[] = [];
  for (const cronName of DOMAIN_CHAIN_CRONS) {
    const { data: recentRuns } = await supabaseAdmin
      .from('cron_runs')
      .select('status')
      .eq('cron_name', cronName)
      .order('started_at', { ascending: false })
      .limit(RECENT_FAILURE_WINDOW);

    if (recentRuns && recentRuns.length === RECENT_FAILURE_WINDOW && recentRuns.every(r => r.status === 'error')) {
      failingCrons.push(cronName);
    }
  }

  if (failingCrons.length > 0) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Deribfy Alerts <no-reply@deribfy.com>',
        to: ADMIN_EMAIL,
        subject: `⚠️ ${failingCrons.length} cron(s) en échec systématique`,
        html: [
          `<p>Ces crons s'exécutent à l'heure mais échouent sur leurs ${RECENT_FAILURE_WINDOW} dernières exécutions :</p>`,
          '<ul>',
          ...failingCrons.map(c => `<li><strong>${c}</strong></li>`),
          '</ul>',
        ].join(''),
      });
    } catch (e) {
      console.error('Watchdog failing-cron alert failed:', e);
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

  // #2quinquies -- Audit Mode 3/POD BRAND, perfectionnement -- achat Porkbun
  // reussi (argent reellement depense) mais impossible a confirmer en base
  // immediatement (purchased_at jamais ecrit apres 3 tentatives,
  // src/lib/domains/provision.ts). Categorie DELIBEREMENT distincte de #2
  // ('failed', le domaine n'a jamais ete achete).
  //
  // CORRECTIF (fermeture dette Porkbun/DEBT-019) : ce n'est PLUS un dead-end
  // manuel -- domain-retry reprend desormais aussi 'purchase_uncertain'
  // (toutes les 2h, vercel.json), et provisionDomain() reconcilie l'etat reel
  // via listAllDomains() (verite Porkbun, pas une supposition) avant toute
  // action : confirme si reellement achete, ou repasse a 'failed' (nouvel
  // essai normal, borne) apres un delai de securite de 30 min. Cette alerte
  // reste utile comme trace d'audit d'un evenement anormal (echec d'ecriture
  // apres un vrai paiement Porkbun), mais n'exige plus d'intervention
  // manuelle immediate -- le systeme s'auto-resout au prochain passage du
  // cron dans l'ecrasante majorite des cas. Alerte immediate (pas de seuil
  // de tentatives) : reste informative des la premiere occurrence.
  const { data: purchaseUncertainDomains } = await supabaseAdmin
    .from('site_domains')
    .select('id, domain, site_id, last_error, updated_at')
    .eq('status', 'purchase_uncertain');

  if (purchaseUncertainDomains && purchaseUncertainDomains.length > 0) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Deribfy Alerts <no-reply@deribfy.com>',
        to: ADMIN_EMAIL,
        subject: `\u26a0\ufe0f ${purchaseUncertainDomains.length} achat(s) domaine en r\u00e9conciliation Porkbun`,
        html: [
          '<p>Achat Porkbun probablement r\u00e9ussi (argent d\u00e9pens\u00e9) mais non confirm\u00e9 imm\u00e9diatement en base -- ',
          'le syst\u00e8me v\u00e9rifie automatiquement l\'\u00e9tat r\u00e9el aupr\u00e8s de Porkbun (listAllDomains) au prochain ',
          'passage de domain-retry (toutes les 2h) et se corrige seul dans la grande majorit\u00e9 des cas. ',
          'Alerte informative -- v\u00e9rifier le dashboard Porkbun seulement si le domaine reste dans cet \u00e9tat ',
          'au-del\u00e0 de quelques heures :</p>',
          '<ul>',
          ...purchaseUncertainDomains.map(d => `<li><strong>${d.domain}</strong> \u2014 ${d.last_error || 'pas de d\u00e9tail'}</li>`),
          '</ul>',
        ].join(''),
      });
    } catch (e) {
      console.error('Watchdog purchase-uncertain domain alert failed:', e);
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
    .gte('provision_attempts', DOMAIN_RETRY_MAX_ATTEMPTS);

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

  const totalIssues =
    missing.length +
    failingCrons.length +
    zeroAlerts.length +
    (failedDomains?.length || 0) +
    (googleFailedDomains?.length || 0) +
    (byodGoogleFailed?.length || 0) +
    (stuckPaid?.length || 0) +
    (purchaseUncertainDomains?.length || 0);
  await finishCronRun(runId, { itemsProcessed: totalIssues });

  return NextResponse.json({
    checked: Object.keys(EXPECTED_CRONS).length,
    missing,
    failingCrons,
    failedDomains: failedDomains?.length || 0,
    purchaseUncertainDomains: purchaseUncertainDomains?.length || 0,
    zeroAlerts,
    ok: totalIssues === 0,
  });
}
