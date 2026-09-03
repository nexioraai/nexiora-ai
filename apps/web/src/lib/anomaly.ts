import { supabaseAdmin } from '@/lib/supabase-admin';
import { Resend } from 'resend';

const ADMIN_EMAIL = 'issayamiyoussouf@gmail.com';
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 email par type et par heure
// Types qui exigent un email A CHAQUE occurrence (pas d'anti-spam). Audit
// Reseller/CJ : principe explicite -- une commande client deja payee qui
// necessite une intervention humaine ne doit jamais devenir silencieuse. Le
// cooldown 1h n'a de sens que pour du bruit repetitif sans action distincte ;
// chacun des types ci-dessous correspond a UNE commande precise necessitant
// UNE action precise, jamais un evenement a regrouper.
//   cj_awaiting_manual_payment : commande CJ creee, paiement manuel attendu.
//   cj_address_incomplete      : adresse client insuffisante pour CJ.
//   cj_fulfill_exhausted       : tentatives de creation epuisees ou echec permanent.
//   cj_terminal_order_blocked  : commande CJ trouvee mais CANCELLED/TRASH.
//   cj_reconciliation_unknown  : etat CJ indetermine (uniquement quand severity
//                                'blocked' -- les occurrences 'info', premiere
//                                tentative encore auto-recuperable, ne
//                                declenchent jamais d'email, cf. plus bas).
//   cj_product_resolution_failed : mapping produit/variante CJ casse de facon
//                                persistante (uniquement severity 'blocked' --
//                                la premiere tentative transitoire reste 'info',
//                                cf. audit API Points, Finding 2).
//   checkout_order_items_insert_failed / checkout_order_designs_insert_failed :
//                                la commande existe et le client va recevoir
//                                une URL de paiement valide, mais ses lignes
//                                ou ses designs n'ont pas ete enregistres --
//                                intervention humaine necessaire avant
//                                fulfillment (audit gestion d'erreur checkout).
// cj_shipping_cost_exceeds_charged reste volontairement HORS de cette liste
// (comportement existant, cooldown 1h) -- extension a decider explicitement,
// pas incluse unilateralement dans ce correctif.
const ALWAYS_EMAIL_TYPES = new Set([
  'cj_awaiting_manual_payment',
  'cj_address_incomplete',
  'cj_fulfill_exhausted',
  'cj_terminal_order_blocked',
  'cj_reconciliation_unknown',
  'cj_product_resolution_failed',
  'checkout_order_items_insert_failed',
  'checkout_order_designs_insert_failed',
]);

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
    // Les types ALWAYS_EMAIL ignorent l'anti-spam (un email par occurrence).
    if (!ALWAYS_EMAIL_TYPES.has(type) && (count ?? 0) > 1) return;

    if (!process.env.RESEND_API_KEY) return;
    const resend = new Resend(process.env.RESEND_API_KEY);
    const rows = Object.entries(details)
      .map(([k, v]) => '<tr><td><strong>' + k + '</strong></td><td>' + String(v) + '</td></tr>')
      .join('');

    await resend.emails.send({
      from: 'Deribfy Alerts <no-reply@deribfy.com>',
      to: ADMIN_EMAIL,
      subject: '\u26a0\ufe0f Anomalie checkout : ' + type,
      html:
        '<p>Anomalie <strong>' + type + '</strong> (' + severity + ')' +
        (slug ? ' sur le site <strong>' + slug + '</strong>' : '') + '.</p>' +
        '<table cellpadding="6" border="1" style="border-collapse:collapse">' + rows + '</table>' +
        (ALWAYS_EMAIL_TYPES.has(type)
          ? '<p style="color:#888;font-size:12px">Email envoye pour chaque occurrence. Historique complet dans /admin.</p>'
          : '<p style="color:#888;font-size:12px">Prochaine alerte de ce type dans 1h maximum. Historique complet dans /admin.</p>'),
    });
  } catch (e) {
    console.error('[anomaly] alert failed', e);
  }
}
