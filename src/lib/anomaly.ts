import { supabaseAdmin } from '@/lib/supabase-admin';
import { Resend } from 'resend';

const ADMIN_EMAIL = 'issayamiyoussouf@gmail.com';
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 email par type et par heure

export type AnomalySeverity = 'blocked' | 'warning' | 'info';

/**
 * Enregistre une anomalie checkout et alerte l'admin si necessaire.
 * Ne throw jamais : une anomalie de logging ne doit pas casser un checkout.
 */
export async function logAnomaly(params: {
  type: string;
  severity?: AnomalySeverity;
  siteId?: string | null;
  slug?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  const { type, severity = 'blocked', siteId = null, slug = null, details = {} } = params;

  try {
    await supabaseAdmin.from('checkout_anomalies').insert({
      type,
      severity,
      site_id: siteId,
      slug,
      details,
    });
  } catch (e) {
    console.error('[anomaly] insert failed', e);
  }

  if (severity === 'info') return;

  try {
    // Anti-spam : un seul email par type et par heure.
    const since = new Date(Date.now() - ALERT_COOLDOWN_MS).toISOString();
    const { count } = await supabaseAdmin
      .from('checkout_anomalies')
      .select('id', { count: 'exact', head: true })
      .eq('type', type)
      .neq('severity', 'info')
      .gte('created_at', since);

    // count inclut la ligne qu'on vient d'inserer : > 1 signifie deja alerte.
    if ((count ?? 0) > 1) return;

    if (!process.env.RESEND_API_KEY) return;
    const resend = new Resend(process.env.RESEND_API_KEY);
    const rows = Object.entries(details)
      .map(([k, v]) => '<tr><td><strong>' + k + '</strong></td><td>' + String(v) + '</td></tr>')
      .join('');

    await resend.emails.send({
      from: 'Nexiora Alerts <no-reply@nexiora.ca>',
      to: ADMIN_EMAIL,
      subject: '\u26a0\ufe0f Anomalie checkout : ' + type,
      html:
        '<p>Anomalie <strong>' + type + '</strong> (' + severity + ')' +
        (slug ? ' sur le site <strong>' + slug + '</strong>' : '') + '.</p>' +
        '<table cellpadding="6" border="1" style="border-collapse:collapse">' + rows + '</table>' +
        '<p style="color:#888;font-size:12px">Prochaine alerte de ce type dans 1h maximum. Historique complet dans /admin.</p>',
    });
  } catch (e) {
    console.error('[anomaly] alert failed', e);
  }
}
