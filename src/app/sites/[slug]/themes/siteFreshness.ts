// ============================================================
// DEBT-034 -- UNE SEULE AUTORITE POUR « QUAND CE SITE A-T-IL CHANGE ? ».
//
// TROIS SURFACES publient cette date et se rabattaient TOUTES sur
// `created_at`, faute de mieux :
//   * `JsonLd.tsx`                        -> `dateModified`
//   * `llms.txt/route.ts`                 -> « derniere mise a jour »
//   * `internal/site-sitemap/[slug]`      -> `<lastmod>`
// Les chantiers 3 a 8 ont ouvert a l'agent `lang`, `faq`, `whyus`,
// `area_served`, `price_range`, la galerie, les produits et les sections :
// AUCUNE de ces modifications n'etait visible d'un crawler. Le sitemap
// aggravait le cas en declarant `changefreq: daily` a cote d'un `lastmod`
// fige a la creation du site.
//
// Mode 1 est le mode dont la valeur produit EST d'etre trouve.
//
// POURQUOI UN MODULE A PART, ET NON UNE FONCTION DE `shared.tsx`.
// Deux raisons, la seconde mesuree :
//
//   1. `shared.tsx` importe `@/lib/supabase`. Une fonction PURE, sans aucune
//      dependance, n'a rien a faire dans un module qui traine un client de
//      base de donnees -- tout appelant paierait cet import pour trois
//      lignes.
//   2. Les deux suites de tests des routes concernees simulent `shared.tsx`
//      par un mock ENUMERATIF (`vi.mock(spec, () => ({ fetchSite, ... }))`).
//      Y ajouter un export a casse d'un coup leurs 29 tests : la route
//      importait une fonction que le mock ne fournissait pas. Passer par
//      `importOriginal` ne marche pas non plus -- il charge `shared.tsx`
//      donc `@/lib/supabase`, qui exige des variables d'environnement
//      absentes du banc. Extraire la fonction supprime le probleme au lieu
//      de le contourner : les mocks existants restent justes, sans une ligne
//      de changement.
//
// LE REPLI N'EST PAS UN DEFAUT DE CONCEPTION, c'est ce qui rend le code SUR
// DANS LES DEUX ETATS DU SCHEMA. Tant que `supabase/sql/sites_updated_at.sql`
// n'est pas execute, la colonne n'existe pas, `updated_at` vaut `undefined`,
// et le comportement est rigoureusement celui d'avant. Une fois execute, le
// backfill vaut `created_at` : rien ne change non plus tant qu'aucune
// modification reelle n'a eu lieu.
//
// NE NORMALISE PAS LE FORMAT, deliberement : chaque surface a le sien
// (`dateModified` brut, date seule pour `llms.txt`, ISO complet pour le
// sitemap). Imposer un format ici en changerait trois d'un coup.
// ============================================================

/** Le strict minimum lu -- ni un site complet, ni une ligne de base. */
export type SiteFreshnessInput = {
  updated_at?: string | null;
  created_at?: string | null;
};

/**
 * La date que les surfaces publiques doivent publier, ou `undefined` si le
 * site n'en porte aucune -- auquel cas chaque surface applique son propre
 * comportement d'absence, qui n'a pas bouge.
 *
 * `??` et non `||` : une chaine vide est une donnee absente, pas une date, et
 * doit tomber sur le repli -- mais `null` et `undefined` seuls declenchent le
 * `??`. La normalisation du vide appartient a la base, pas ici : inventer une
 * regle de plus a cet endroit ferait diverger les trois surfaces qu'on vient
 * de reunir.
 */
export function resolveSiteFreshness(site: SiteFreshnessInput): string | undefined {
  return site.updated_at ?? site.created_at ?? undefined;
}
