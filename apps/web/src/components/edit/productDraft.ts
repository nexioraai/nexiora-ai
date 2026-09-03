// DETTE 6c — LE PARCOURS DE MISE EN VENTE, EXTRAIT ET RENDU VERIFIABLE.
//
// POURQUOI CE FICHIER EXISTE. Avant cette dette, la seule couverture de
// `for_sale` cote marchand etait ceci :
//
//     expect(draft).toMatch(/for_sale: boolean;/)
//
// c'est-a-dire la PRESENCE D'UNE LIGNE DE CODE, jamais un comportement. Rien
// ne pouvait rougir si l'etat initial du formulaire changeait, si une
// sauvegarde cessait de transporter le champ, ou si l'ouverture d'un produit
// en dévendait un autre. Le depot n'a ni jsdom ni testing-library : un
// composant client n'y est pas interrogeable par simulation d'evenements.
//
// Ces trois decisions -- l'etat initial, la lecture d'un produit existant, la
// charge envoyee -- sont donc extraites ici, PURES. C'est le patron deja
// employe par `canTransact`, `productResolution` et `galleryResolution` : le
// point de decision sort du composant, et devient testable pour de vrai.
// `ProductManager` ne garde que le rendu et les appels reseau.
//
// AUCUN CHANGEMENT DE COMPORTEMENT DANS CETTE EXTRACTION : memes champs,
// memes valeurs, meme ordre. Ce qui change ensuite (l'etat initial de
// `for_sale`) est une decision produit distincte, appliquee apres que ces
// tests ont fige l'existant.

/**
 * ETAPE 7 — `stock` N'EST PAS ICI, et c'est structurel.
 *
 * Il y etait, et c'etait le defaut : le formulaire chargeait `stock` a
 * l'ouverture puis le renvoyait dans CHAQUE sauvegarde. Un marchand qui
 * comptait 50 unites, puis corrigeait le prix depuis un formulaire ouvert
 * AVANT le comptage, reecrivait silencieusement l'ancien stock -- le comptage
 * etait perdu sans qu'aucune erreur n'apparaisse. Le retirer rend cette perte
 * IMPOSSIBLE : la sauvegarde generale n'a plus de valeur de stock a envoyer.
 *
 * ETAPE 8, VOLET A — `for_sale`, LUI, Y EST.
 * `stock` en a ete retire parce qu'un comptage est un FAIT observe qu'une
 * sauvegarde generale ne doit jamais pouvoir ecraser. `for_sale` est une
 * INTENTION : le marchand la declare au meme moment et par le meme geste que
 * la visibilite. Rien ne se perd si l'une ecrase l'autre -- elles decrivent
 * l'instant present.
 */
export type ProductDraft = {
  name: string;
  description: string;
  price: string;
  currency: string;
  images: string[];
  published: boolean;
  for_sale: boolean;
};

/** La forme minimale que ce module lit d'un produit deja enregistre. */
export type EditableProduct = {
  name: string;
  description: string | null;
  price: number;
  currency: string;
  images: string[];
  published: boolean;
  for_sale: boolean;
};

/**
 * DETTE 6c — L'ETAT INITIAL DU FORMULAIRE DE CREATION.
 *
 * `published: true` — un produit qu'on cree, on le montre.
 * `for_sale: false` — MAIS on ne le VEND pas tant qu'on ne l'a pas dit.
 *
 * CE QUI CHANGE, ET CE QUI NE CHANGE PAS. Le `DEFAULT true` de la colonne
 * `shop_products.for_sale` est INTACT, et le restera : il est la reponse a
 * « que vaut ce champ pour un appelant qui l'omet ? », et sa reponse doit
 * rester « vendable », sans quoi toute ligne creee hors de ce formulaire
 * changerait de sens. Ce fichier ne repond pas a cette question-la : il
 * repond a « que propose le formulaire avant que le marchand ait parle ? ».
 * Le formulaire envoie donc TOUJOURS une valeur explicite -- il n'omet
 * jamais le champ, et ne s'appuie donc jamais sur le defaut SQL.
 *
 * POURQUOI L'ACTE PLUTOT QUE LE DEFAUT. Mettre en vente engage a encaisser.
 * Une case pre-cochee fait porter cet engagement par l'inaction ; une case
 * vide le fait porter par une decision. C'est la meme lecon que l'allowlist
 * de `canTransact` : on nomme ce qu'on autorise, jamais ce qu'on exclut.
 */
export const EMPTY_DRAFT: ProductDraft = {
  name: '',
  description: '',
  price: '',
  currency: 'CAD',
  images: [],
  published: true,
  for_sale: false,
};

/**
 * Ouverture d'un produit existant dans le formulaire.
 *
 * `for_sale: p.for_sale !== false` et non `=== true` : si le champ manquait
 * de la lecture -- projection modifiee, colonne renommee -- l'ouverture du
 * formulaire ne doit pas devendre le produit en silence. L'inconnu ne doit
 * pas se transformer en retrait de vente a l'insu du marchand.
 */
export function draftFromProduct(p: EditableProduct): ProductDraft {
  return {
    name: p.name,
    description: p.description ?? '',
    price: String(p.price),
    currency: p.currency,
    images: p.images ?? [],
    published: p.published,
    for_sale: p.for_sale !== false,
  };
}

/**
 * La charge commune au POST et au PATCH.
 *
 * ETAPE 7 — `stock` en est ABSENT, delibarement : la sauvegarde generale ne
 * transporte aucune valeur de stock. Le stock initial est ajoute par le seul
 * appelant du POST, jamais ici.
 *
 * DETTE 6c — `for_sale` y est TOUJOURS present, dans les deux sens. Le
 * formulaire ne s'en remet pas au defaut de la colonne : il declare.
 */
export function payloadFromDraft(d: ProductDraft) {
  return {
    name: d.name.trim(),
    description: d.description.trim() || null,
    price: parseFloat(d.price) || 0,
    currency: d.currency,
    images: d.images,
    published: d.published,
    for_sale: d.for_sale,
  };
}
