// ============================================================
// ETAPE 3 -- QUELLES FAMILLES D'OUTILS POUR CE SITE.
//
// UNE CINQUIEME QUESTION, distincte des quatre autres frontieres :
//   ADMISSION AU COMMERCE  `canTransact`               a-t-il le droit de vendre ?
//   ROUTAGE                `resolveFulfillmentDomain`  qui execute la vente ?
//   AFFICHAGE/FACTURATION  `modeCapabilities`          que montre-t-on ?
//   CATALOGUE              `hasSupplierCatalog`        a-t-il un catalogue fournisseur ?
//   OUTILS (ici)                                       que l'agent peut-il proposer ?
//
// CE QUI EXISTAIT. La reponse vivait dans `agent/[slug]/chat/route.ts`, sous
// la forme de trois `if (mode === N)` qui empilaient des familles. Deux
// consequences :
//   1. un mode inconnu recevait `universal` par accident -- correct, mais par
//      absence de branche, jamais par decision ;
//   2. les cliquets qui la surveillaient lisaient le TEXTE SOURCE de la route
//      (`CHAT.match(/if \(mode === 2\) \{...\}/)`), faute de pouvoir appeler
//      la fonction : elle n'etait pas exportee. Quatorze assertions
//      textuelles, qu'aucun refactor ne pouvait survivre.
//
// L'EXTRACTION EST CE QUI REND LA REGLE VERIFIABLE. Meme patron que
// `productDraft.ts` (dette 6c) et `modeCapabilities.ts` (etape A) : le point
// de decision sort du fichier qui l'utilise, et devient testable pour de vrai.
// Les quatorze cliquets textuels deviennent comportementaux.
//
// ALLOWLISTS POSITIVES, une par famille. Un mode ne recoit une famille que
// s'il y est INSCRIT. Rien ne s'herite, rien ne se deduit d'une negation :
// c'est la meme forme qu'a `TRANSACTING_SITE_MODES`, `CATALOG_SITE_MODES` et
// `FLAT_SHIPPING_MODES`.
//
// COMPORTEMENT METIER STRICTEMENT CONSERVE pour les modes 1, 2 et 3. Ce
// fichier ne change rien a ce que l'agent peut faire aujourd'hui ; il rend
// seulement la regle lisible et verrouillable.
// ============================================================

/** Les cinq outils que tout site recoit, quel que soit son mode. */
export const UNIVERSAL_TOOLS = [
  'propose_field_update',
  'propose_color_update',
  'propose_theme_change',
  'propose_contact_update',
  'propose_update_social',
] as const;

export const CONTENT_TOOLS = [
  'propose_add_service',
  'propose_remove_service',
  'propose_service_update',
  'propose_testimonial_add',
  'propose_testimonial_remove',
  'propose_testimonial_update',
  // CHANTIER 7 -- l'agent ne savait que RETIRER : `remove` et `clear`
  // existaient, `add` non. La galerie ne pouvait que retrecir. L'outil
  // rejoint la meme famille, donc les memes modes {1, 2} : AUCUNE frontiere
  // n'est deplacee.
  'propose_gallery_add',
  'propose_gallery_remove',
  'propose_gallery_clear',
  // CHANTIER 4 -- `faq` et `whyus` rejoignent le contenu editorial. Ils y
  // appartiennent par nature : ce sont deux blocs de texte que les quatre
  // themes rendent et que `llms.txt` publie, au meme titre que les
  // temoignages. AUCUNE frontiere de mode n'est deplacee -- la famille garde
  // ses modes {1, 2}. CONSEQUENCE ASSUMEE ET DITE : un site Mode 3 ne recoit
  // pas ces six outils, exactement comme il ne recoit pas ceux des
  // temoignages ; son marchand edite ces champs dans l'editeur, ou le
  // formulaire existe deja pour tous les modes.
  'propose_faq_add',
  'propose_faq_remove',
  'propose_faq_update',
  'propose_whyus_add',
  'propose_whyus_remove',
  'propose_whyus_update',
] as const;

export const MANUAL_PRODUCT_TOOLS = [
  'propose_product_add',
  'propose_product_remove',
  'propose_product_update',
] as const;

export const CATALOG_TOOLS = [
  'catalog_curate',
  'catalog_enhance',
  'catalog_approve_all',
  'catalog_set_margin',
] as const;

export const PROMO_TOOLS = ['create_promo_code', 'deactivate_promo_code'] as const;

/**
 * ETAPE 7 -- meme frontiere que l'admission au commerce (`canTransact` :
 * modes 2 et 3, jamais 1). Un stock n'existe que pour un site qui vend ; la
 * route d'inventaire le refuserait de toute facon en 403, et laisser le
 * modele proposer un outil voue au refus serait une promesse fausse.
 */
export const INVENTORY_TOOLS = ['count_product_stock'] as const;

/**
 * ETAPE 8, VOLET D -- meme frontiere que `inventory`, et pour la meme raison :
 * ces outils n'atteignent que `shop_products`, la table dont ProductManager
 * est l'interface, elle-meme montee pour les modes 2 ET 3. Les catalogues
 * fournisseurs du Mode 3 vivent ailleurs et portent des identifiants prefixes
 * `catalog-` que `GET /api/shop/products` ne renvoie jamais.
 */
export const PRODUCT_FIELD_TOOLS = ['set_price', 'set_currency', 'set_for_sale'] as const;

// ============================================================
// DEBT-032 -- CE QU'UN OUTIL PRODUIT, DECLARE ICI ET NON DEDUIT AILLEURS.
//
// LE LIEN QUI MANQUAIT. Ce module repond « quel mode recoit quel outil » ;
// `canTransact` repond « quel mode a le droit de produire un artefact
// commercial ». Les deux autorites coexistaient SANS AUCUNE RELATION
// EXPRIMEE : rien n'empechait d'inscrire le mode 1 dans `PROMO_MODES`, et
// aucun test n'aurait bronche. C'est la meme faille de forme que DEBT-030,
// une couche plus haut -- une frontiere declaree quelque part, jamais reliee
// a l'endroit qui la franchit.
//
// POURQUOI UNE LISTE D'OUTILS ET NON UNE NATURE PAR FAMILLE. Une nature
// portee par la famille suivrait l'outil qui change de famille : deplacer
// `create_promo_code` dans `CONTENT_TOOLS` le rendrait « editorial » par
// simple deplacement, et le mode 1 l'obtiendrait sans qu'aucun controle ne
// s'en apercoive. La nature appartient a l'OUTIL, parce qu'elle decrit ce
// qu'il ECRIT -- pas le tiroir ou on le range.
//
// LE CRITERE, ET IL EST OBSERVABLE : l'outil produit-il un artefact qui
// n'existe que pour un site qui encaisse ? Un code promo, une marge
// fournisseur, une approbation de catalogue, un stock, un prix de vente :
// oui. Un service, un temoignage, une image, une FAQ : non -- ce sont des
// contenus, un site vitrine en a legitimement.
//
// `MANUAL_PRODUCT_TOOLS` EST ABSENT DE CETTE LISTE, DELIBEREMENT. Ces trois
// outils ecrivent `sites.products` (jsonb), qui pour une vitrine est un menu
// de presentation sans contrepartie commerciale -- c'est precisement pourquoi
// le Mode 2, lui, les a PERDUS a l'etape 0 du catalogue canonique. Ranger un
// menu de restaurant parmi les artefacts commerciaux interdirait au Mode 1
// une capacite qui lui revient.
//
// L'INVARIANT QUE CETTE LISTE REND VERIFIABLE, teste par appel reel de
// `toolNamesForSite` sur tous les modes et sous-types :
//
//     un mode qui recoit UN SEUL de ces outils DOIT etre admis par
//     `canTransact` -- sans exception, sans derogation.
//
// Il echoue si l'on inscrit un mode non commercant dans une allowlist
// commerciale, si l'on deplace un de ces outils vers une famille editoriale,
// ou si l'on ouvre au Mode 1 une famille qui en contient un.
// ============================================================
export const COMMERCIAL_ARTIFACT_TOOLS = [
  // Catalogue fournisseur : curation, enrichissement, approbation, marge.
  'catalog_curate',
  'catalog_enhance',
  'catalog_approve_all',
  'catalog_set_margin',
  // Codes promo : une remise n'a de sens que pour un site qui encaisse.
  'create_promo_code',
  'deactivate_promo_code',
  // Stock : un inventaire n'existe que pour un site qui vend.
  'count_product_stock',
  // Champs de vente de `shop_products` : prix, devise, achetabilite.
  'set_price',
  'set_currency',
  'set_for_sale',
] as const;

// ---- Les allowlists : quel mode recoit quelle famille ----

/** Le contenu editorial : services, temoignages, galerie. */
const CONTENT_MODES = new Set<unknown>([1, 2]);

/**
 * ETAPE 0 du chantier catalogue canonique -- le Mode 2 a PERDU ces outils.
 * Ils ecrivent dans `sites.products` (jsonb), or la vitrine d'une boutique
 * Mode 2 lit `shop_products` : le chargeur public ECRASE le jsonb des qu'une
 * ligne `shop_products` publiee existe. Un produit ajoute la etait donc soit
 * invisible, soit affiche mais NON ACHETABLE. Le Mode 1 les conserve : sa
 * `sites.products` n'a pas de contrepartie commerciale.
 */
const MANUAL_PRODUCT_MODES = new Set<unknown>([1]);

const PROMO_MODES = new Set<unknown>([2, 3]);
const INVENTORY_MODES = new Set<unknown>([2, 3]);
const PRODUCT_FIELD_MODES = new Set<unknown>([2, 3]);

/**
 * Le catalogue fournisseur. La valeur reproduit `CATALOG_SITE_MODES`
 * (lib/dropship/catalogAdmission.ts) sans l'importer : celui-ci est
 * `server-only` et repond a une question d'ADMISSION D'API, celle-ci a une
 * question de CAPACITE D'OUTIL. Elles coincident ; elles ne sont pas la meme.
 */
const CATALOG_MODES = new Set<unknown>([3]);

/**
 * Les sous-types qui disposent d'un catalogue a curer. `pod_brand` en est
 * absent : ses produits viennent des designs du marchand, pas d'un catalogue.
 *
 * IMBRIQUEE, JAMAIS INDEPENDANTE. Ce sous-ensemble n'est consulte que si le
 * mode est deja admis au catalogue -- `dropship_type` est un detail INTERNE
 * au domaine fournisseur et ne doit jamais decider seul.
 */
const CATALOG_SUBTYPES = new Set<unknown>(['reseller', 'pod_custom']);

/**
 * Les noms d'outils que l'agent de ce site a le droit de se voir proposer.
 *
 * FAIL-CLOSED : un mode absent de toutes les allowlists ne recoit que
 * `UNIVERSAL_TOOLS`. Ce n'est plus l'effet d'une branche manquante, c'est le
 * resultat de n'etre inscrit nulle part.
 */
export function toolNamesForSite(siteMode: unknown, dropshipType: unknown): string[] {
  const allowed: string[] = [...UNIVERSAL_TOOLS];

  if (CONTENT_MODES.has(siteMode)) allowed.push(...CONTENT_TOOLS);
  if (MANUAL_PRODUCT_MODES.has(siteMode)) allowed.push(...MANUAL_PRODUCT_TOOLS);
  if (PROMO_MODES.has(siteMode)) allowed.push(...PROMO_TOOLS);
  if (INVENTORY_MODES.has(siteMode)) allowed.push(...INVENTORY_TOOLS);
  if (PRODUCT_FIELD_MODES.has(siteMode)) allowed.push(...PRODUCT_FIELD_TOOLS);
  if (CATALOG_MODES.has(siteMode) && CATALOG_SUBTYPES.has(dropshipType)) {
    allowed.push(...CATALOG_TOOLS);
  }

  return allowed;
}
