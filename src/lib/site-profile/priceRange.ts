// ============================================================
// CHANTIER 5 (MODE 1) -- `price_range` : UN CONTRAT QUI N'EN ETAIT PAS UN.
//
// CE QUI EXISTAIT, MESURE. Le contrat « $ | $$ | $$$ | $$$$ » ne vivait qu'a
// UN endroit : une phrase du prompt de generation
// (`chat/route.ts:465` -- « one of "$", "$$", "$$$", or "$$$$" »). Cote
// validation, le schema zod dit `priceRange: z.string()` : n'importe quelle
// chaine passe. Le contrat etait une CONSIGNE AU MODELE, jamais une regle.
// Il tenait parce que rien ni personne ne pouvait ecrire cette colonne --
// ni l'editeur, ni l'agent, ni le PATCH de `sites/[slug]`.
//
// Ouvrir l'ecriture a l'agent supprime cette protection par l'absence.
// « Sur par absence de donnee » n'a jamais ete une propriete de securite :
// le contrat devient donc une allowlist executee, ici.
//
// CE MODULE NE RETRO-VALIDE RIEN. Les lignes deja en base ne sont pas
// touchees : `JsonLd` et `NoirTheme` continuent d'afficher ce qu'elles
// portent. Retro-valider casserait des sites en production pour une valeur
// qu'aucun chemin d'ecriture actuel n'a produite.
// ============================================================

/** Les quatre valeurs du contrat, dans l'ordre croissant. */
export const PRICE_RANGE_VALUES = ['$', '$$', '$$$', '$$$$'] as const;

/**
 * Allowlist positive, `Set.has`, jamais une negation -- meme forme que
 * `TRANSACTING_SITE_MODES`, `CATALOG_SITE_MODES` et `SUPPORTED_LANGUAGE_CODES`.
 */
const VALUES = new Set<unknown>(PRICE_RANGE_VALUES);

/**
 * PORTE D'ECRITURE -- fail-closed et stricte. `'$$ '`, `'€€'`, `'$$$$$'`,
 * `'moyen'`, une non-chaine : tous refuses. Aucun `trim` de complaisance :
 * la valeur vient d'un enum ferme cote outil, pas d'une saisie humaine.
 *
 * `schema.org/priceRange` accepte du texte libre ; c'est NOTRE contrat qui
 * est plus strict que la norme, pour que les quatre valeurs restent
 * comparables entre sites et affichables telles quelles par `NoirTheme`.
 */
export function isSupportedPriceRange(value: unknown): boolean {
  return typeof value === 'string' && VALUES.has(value);
}
