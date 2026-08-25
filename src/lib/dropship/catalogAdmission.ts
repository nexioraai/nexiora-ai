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
