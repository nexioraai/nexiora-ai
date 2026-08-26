// ============================================================
// D-07 -- LES DOMAINES DE LA PLATEFORME NE PEUVENT PAS DEVENIR DES DOMAINES
// CLIENTS.
//
// CE QUI MANQUAIT. Ni le rattachement BYOD ni l'achat ne verifiaient quoi que
// ce soit : seule l'unicite etait controlee. Un client pouvait donc tenter de
// revendiquer le domaine de la plateforme, ou l'un de ses sous-domaines. Le
// rattachement chez l'hebergeur aurait echoue (le domaine y est deja), mais
// l'echec serait survenu APRES l'appel externe et avec un message technique
// incomprehensible -- et surtout, rien ne le garantissait.
//
// LISTE FERMEE, PAS UNE HEURISTIQUE. Ce module ne bloque QUE des domaines
// nommement designes et leurs sous-domaines. Aucun motif vague, aucun
// blocage de domaines clients legitimes : `mondomaine-deribfy.com` n'est pas
// reserve, et ne doit pas l'etre.
//
// FAIL-CLOSED SUR L'ENTREE. Une valeur qui n'est pas une chaine exploitable
// est traitee comme reservee : on ne laisse pas passer ce qu'on ne sait pas
// lire. Les routes valident la forme avant, cette garde est la seconde ligne.
// ============================================================

/**
 * Les racines reservees. Un domaine est refuse s'il EST l'une d'elles ou s'il
 * en est un sous-domaine.
 *
 * `deribfy.com` : domaine principal, sert la plateforme, les sites clients par
 * chemin, le blog et l'expedition des e-mails.
 */
const RACINES_RESERVEES = ['deribfy.com'] as const;

/**
 * Normalise un domaine avant comparaison.
 *
 * Trois pieges reels et distincts :
 *   * la casse -- `DERIBFY.COM` designe le meme domaine ;
 *   * le point final -- `deribfy.com.` est la forme absolue, valide en DNS ;
 *   * les espaces -- un copier-coller en apporte presque toujours.
 */
export function normaliserDomaine(valeur: unknown): string {
  if (typeof valeur !== 'string') return '';
  return valeur.trim().toLowerCase().replace(/\.+$/, '');
}

/** Ce domaine appartient-il a la plateforme ? */
export function estDomaineReserve(valeur: unknown): boolean {
  const d = normaliserDomaine(valeur);
  // Fail-closed : rien d'exploitable -> refuse.
  if (!d) return true;
  return RACINES_RESERVEES.some((racine) => d === racine || d.endsWith('.' + racine));
}

/** Les racines reservees, pour les tests et l'affichage. Copie defensive. */
export function racinesReservees(): string[] {
  return [...RACINES_RESERVEES];
}
