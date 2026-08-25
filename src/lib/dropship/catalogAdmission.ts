import 'server-only';

// ============================================================
// ETAPE 2 -- L'ADMISSION AU CATALOGUE FOURNISSEUR.
//
// UNE QUATRIEME FRONTIERE, et il fallait la nommer. Le depot en portait deja
// trois, chacune avec son autorite :
//   ADMISSION AU COMMERCE  `canTransact`               « a-t-il le droit de vendre ? »
//   ROUTAGE                `resolveFulfillmentDomain`  « qui execute la vente ? »
//   AFFICHAGE/FACTURATION  `modeCapabilities`          « que montre-t-on, et comment facture-t-on le port ? »
//   CATALOGUE (ici)                                    « ce site a-t-il un catalogue fournisseur ? »
//
// AUCUNE DES TROIS AUTRES NE POUVAIT REPONDRE.
//   * `canTransact` admet le mode 2, qui n'a pas de catalogue fournisseur :
//     trop grossiere. Et son module s'interdit lui-meme de connaitre un
//     fournisseur -- « CE QUE CE MODULE N'A PAS LE DROIT DE CONNAITRE : ...
//     un identifiant fournisseur ».
//   * `resolveFulfillmentDomain` coincide aujourd'hui, mais son contrat dit
//     « appele UNE FOIS, a la creation de la commande ». S'en servir pour
//     garder un catalogue melangerait ROUTAGE et ADMISSION AU CATALOGUE --
//     deux questions qui coincident sans etre la meme.
//   * `suppliersForDropshipType` repond « QUELS fournisseurs », jamais
//     « ce site en a-t-il un ».
//
// CE QU'ELLE FERME. Trois routes catalogue posaient la meme question avec
// trois reponses differentes : `curate` refusait en 400, `image-search`
// rendait un resultat vide en 200, et `search` ne la posait PAS DU TOUT.
// Consequence mesuree sur `search` : `suppliersForDropshipType(null)` retombe
// sur `['cj']`, si bien qu'un site Mode 1 ou 2 dont on connait le slug
// obtenait le catalogue CJ. Aucun client legitime n'etait concerne --
// `CatalogSearch` n'est rendu que pour le mode 3 -- mais la route, elle,
// repondait.
//
// ALLOWLIST POSITIVE, meme forme que `TRANSACTING_SITE_MODES`. Un mode absent
// de cette liste n'a pas de catalogue : il ne peut pas en heriter par
// accident, et l'y inscrire sera une decision d'une ligne, visible en diff.
//
// `siteMode: unknown`, comme les deux autres primitives : la valeur vient
// d'une colonne, pas d'un contrat TypeScript. `Set.has` compare strictement --
// la chaine '3' n'est pas le nombre 3, et `null` n'est rien.
// ============================================================

/** Les modes de site qui disposent d'un catalogue fournisseur. */
const CATALOG_SITE_MODES = new Set<unknown>([3]);

/**
 * Ce site dispose-t-il d'un catalogue fournisseur a interroger ?
 *
 * NE DECIDE RIEN D'AUTRE. Ni quels fournisseurs (c'est
 * `suppliersForDropshipType`), ni si le site a le droit de vendre (c'est
 * `canTransact`), ni qui executera la commande (c'est `order-domain`).
 *
 * FAIL-CLOSED par construction : `null`, `undefined`, `0`, `2`, `4`, `'3'`,
 * `NaN`, un objet -- tout ce qui n'est pas litteralement inscrit ci-dessus
 * obtient `false`. Il n'existe aucun chemin par lequel une valeur inattendue
 * ouvre un catalogue.
 */
export function hasSupplierCatalog(siteMode: unknown): boolean {
  return CATALOG_SITE_MODES.has(siteMode);
}

// ============================================================
// LOT 2 -- LE MECANISME DE SELECTION, DISTINCT DU CATALOGUE LUI-MEME.
//
// CE QUE LE LOT 2 A DU FALSIFIER D'ABORD. Une premiere analyse concluait que
// `pod_brand` n'avait « pas de catalogue » et qu'il fallait donc lui retirer
// ses fournisseurs. C'ETAIT FAUX, et le depot l'a demontre : ses produits
// SONT des produits catalogue Printful. `mockupsToProducts` (themes/shared)
// emet `catalog-${catalog_product_id}::${variant_id}`, `pod-fulfill`
// n'execute QUE des lignes `catalog-*`, et aucun site Mode 3 en production ne
// possede le moindre `shop_products`. Vider ses fournisseurs aurait refuse
// 100 % des ventes `pod_brand` au checkout. Six tests, dont le banc protege
// A7, l'ont tue.
//
// LA VRAIE LIGNE N'EST PAS LE FOURNISSEUR, C'EST LA SOURCE DE LA SELECTION :
//
//   reseller, pod_custom -> les produits viennent de `site_catalog_selections`
//                           (curation, approbation, recherche visiteur)
//   pod_brand            -> les produits viennent de `sites.pod_designs[].mockups`
//                           (mockups generes sur le design du marchand)
//
// Les DEUX aboutissent a des produits `catalog_products` et a des ids
// `catalog-*`. Confondre « produit catalogue » et « selection catalogue »
// est l'erreur qui a produit toute la divergence du LOT 2.
//
// POURQUOI ICI ET PAS DANS UN MODULE NEUF. C'est la MEME question que
// `hasSupplierCatalog` -- « ce site a-t-il un catalogue a curer ? » -- posee
// une granularite plus bas. Trois couches y repondaient deja correctement et
// SEPAREMENT (`CATALOG_SUBTYPES` pour les outils, `shared.tsx` pour la
// vitrine, `showsVisitorCatalogSearch` pour la barre de recherche) ; ce qui
// manquait n'etait pas une autorite de plus, c'etait l'admission d'API. Elle
// appartient a ce module, qui la porte deja pour le mode.
//
// CE QU'ELLE NE DECIDE PAS. Ni quels fournisseurs -- c'est
// `suppliersForDropshipType`, qui reste INCHANGE et qui confine legitimement
// `pod_brand` a Printful/Gelato (un `catalog_product_id` CJ force dans
// `pod_designs`, colonne ecrivable par le marchand, y est refuse). Ni ce que
// l'agent a le droit de faire -- c'est `CATALOG_SUBTYPES`.
//
// IMBRIQUEE, JAMAIS INDEPENDANTE : le sous-type n'est consulte qu'une fois le
// mode admis. `dropship_type` ne decide jamais seul.
// ============================================================

/**
 * Les sous-types dont les produits proviennent de `site_catalog_selections`.
 *
 * `pod_brand` en est absent : ses produits proviennent de ses mockups. Ce
 * n'est pas une restriction qu'on lui impose, c'est une description de son
 * pipeline -- et la raison pour laquelle les outils de curation ne lui ont
 * jamais ete accordes.
 */
const CATALOG_SELECTION_SUBTYPES = new Set<unknown>(['reseller', 'pod_custom']);

/**
 * Ce site utilise-t-il le mecanisme `site_catalog_selections` ?
 *
 * FAIL-CLOSED sur les deux axes : un mode non admis, un sous-type absent,
 * `null`, `''`, une valeur inconnue -- aucun n'ouvre le mecanisme. Deux
 * allowlists positives, aucune negation.
 */
export function usesCatalogSelections(siteMode: unknown, dropshipType: unknown): boolean {
  return hasSupplierCatalog(siteMode) && CATALOG_SELECTION_SUBTYPES.has(dropshipType);
}
