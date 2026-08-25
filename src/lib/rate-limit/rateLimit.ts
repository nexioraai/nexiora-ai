import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAnomaly } from '@/lib/anomaly';

// ============================================================
// LOT 6 -- UNE SEULE AUTORITE POUR « CETTE SURFACE A-T-ELLE DEJA TROP SERVI ».
//
// LE MECANISME EXISTAIT DEJA, ECRIT QUATRE FOIS, ET LES QUATRE COPIES ETAIENT
// FAIL-OPEN. `contact` (20/h), `shipping-estimate` (30/min),
// `catalog/image-search` (10/min) et `blog/generate` (3/min) comptaient tous
// ainsi :
//
//     const { count } = await supabaseAdmin.from(...).select('id', {count:'exact', head:true})...
//     if ((count ?? 0) >= N) return 429
//
// `error` n'etait JAMAIS lu. Or PostgREST rend `count: null` quand la requete
// echoue -- panne, RLS, timeout, table indisponible. `(null ?? 0) >= N` vaut
// donc `false`, et la limite s'OUVRE au moment precis ou la base est en
// difficulte. La depense protegee -- e-mail Resend, appel Claude facture,
// credential fournisseur -- passait quand meme. C'est le defaut demontre par
// execution sur `blog/generate` au LOT 6, et il etait systemique.
//
// ICI LA PANNE FERME. Un compteur qui ne sait pas repondre ne peut pas
// autoriser : il rend 503. Refuser un visiteur legitime pendant une panne est
// reparable ; laisser un abuseur depenser sans plafond ne l'est pas.
//
// PAS DE DDL. Le compteur reste `checkout_anomalies`, deja utilise comme tel
// par `contact` et `shipping-estimate`, avec `severity: 'info'` -- qui
// n'envoie jamais d'e-mail (cf. anomaly.ts) : c'est un compteur, pas une
// alerte. La colonne `type` est du texte libre (plus de soixante valeurs en
// usage), aucune contrainte a modifier.
// ============================================================

export type VerdictLimite =
  | { ok: true }
  | { ok: false; statut: 429 | 503; erreur: string };

/**
 * Consomme un jeton pour `type` sur le perimetre `siteId`.
 *
 * L'ORDRE EST LA GARANTIE : on COMPTE, puis on REFUSE, puis on ENREGISTRE --
 * et l'appelant ne depense qu'apres. Le jeton est donc consomme AVANT la
 * depense : si le fournisseur echoue ensuite, le jeton reste consomme, ce qui
 * est le sens voulu (une tentative compte). L'inverse -- enregistrer apres la
 * depense -- laisserait N appels concurrents passer avant le premier compte.
 */
export async function consommerJeton(params: {
  type: string;
  siteId: string | null;
  fenetreMs: number;
  plafond: number;
  message?: string;
  details?: Record<string, unknown>;
}): Promise<VerdictLimite> {
  const { type, siteId, fenetreMs, plafond, message, details } = params;
  const depuis = new Date(Date.now() - fenetreMs).toISOString();

  let requete = supabaseAdmin
    .from('checkout_anomalies')
    .select('id', { count: 'exact', head: true })
    .eq('type', type)
    .gte('created_at', depuis);

  // PERIMETRE EXPLICITE, JAMAIS IMPLICITE. Sans ce filtre, la limite d'un site
  // fermerait la route pour tous les autres -- un abuseur suffirait a couper
  // le service de tout le parc. `null` est un perimetre a part entiere (les
  // surfaces sans site, comme le blog central) et s'exprime par `is`.
  requete = siteId === null ? requete.is('site_id', null) : requete.eq('site_id', siteId);

  const { count, error } = await requete;

  if (error) {
    return { ok: false, statut: 503, erreur: 'Service momentanement indisponible.' };
  }
  if ((count ?? 0) >= plafond) {
    return { ok: false, statut: 429, erreur: message || 'Trop de requetes, reessayez plus tard.' };
  }

  await logAnomaly({ type, severity: 'info', siteId, details });
  return { ok: true };
}
