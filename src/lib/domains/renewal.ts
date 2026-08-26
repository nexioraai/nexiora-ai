import { supabaseAdmin } from '@/lib/supabase-admin';
import { updateAutoRenew } from '@/lib/domains/porkbun';
import { consignerEvenementDomaine, type OrigineEvenement } from '@/lib/domains/history';
import { logAnomaly } from '@/lib/anomaly';

// ============================================================
// F-2 -- L'ANNULATION D'UN ABONNEMENT DOMAINE ETAIT INERTE.
//
// LE DEFAUT, MESURE. Le webhook detectait un abonnement de domaine puis
// SORTAIT (`if (obj?.metadata?.nexiora_domain_id) break;`). Aucun statut ne
// changeait, aucun appel n'etait fait. Le client cessait de payer et le
// registraire continuait d'auto-renouveler AUX FRAIS DE DERIBFY, sans
// plafond, sans alerte, indefiniment.
//
// CE QUE « RESILIER » PEUT SIGNIFIER, ET RIEN DE PLUS. L'API du registraire
// n'expose AUCUN endpoint de suppression. Un domaine enregistre existe
// jusqu'a son expiration. Resilier = cesser le renouvellement et laisser
// expirer. Promettre une suppression immediate serait faux.
//
// L'ORDRE EST L'INVERSE DE CELUI DU RATTACHEMENT (D-05), ET C'EST DELIBERE.
// Au rattachement, la ressource rare est INTERNE (l'unicite du domaine) : on
// reserve d'abord, on agit dehors ensuite. Ici, la ressource rare est
// EXTERNE -- c'est le registraire qui decide si de l'argent sera preleve
// l'annee prochaine. Ecrire « resilie » en base avant d'avoir la confirmation
// du registraire produirait exactement le defaut qu'on corrige : une
// interface affirmant une resiliation pendant que le renouvellement continue.
// L'asymetrie des echecs commande l'ordre, pas une regle uniforme.
//
// AUCUN FAUX SUCCES. Un echec registraire laisse une trace explicite
// (`renewal_sync_error`) et remonte a l'appelant. L'etat « decide mais non
// confirme » est nomme, jamais silencieux.
// ============================================================

export type ResultatResiliation =
  | { ok: true; dejaResilie: boolean; expireLe: string | null }
  | { ok: false; raison: 'introuvable' | 'registraire' | 'base'; message: string };

/**
 * Arrete le renouvellement d'un domaine achete.
 *
 * IDEMPOTENT : un domaine deja resilie et confirme rend `dejaResilie: true`
 * sans rappeler le registraire. Un domaine resilie mais NON confirme
 * (`renewal_sync_error` renseigne) est REJOUE -- c'est precisement l'etat
 * qu'une reprise doit reconcilier.
 */
export async function resilierRenouvellement(params: {
  siteId: string;
  domain: string;
  origine: OrigineEvenement;
}): Promise<ResultatResiliation> {
  const { siteId, domain, origine } = params;

  const { data: ligne, error: erreurLecture } = await supabaseAdmin
    .from('site_domains')
    .select('id, status, auto_renew, renews_at, renewal_sync_error')
    .eq('site_id', siteId)
    .eq('domain', domain)
    .maybeSingle();

  // LA PANNE FERME : ne pas savoir si le domaine existe, c'est ne pas savoir
  // si l'on a quelque chose a resilier.
  if (erreurLecture) {
    return { ok: false, raison: 'base', message: erreurLecture.message };
  }
  if (!ligne) {
    return { ok: false, raison: 'introuvable', message: 'Aucun domaine achete pour ce site.' };
  }

  const row = ligne as {
    id: string;
    status: string;
    auto_renew?: boolean | null;
    renews_at?: string | null;
    renewal_sync_error?: string | null;
  };

  // Deja resilie ET confirme : rien a refaire.
  if (row.auto_renew === false && !row.renewal_sync_error) {
    return { ok: true, dejaResilie: true, expireLe: row.renews_at ?? null };
  }

  await consignerEvenementDomaine({
    siteId,
    domain,
    evenement: 'resiliation_demandee',
    origine,
    details: { domainId: row.id, status: row.status },
  });

  // 1. LE REGISTRAIRE D'ABORD. Lui seul decide si de l'argent sera preleve.
  try {
    await updateAutoRenew(domain, false);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // L'ETAT « DECIDE MAIS NON CONFIRME » EST NOMME. Sans cette trace, un
    // echec registraire serait indistinguable d'une resiliation reussie.
    await supabaseAdmin
      .from('site_domains')
      .update({ renewal_sync_error: message.slice(0, 500) })
      .eq('id', row.id);
    await consignerEvenementDomaine({
      siteId,
      domain,
      evenement: 'resiliation_echouee',
      origine,
      details: { domainId: row.id, error: message },
    });
    await logAnomaly({
      type: 'domain_renewal_cancel_failed',
      severity: 'blocked',
      siteId,
      details: { domain, domainId: row.id, error: message },
    });
    return { ok: false, raison: 'registraire', message };
  }

  // 2. L'ETAT INTERNE ENSUITE. Son echec ne coute pas d'argent : le
  //    renouvellement est deja arrete chez le registraire. Un rejeu de la
  //    resiliation rappellera `updateAutoRenew`, qui est idempotent.
  const { error: erreurEcriture } = await supabaseAdmin
    .from('site_domains')
    .update({
      auto_renew: false,
      renewal_cancelled_at: new Date().toISOString(),
      renewal_sync_error: null,
    })
    .eq('id', row.id);

  if (erreurEcriture) {
    await logAnomaly({
      type: 'domain_renewal_state_write_failed',
      severity: 'warning',
      siteId,
      details: { domain, domainId: row.id, error: erreurEcriture.message },
    });
    return { ok: false, raison: 'base', message: erreurEcriture.message };
  }

  await consignerEvenementDomaine({
    siteId,
    domain,
    evenement: 'resiliation_confirmee',
    origine,
    details: { domainId: row.id, expireLe: row.renews_at ?? null },
  });

  return { ok: true, dejaResilie: false, expireLe: row.renews_at ?? null };
}

// ============================================================
// AUDIT FINAL -- « COMMENT PERDRAIT-ON ENCORE UN DOMAINE ? »
//
// Par un clic. La resiliation etait a SENS UNIQUE : un marchand qui arretait
// le renouvellement par erreur -- ou qui changeait d'avis le lendemain --
// n'avait AUCUN moyen de revenir en arriere. Le domaine expirait, puis
// devenait rachetable par n'importe qui. Une operation destructrice sans
// annulation est une perte programmee.
//
// `updateAutoRenew` accepte les deux sens ; seule la moitie etait cablee.
// Reactiver ne coute rien et ne promet rien de faux : le domaine n'a pas
// encore expire, son renouvellement reprend simplement.
//
// CE QUE CELA NE FAIT PAS : ressusciter un domaine DEJA expire. Passe
// l'expiration, il quitte le compte et aucune API ne le rend. La reactivation
// n'a de sens que tant que le domaine vit -- c'est pourquoi elle ne promet
// rien au-dela.
// ============================================================
export async function reactiverRenouvellement(params: {
  siteId: string;
  domain: string;
  origine: OrigineEvenement;
}): Promise<ResultatResiliation> {
  const { siteId, domain, origine } = params;

  const { data: ligne, error: erreurLecture } = await supabaseAdmin
    .from('site_domains')
    .select('id, status, auto_renew, renews_at, renewal_sync_error')
    .eq('site_id', siteId)
    .eq('domain', domain)
    .maybeSingle();

  if (erreurLecture) return { ok: false, raison: 'base', message: erreurLecture.message };
  if (!ligne) return { ok: false, raison: 'introuvable', message: 'Aucun domaine achete pour ce site.' };

  const row = ligne as { id: string; auto_renew?: boolean | null; renews_at?: string | null; renewal_sync_error?: string | null };

  // Deja actif et confirme : rien a refaire.
  if (row.auto_renew !== false && !row.renewal_sync_error) {
    return { ok: true, dejaResilie: false, expireLe: row.renews_at ?? null };
  }

  // LE REGISTRAIRE D'ABORD, meme raison qu'a la resiliation : lui seul decide
  // si le renouvellement aura lieu.
  try {
    await updateAutoRenew(domain, true);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await logAnomaly({
      type: 'domain_renewal_reactivate_failed',
      severity: 'blocked',
      siteId,
      details: { domain, domainId: row.id, error: message },
    });
    return { ok: false, raison: 'registraire', message };
  }

  const { error: erreurEcriture } = await supabaseAdmin
    .from('site_domains')
    .update({ auto_renew: true, renewal_cancelled_at: null, renewal_sync_error: null })
    .eq('id', row.id);

  if (erreurEcriture) return { ok: false, raison: 'base', message: erreurEcriture.message };

  await consignerEvenementDomaine({
    siteId,
    domain,
    evenement: 'renouvellement',
    origine,
    details: { domainId: row.id, action: 'reactivation' },
  });

  return { ok: true, dejaResilie: false, expireLe: row.renews_at ?? null };
}
