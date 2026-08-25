// src/app/sites/[slug]/themes/variantRequirement.ts
//
// ============================================================
// LOT 4 / R4-02 -- « CE PRODUIT PEUT-IL ETRE MIS AU PANIER ? »
//
// POURQUOI CE MODULE EXISTE : UNE DIVERGENCE DEMONTREE, PAS UNE PREFERENCE.
//
// Les trois surfaces d'achat d'un produit catalogue -- la modale de la
// recherche visiteur, la modale de la vitrine, et la fiche produit --
// portaient chacune leur copie de la meme condition, ecrite comme un PROXY :
//
//     variants.length > 0 && !selectedVariant
//
// « il y a des options, donc il faut en choisir une ». Le proxy s'effondre
// quand la liste revient VIDE : rupture totale de stock, ou erreur avalee par
// `/api/catalog/variants`, qui rend `{variants: []}` dans les deux cas. Le
// bouton s'activait alors pour un produit dont l'identifiant de panier
// n'aurait aucune variante -- et que le checkout refuse depuis ce meme lot
// (garde `catalogStock`). Bouton actif, refus garanti.
//
// LA CORRECTION INITIALE DU LOT 4 PORTAIT ENCORE CE PROXY sur la fiche
// produit ; la contre-verification l'a trouve. Trois copies d'une regle
// finissent par diverger : c'est precisement ce qui venait d'arriver, et ce
// que le LOT 3 avait deja demontre sur les maquettes POD. La regle est donc
// ecrite UNE FOIS et consommee par les trois surfaces.
//
// CE N'EST PAS UNE AUTORITE CONCURRENTE. La regle NORMATIVE est cote serveur,
// dans `lib/mode3/catalogStock.ts` : elle est incontournable et c'est elle qui
// refuse. Ce module en est le MIROIR CLIENT -- meme patron que
// `modeCapabilities.ts`, miroir client de `CheckoutPolicy`, et pour la meme
// raison : `catalogStock` porte `server-only`, une surface d'achat ne peut pas
// l'importer. Il ne decide rien de nouveau : il evite d'offrir un bouton que
// le serveur refusera.
//
// LOT 5 -- CE MODULE PORTE AUSSI « UN DESIGN EST-IL EXIGE ? ». Meme raison
// qu'au LOT 4 : la question se pose a l'identique sur les trois surfaces
// d'achat, et trois copies d'une regle finissent toujours par diverger. La
// regle NORMATIVE reste cote serveur (checkout puis `pod-fulfill`) ; ce
// module evite d'offrir un bouton que le serveur refusera.
//
// LA SOURCE DU SIGNAL EST LA DONNEE, PAS UNE HEURISTIQUE.
// `requiresVariant` derive de `catalog_products.supplier_parent_id` : une
// ligne SANS parent designe un PRODUIT (mesure : CJ, 25 006 lignes, 100 %),
// une ligne AVEC parent EST deja une variante (Printful 8 392, Gelato 182 :
// 0 %). C'est ce qui preserve `pod_brand` et `pod_custom`.
// ============================================================

/**
 * Un choix de variante est-il exige avant de pouvoir acheter ?
 *
 * @param requiresVariant  vient de la donnee (`supplier_parent_id` absent).
 *                         `undefined` pour un produit sans fournisseur
 *                         (Mode 2, maquettes POD) : jamais exige.
 * @param variantesConnues nombre de variantes reellement proposees.
 *
 * LA DISJONCTION EST VOULUE. `requiresVariant` seul ne suffit pas : un
 * produit Printful/Gelato peut malgre tout exposer des options, et il serait
 * faux de laisser acheter sans choisir. `variantesConnues > 0` seul ne suffit
 * pas non plus -- c'est exactement le proxy qui a echoue.
 */
export function choixDeVarianteRequis(
  requiresVariant: boolean | undefined,
  variantesConnues: number
): boolean {
  return requiresVariant === true || variantesConnues > 0;
}

/**
 * Ce produit est-il achetable en l'etat ?
 *
 * FAIL-CLOSED PENDANT LE CHARGEMENT : tant que les variantes ne sont pas
 * connues, aucun achat. Sans cela, une fenetre de clic laisse ajouter au
 * panier un article sans variante -- que le serveur refusera.
 */
export function achatPossible(params: {
  requiresVariant?: boolean;
  variantesConnues: number;
  varianteChoisie: string | null;
  chargementEnCours: boolean;
  /**
   * LOT 5 / P5-02 -- ce produit exige-t-il un design du visiteur ?
   * `true` uniquement pour `pod_custom` : c'est la definition meme du
   * sous-mode -- le visiteur cree SON produit. `undefined` partout ailleurs,
   * donc comportement rigoureusement inchange.
   */
  designRequis?: boolean;
  /** Nombre de designs valides deja televerses par le visiteur. */
  designsFournis?: number;
}): boolean {
  if (params.chargementEnCours) return false;
  // LOT 5 / P5-02 -- DECISION PRODUIT : un support POD `pod_custom` n'est PAS
  // achetable nu. Ni la modale, ni la fiche produit, ni le checkout ne
  // l'autorisaient explicitement -- ils ne l'interdisaient simplement pas, et
  // `pod-fulfill` envoyait alors `files: []` : le fournisseur fabriquait un
  // BLANC, aux frais de la plateforme qui avance le cout. La guidance du
  // sous-mode dit pourtant « uploads their own image BEFORE adding to cart ».
  // La regle devient explicite, et elle est ecrite ICI, une seule fois.
  if (params.designRequis === true && !(params.designsFournis && params.designsFournis > 0)) {
    return false;
  }
  if (!choixDeVarianteRequis(params.requiresVariant, params.variantesConnues)) return true;
  return !!params.varianteChoisie;
}
