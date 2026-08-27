// src/app/sites/[slug]/themes/catalogSearchVisibility.ts
//
// ============================================================
// LOT 1 / L1-02 -- LA BARRE DE RECHERCHE VISITEUR, DECIDEE UNE FOIS.
//
// LE DEFAUT MESURE. Trois surfaces montaient `CatalogSearch` avec la MEME
// expression ecrite trois fois, et cette expression etait une NEGATION :
//   sites/[slug]/page.tsx   `site.dropship_type !== 'pod_brand'`
//   preview/[slug]/page.tsx `site.dropship_type !== 'pod_brand'`
//   AuroraTheme.tsx         `site.dropship_type !== 'pod_brand'`
// Une negation fait du catalogue le comportement PAR DEFAUT : un sous-type
// ABSENT (`null`) y passait, et un sous-type ajoute demain y passerait aussi
// sans que personne l'ait decide. C'est la meme faute de forme que l'etape A
// a defaite dans `modeCapabilities.ts`, au meme endroit du systeme.
//
// CE QUE LA NEGATION PRODUISAIT REELLEMENT, mesure en production : les trois
// sites Mode 3 sans sous-type montaient la barre de recherche et annoncaient
// donc un catalogue -- alors que `loadCatalogSelections` (shared.tsx), qui
// utilise DEJA la liste positive ci-dessous, ne leur chargeait rien et que
// leur agent ne recevait ni guidance ni outil de curation. Une capacite
// affichee que rien en dessous ne pouvait honorer.
//
// ALLOWLIST POSITIVE. `null`, `undefined`, `''`, `'RESELLER'`, un sous-type
// inconnu : aucun n'ouvre la barre de recherche. Fail-closed, sans qu'aucune
// ligne ait a le prevoir.
//
// POURQUOI PAS `CATALOG_SUBTYPES` (toolCapabilities) NI `subtypeAdmission`.
// Les membres coincident, les QUESTIONS non : l'une repond « quels
// sous-types donnent des OUTILS DE CURATION a l'agent du marchand », l'autre
// « quelle valeur est ECRIVABLE ». Celle-ci repond « quelle surface VISITEUR
// est montee ». Le depot tient cette regle depuis l'etape A -- « la
// coincidence de valeur n'est PAS une dependance » -- et l'importer ferait
// entrer le domaine fournisseur, ou le chemin d'ecriture, dans une decision
// de RENDU. Ces regles doivent pouvoir diverger sans se contredire.
//
// POURQUOI PAS DANS `modeCapabilities.ts`. Son domaine lui INTERDIT
// explicitement `dropship_type` (« la surface boutique ne descend jamais a ce
// niveau »). Cette regle-ci descend au sous-type : elle lui est voisine, pas
// interne.
//
// CE MODULE NE CONNAIT PAS LE MODE, DELIBEREMENT. La garde de mode reste
// chez l'appelant -- c'est elle qui distingue aujourd'hui les trois surfaces
// (deux la portent, `AuroraTheme` ne la porte pas : DEBT-048, hors LOT 1).
// La deplacer ici resoudrait cette dette par effet de bord et effacerait la
// difference que le LOT 2 doit examiner.
// ============================================================

/** Les sous-types dont la vitrine expose une recherche catalogue au visiteur. */
const VISITOR_CATALOG_SEARCH_SUBTYPES = new Set<unknown>(['reseller', 'pod_custom']);

/**
 * Ce sous-type monte-t-il la barre de recherche catalogue ?
 *
 * `unknown` : la valeur vient de `sites.dropship_type`, pas d'un contrat
 * TypeScript. `Set.has` compare strictement.
 */
export function showsVisitorCatalogSearch(dropshipType: unknown): boolean {
  return VISITOR_CATALOG_SEARCH_SUBTYPES.has(dropshipType);
}
