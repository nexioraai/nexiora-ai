// src/lib/mode3/podBrandMockups.ts
//
// ============================================================
// LOT 3 -- LES DEUX REGLES DE CONTENU DE `sites.pod_designs`.
//
// POURQUOI CE MODULE EXISTE : UNE DIVERGENCE DEMONTREE, PAS UNE PREFERENCE.
//
// La contre-verification du LOT 3 a execute le module reel et prouve que la
// vitrine et le checkout ne designaient PAS la meme maquette :
//
//   designs[0] : maquette de `cp-X`, `design_url` = ANCIENNE url  (perimee)
//   designs[1] : maquette de `cp-X`, `design_url` = url du design (fraiche)
//
//   vitrine  -> ecarte la perimee, affiche celle de designs[1]
//   checkout -> `flatMap(...).find(...)` rencontre la perimee EN PREMIER
//
// Le visiteur voyait le design B et le fournisseur recevait le design A. Le
// premier correctif du LOT 3 avait aligne l'ORDRE de parcours mais pas les
// FILTRES -- la vitrine en applique deux que le checkout n'avait pas.
//
// ALIGNER PAR CONSTRUCTION, PAS PAR COPIE. Deux implementations de la meme
// regle metier finissent toujours par diverger : c'est litteralement ce qui
// vient d'arriver. La regle est donc ECRITE UNE FOIS et consommee par les
// deux couches. Ce n'est pas une autorite nouvelle : aucune des autorites
// existantes -- `subtypeAdmission`, `CATALOG_SUBTYPES`,
// `suppliersForDropshipType`, `usesCatalogSelections`,
// `showsVisitorCatalogSearch` -- ne repond a « quelle maquette est vendable »
// ni a « ce design appartient-il a ce site ». C'est l'extraction d'une regle
// qui existait deja, pas l'invention d'une regle nouvelle.
//
// AUCUN `server-only` : la vitrine (`themes/shared.tsx`) est dans le bundle
// CLIENT -- `NoirTheme` et `StorefrontDense` portent 'use client' -- et un
// test de caracterisation lui interdit explicitement d'importer
// `server-only`. Ce module ne fait que du calcul pur : ni requete, ni secret.
// ============================================================

export type PodDesign = {
  url?: unknown;
  mockups?: unknown;
  [k: string]: unknown;
};

export type PodBrandMockup = {
  catalog_product_id?: unknown;
  design_url?: unknown;
  [k: string]: unknown;
};

/** Une maquette vendable, et le design dont elle provient. */
export type SellableMockup = {
  design: PodDesign;
  mockup: PodBrandMockup;
  /** `catalog_product_id`, normalise en chaine : c'est la cle du panier. */
  catalogProductId: string;
};

/**
 * LES MAQUETTES REELLEMENT VENDABLES, DANS L'ORDRE NORMATIF.
 *
 * TROIS REGLES, ET ELLES SONT METIER, PAS TECHNIQUES :
 *
 *   1. UNE MAQUETTE PERIMEE N'EST PAS VENDABLE. Une maquette porte le
 *      `design_url` pour lequel elle a ete rendue (capture a la creation de
 *      la tache Printful -- voir `pod/generate-mockups`). Si ce design n'est
 *      plus celui du design qui la porte, l'image montre un visuel que le
 *      marchand a abandonne. La vendre ferait fabriquer l'ancien.
 *      Tolerant a l'absence : une maquette sans `design_url`, ou un design
 *      sans `url`, n'est pas declaree perimee -- on ne sait pas, on ne
 *      l'ecarte pas. Comportement d'origine de la vitrine, conserve.
 *
 *   2. SANS `catalog_product_id`, IL N'Y A RIEN A VENDRE. C'est la cle du
 *      panier et la ligne de `catalog_products` qui porte le prix, le
 *      fournisseur et le `supplier_product_id`.
 *
 *   3. UN PRODUIT CATALOGUE = UNE SEULE MAQUETTE. Deux designs peuvent
 *      porter une maquette du meme produit ; leurs deux cartes auraient le
 *      meme id de panier et le checkout ne pourrait pas savoir laquelle
 *      vendre. La premiere rencontree gagne -- deterministe, et identique
 *      des deux cotes puisqu'il n'y a qu'une implementation.
 *
 * L'ORDRE EST CELUI DU TABLEAU `pod_designs`, jamais un index code en dur :
 * la convention « le premier est le design ACTIF » decide de la GENERATION,
 * pas de ce qui reste vendable. Les designs precedents gardent leurs
 * maquettes et restent vendables, chacune avec son propre `design_url`.
 */
export function sellablePodBrandMockups(podDesigns: unknown): SellableMockup[] {
  const designs = Array.isArray(podDesigns) ? (podDesigns as PodDesign[]) : [];
  const out: SellableMockup[] = [];
  const vus = new Set<string>();
  for (const design of designs) {
    const mockups = Array.isArray(design?.mockups) ? (design.mockups as PodBrandMockup[]) : [];
    for (const mockup of mockups) {
      if (mockup?.design_url && design?.url && mockup.design_url !== design.url) continue;
      if (!mockup?.catalog_product_id) continue;
      const catalogProductId = String(mockup.catalog_product_id);
      if (vus.has(catalogProductId)) continue;
      vus.add(catalogProductId);
      out.push({ design, mockup, catalogProductId });
    }
  }
  return out;
}

/** La maquette vendable d'un produit catalogue donne, ou `undefined`. */
export function findSellablePodBrandMockup(
  podDesigns: unknown,
  catalogProductId: string
): SellableMockup | undefined {
  return sellablePodBrandMockups(podDesigns).find((s) => s.catalogProductId === catalogProductId);
}

/**
 * CE DESIGN APPARTIENT-IL A CE SITE ?
 *
 * `sites.pod_designs` figure dans le `GRANT UPDATE` des 41 colonnes : le
 * marchand ecrit `url` et `mockups[].design_url` DIRECTEMENT en PostgREST,
 * sans passer par aucune route serveur. Sans cette regle, il peut designer
 * n'importe quelle image publique -- dont le design d'une AUTRE boutique --
 * et la plateforme, qui AVANCE le cout fournisseur, la fait fabriquer.
 *
 * `pod_custom` dispose de `design_uploads` (table dediee, `site_id`, usage
 * unique, RLS). `pod_brand` n'a pas d'equivalent : cette regle en pose le
 * minimum SANS schema nouveau. Le prefixe est LU du code, pas invente -- les
 * deux ecritures reelles dans le bucket le construisent ainsi :
 *   `edit/[slug]/page.tsx`        -> upload sous `${slug}/…`
 *   `pod/generate-mockups`        -> upload sous `${slug}/…`
 *
 * UNE SEULE DEFINITION DU FORMAT, consommee aux deux points ou l'URL coute
 * de l'argent : la generation de maquette (appel Printful facture) et le
 * checkout (fabrication reelle).
 *
 * FAIL-CLOSED : absence d'URL, absence de slug, URL hors prefixe -- tout
 * rend `false`.
 */
export function isOwnPodDesignUrl(designUrl: unknown, slug: unknown): boolean {
  if (typeof designUrl !== 'string' || designUrl.length === 0) return false;
  if (typeof slug !== 'string' || slug.length === 0) return false;
  return designUrl.includes(`/pod-designs/${slug}/`);
}
