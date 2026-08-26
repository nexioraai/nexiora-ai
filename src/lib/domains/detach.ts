import { supabaseAdmin } from '@/lib/supabase-admin';
import { removeDomainFromVercel } from '@/lib/domains/vercel';
import { logAnomaly } from '@/lib/anomaly';

// ============================================================
// D-03 / D-06 -- UNE SEULE IMPLEMENTATION DU DETACHEMENT.
//
// Deux surfaces en ont besoin, pour deux raisons differentes : le marchand qui
// detache volontairement son domaine, et l'archivage d'un site qui ne doit
// rien laisser derriere lui. Les ecrire deux fois, c'est garantir qu'elles
// divergeront -- le motif que ce depot combat depuis sept lots.
//
// LA DISTINCTION EST UNE QUESTION D'AUTORITE, PAS DE CONFORT :
//
//   * DOMAINE APPORTE. Deribfy n'en est que l'hebergeur. Le detacher est
//     entierement dans nos moyens, et c'est meme un devoir : sans cela le
//     domaine reste rattache chez l'hebergeur ET reserve dans nos controles
//     d'unicite -- irrevendicable par quiconque, y compris par son
//     proprietaire legitime.
//
//   * DOMAINE ACHETE VIA DERIBFY. Nous n'avons AUCUN pouvoir d'annuler un
//     enregistrement chez le registraire ni de transferer une propriete.
//     Le retirer de l'hebergeur couperait un domaine encore facture. On
//     detache donc le POINTEUR seul, et la ligne d'achat reste intacte : elle
//     porte la facturation et l'historique.
//
// IDEMPOTENT : sans domaine, l'operation reussit sans rien faire. Une reprise
// apres panne, une double soumission ou un archivage rejoue ne produisent ni
// erreur ni faux succes.
// ============================================================

export type ResultatDetachement =
  | { ok: true; detache: false; raison: 'aucun_domaine' }
  | { ok: true; detache: true; domaine: string; achete: boolean; retireHebergeur: boolean }
  | { ok: false; statut: 500 | 503 };

/**
 * Detache le domaine d'un site.
 *
 * @param siteId  identifiant du site — la propriete doit avoir ete tranchee
 *                AVANT l'appel, par l'autorite de l'appelant.
 * @param slug    utilise uniquement pour la tracabilite des anomalies.
 * @param domaineActuel  la valeur lue de `sites.custom_domain`.
 */
export async function detacherDomaine(
  siteId: string,
  slug: string | null,
  domaineActuel: string | null
): Promise<ResultatDetachement> {
  if (!domaineActuel) return { ok: true, detache: false, raison: 'aucun_domaine' };

  const { data: achete, error: erreurAchat } = await supabaseAdmin
    .from('site_domains')
    .select('id, status')
    .eq('site_id', siteId)
    .eq('domain', domaineActuel)
    .maybeSingle();

  // LA PANNE FERME. Ne pas savoir si le domaine est achete, c'est ne pas
  // savoir si l'on a le droit de le retirer de l'hebergeur.
  if (erreurAchat) return { ok: false, statut: 503 };

  const estAchete = !!achete && achete.status !== 'failed';

  // ORDRE VOULU : le pointeur d'abord. S'il tombe, rien n'a bouge dehors et
  // l'etat reste coherent.
  const { error: dbError } = await supabaseAdmin
    .from('sites')
    .update({
      custom_domain: null,
      custom_domain_google_status: null,
      custom_domain_google_token: null,
      custom_domain_google_attempts: null,
      custom_domain_google_last_attempt_at: null,
      custom_domain_google_last_error: null,
    })
    .eq('id', siteId);

  if (dbError) return { ok: false, statut: 500 };

  let retireHebergeur = false;
  if (!estAchete) {
    try {
      await removeDomainFromVercel(domaineActuel);
      retireHebergeur = true;
    } catch (e) {
      // Le pointeur est deja retire : le site ne repond plus sur ce domaine.
      // Un rattachement residuel chez l'hebergeur est SIGNALE, jamais masque.
      await logAnomaly({
        type: 'domain_detach_host_failed',
        severity: 'warning',
        siteId,
        slug,
        details: { domain: domaineActuel, error: e instanceof Error ? e.message : String(e) },
      });
    }
  }

  return { ok: true, detache: true, domaine: domaineActuel, achete: estAchete, retireHebergeur };
}
