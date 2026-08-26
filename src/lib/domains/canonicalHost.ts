// ============================================================
// D-08 -- APEX ET WWW : LE CLIENT CONFIGURE LES DEUX, UN SEUL REPONDAIT.
//
// LE DEFAUT EST REEL ET ATTEIGNABLE, pas theorique. Les instructions DNS
// remises au marchand demandent DEUX enregistrements -- un `A` sur la racine
// et un `CNAME` sur `www`. Il les pose tous les deux, comme demande. Mais
// `sites.custom_domain` ne stocke QU'UNE seule valeur, et la resolution se
// fait par egalite stricte : la forme non stockee ne correspond a aucun site
// et repond 404. Le marchand a suivi les instructions a la lettre et la
// moitie de son trafic tombe.
//
// LE CANONIQUE EST CE QUI EST STOCKE, jamais une preference arbitraire.
// `resolveSiteBaseUrl` construit deja les URL publiques a partir de
// `custom_domain` : choisir autre chose ici ferait diverger les liens du
// sitemap, des donnees structurees et des redirections. Le stockage decide,
// ce module obeit.
//
// AUCUNE BOUCLE POSSIBLE, PAR CONSTRUCTION. La redirection ne part que d'un
// hote qui NE correspond a aucun site, vers un hote qui correspond a un site.
// La cible resout donc directement au tour suivant. Et la variante d'un hote
// n'est jamais cet hote lui-meme : `www.x` et `x` sont toujours distincts.
// ============================================================

/**
 * L'autre forme d'un hote : `www.exemple.com` <-> `exemple.com`.
 *
 * Rend `null` quand il n'y en a pas de sensee :
 *   * un hote vide ;
 *   * un hote qui EST deja `www.` sans rien derriere ;
 *   * un hote a une seule etiquette (`localhost`), qui n'a pas d'apex.
 */
export function varianteHote(hote: string): string | null {
  const h = (hote || '').trim().toLowerCase().replace(/\.+$/, '');
  if (!h) return null;

  if (h.startsWith('www.')) {
    const apex = h.slice(4);
    // `www.` seul, ou `www.` suivi d'une etiquette unique : aucune variante.
    return apex.includes('.') ? apex : null;
  }

  // Pas d'apex sans point : `localhost` n'a pas de `www.localhost` utile.
  if (!h.includes('.')) return null;
  return `www.${h}`;
}

/**
 * Construit la cible de redirection vers l'hote canonique, chemin et
 * parametres conserves.
 *
 * Le protocole est toujours `https` : un domaine personnalise n'est servi
 * qu'en HTTPS, et rediriger vers `http` degraderait la connexion.
 */
export function cibleCanonique(hoteCanonique: string, pathname: string, search: string): string {
  const chemin = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `https://${hoteCanonique}${chemin}${search || ''}`;
}
