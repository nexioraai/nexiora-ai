import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAnomaly } from '@/lib/anomaly';

// ============================================================
// P1 -- L'HISTORIQUE, ET CE QU'IL N'EST PAS.
//
// LE POINTEUR COURANT ET L'HISTORIQUE SONT DEUX CONCEPTS DISTINCTS.
// `sites.custom_domain` repond « quel domaine sert ce site MAINTENANT » et
// doit rester une valeur unique, lisible en une requete. Ce journal repond
// « que s'est-il passe » -- il ne le remplace pas, il le complete.
//
// LE TROU QUE CELA FERME. `sites.custom_domain` est ECRASE a chaque
// changement : un marchand qui change trois fois de domaine ne laissait
// AUCUNE trace des deux premiers. Ni audit, ni facturation, ni redirection
// ancien -> nouveau possibles.
//
// SOBRIETE DELIBEREE. Aucune donnee personnelle n'est ecrite : ni contact, ni
// adresse, ni e-mail. Un nom de domaine et un identifiant de site suffisent a
// repondre aux quatre questions d'audit (quel domaine, quel site, quand,
// quelle transition). C'est cette sobriete qui rend le journal compatible
// avec une obligation d'effacement portant sur un compte -- « conserver pour
// toujours » et « droit a l'effacement » ne se concilient pas autrement.
//
// NE BLOQUE JAMAIS UN PARCOURS. Un journal d'audit qui fait echouer une
// operation metier transforme une trace manquante en panne. L'echec est donc
// SIGNALE (anomalie), jamais propage. C'est l'inverse exact du choix fait
// pour la resiliation, ou l'echec doit remonter : une garde qui ne peut pas
// ecrire son etat doit refuser, un journal non.
// ============================================================

export type EvenementDomaine =
  | 'achat_demande'
  | 'achat_confirme'
  | 'rattachement'
  | 'detachement'
  | 'changement'
  | 'provisionnement'
  | 'renouvellement'
  | 'resiliation_demandee'
  | 'resiliation_confirmee'
  | 'resiliation_echouee';

export type OrigineEvenement = 'marchand' | 'archivage' | 'webhook' | 'cron' | 'operateur';

/**
 * Consigne un evenement de domaine. Ne leve jamais.
 *
 * @param details  contexte NON personnel uniquement (statuts, identifiants
 *                 techniques, messages d'erreur fournisseur).
 */
export async function consignerEvenementDomaine(params: {
  siteId: string | null;
  domain: string;
  evenement: EvenementDomaine;
  origine: OrigineEvenement;
  details?: Record<string, unknown>;
}): Promise<void> {
  const { siteId, domain, evenement, origine, details = {} } = params;
  try {
    const { error } = await supabaseAdmin.from('site_domain_events').insert({
      site_id: siteId,
      domain,
      evenement,
      origine,
      details,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    // Tant que la migration n'est pas appliquee, cette voie est le
    // comportement NORMAL et attendu -- pas une panne.
    await logAnomaly({
      type: 'domain_history_write_failed',
      severity: 'info',
      siteId,
      details: { domain, evenement, origine, error: e instanceof Error ? e.message : String(e) },
    });
  }
}
