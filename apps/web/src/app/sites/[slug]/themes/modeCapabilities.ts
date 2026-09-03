// src/app/sites/[slug]/themes/modeCapabilities.ts
//
// Traduit le mode d'un site (donnee brute sur `sites.mode`) en capacites
// explicites que le reste du systeme doit consulter. Cette duplication
// existait deja et avait produit une vraie divergence : le calcul de ctaHref
// dans EditorialTheme.tsx oubliait le cas vitrine, contrairement a celui de
// VifTheme.tsx, pour une expression censee etre identique. Ce module est la
// source unique de verite du RENDU.
//
// ============================================================
// ETAPE A -- `canTransact` EST L'AUTORITE, ET ELLE EST UNIQUE.
//
// CE QUI EXISTAIT ICI. La capacite se calculait par une comparaison
// NEGATIVE au mode vitrine, doublee d'une regle produits. C'etait une
// SECONDE definition de « ce site commerce », a cote de `canTransact`, et
// ecrite dans la forme meme que le registre d'architecture interdit : une
// exclusion fait du commerce le comportement PAR DEFAUT. Un mode 4 ajoute
// demain obtenait une boutique sans que personne l'ait decide -- et le
// cliquet qui l'interdit ne s'appliquait qu'a `canTransact.ts`, pas a ce
// fichier. Les deux definitions s'accordaient sur les trois modes connus et
// divergeaient sur tout le reste.
//
// DEUX CONCEPTS, UNE SEULE AUTORITE. Ils ne sont pas fusionnes, et ne
// doivent jamais l'etre :
//   `canTransact(mode)` repond « ce site a-t-il le DROIT de commercer ? » ;
//   `hasShop`           repond « faut-il AFFICHER la surface boutique ? ».
// Les confondre casserait immediatement la boutique sans produit, ou
// l'autorisation est acquise mais la vitrine n'a rien a montrer. La relation
// est une implication stricte, verifiee par test :
//
//     hasShop  ==>  canTransact(mode)        (jamais l'inverse)
//
// LA REGLE D'AFFICHAGE RESTE ICI, JAMAIS DANS `canTransact.ts`. Ce module
// d'admission declare lui-meme ce qu'il n'a pas le droit de connaitre --
// « l'existence d'un produit » en fait partie. Y loger une regle de rendu
// rejouerait la confusion entre autorisation et affichage. Pour la meme
// raison, ce fichier n'importe PAS `order-domain/` : la frontiere de
// ROUTAGE (« qui execute la vente ? ») n'a rien a faire dans une decision
// d'AFFICHAGE.
// ============================================================

import { canTransact } from '@/lib/commerce-admission/canTransact';

/**
 * Les modes dont le catalogue PRECEDE leur premier produit propre.
 *
 * POURQUOI CETTE REGLE EXISTE, mesure et non supposee. Sur un site
 * dropshipping, le catalogue fournisseur est charge COTE CLIENT par
 * `CatalogSearch` (`fetch('/api/catalog/search')`) -- il n'arrive JAMAIS par
 * `site.products`. Un tel site tout neuf a donc `products = []` ET un
 * catalogue a vendre. Or `CatalogSearch` est rendu A L'INTERIEUR de
 * `CartShell` (voir sites/[slug]/page.tsx), et `CartShell` ne monte
 * `CartProvider` que si `hasShop` est vrai : sans cette regle, le catalogue
 * s'afficherait et RIEN ne pourrait etre mis au panier. Elle compense un
 * catalogue qui arrive par un autre chemin ; ce n'est pas un privilege.
 *
 * ALLOWLIST POSITIVE, comme `TRANSACTING_SITE_MODES`. Un mode absent de
 * cette liste doit posseder des produits pour montrer une boutique -- il ne
 * peut pas heriter de ce comportement par accident. Ajouter un mode ici est
 * une decision d'une ligne, visible dans un diff et greppable : c'est
 * exactement l'extension consciente que `extensibilityProof` reclame.
 *
 * VALEUR LOCALE, DELIBEREMENT. `SUPPLIER_SITE_MODE` existe dans
 * `order-domain/`, mais l'importer ferait entrer la frontiere de ROUTAGE
 * dans une decision d'AFFICHAGE. La coincidence de valeur n'est pas une
 * dependance : ces deux regles peuvent diverger sans se contredire.
 *
 * `Set.has` et non une comparaison directe : egalite stricte, la chaine
 * '3' n'est pas le nombre 3.
 */
const CATALOG_BEFORE_OWN_PRODUCTS = new Set<unknown>([3]);

// ============================================================
// ETAPE C -- LE MODELE DE FACTURATION DE LA LIVRAISON.
//
// UNE TROISIEME FRONTIERE, distincte des deux autres :
//   ADMISSION   `canTransact`              « a-t-il le droit de vendre ? »
//   ROUTAGE     `resolveFulfillmentDomain` « qui execute la vente ? »
//   FACTURATION (ici)                      « forfait ou devis ? »
//
// Elle COINCIDE aujourd'hui avec le routage -- marchand au forfait,
// fournisseur sur devis -- mais elle ne s'y REDUIT pas : un marchand pourrait
// vouloir des tarifs transporteur, un site fournisseur offrir un forfait
// promotionnel. Les fusionner rejouerait la faute que deux chantiers ont
// servi a defaire, c'est pourquoi `SUPPLIER_SITE_MODE` n'est PAS importe ici.
//
// CETTE REGLE EST DEJA NOMMEE COTE SERVEUR. `CheckoutPolicy` la declare en
// deux champs -- `requiresDeliverableCountry` et `requiresResolvedShipping` --
// auxquels `mode2/checkoutPolicy.ts` repond false/false et
// `mode3/checkoutPolicy.ts` true/true. Le panier posait exactement la meme
// question, en brut, trois fois. Ces deux fichiers portent `import
// 'server-only'` : un composant client ne peut pas les lire. D'ou ce miroir
// client, place ici plutot que recopie dans le panier.
//
// DEUX ALLOWLISTS, PAS UNE NEGATION. Le panier testait `mode !== 2`, si bien
// qu'un mode inconnu tombait SILENCIEUSEMENT dans la branche fournisseur :
// il exigeait un pays et declenchait un devis. Desormais chaque branche
// s'ouvre sur inscription explicite, et un mode absent des deux listes
// n'ouvre AUCUN chemin d'achat.
// ============================================================

/** Modes dont la livraison est un FORFAIT fixe par le marchand. */
const FLAT_SHIPPING_MODES = new Set<unknown>([2]);

/** Modes dont la livraison exige un DEVIS resolu pour un pays donne. */
const QUOTED_SHIPPING_MODES = new Set<unknown>([3]);

export type ModeCapabilitiesInput = {
  mode?: number | null;
  products?: unknown[] | null;
};

export type ModeCapabilities = {
  /**
   * Vrai si ce site doit afficher une section Shop et disposer d'un panier
   * (CartShell).
   *   Vitrine      : jamais -- elle presente un business, elle ne le fait
   *                  pas commercer.
   *   Boutique     : seulement si elle possede au moins un produit ; un
   *                  panier vide sans rien a y mettre n'a pas lieu d'etre.
   *   Dropshipping : toujours, meme avant le premier produit (voir la
   *                  constante ci-dessus).
   *   Tout autre mode, `null`, `undefined`, une chaine, `NaN` : jamais.
   *                  Fail-closed par `canTransact`, sans qu'aucune ligne
   *                  ait a le prevoir.
   */
  hasShop: boolean;

  /**
   * Vrai si la livraison de ce site est un FORFAIT fixe par le marchand
   * (`sites.shipping_flat`). Le panier affiche alors un montant immediat, ne
   * demande aucun pays et n'appelle aucun devis.
   */
  billsFlatShipping: boolean;

  /**
   * Vrai si la livraison de ce site exige un DEVIS resolu pour un pays donne.
   * Le panier affiche alors un selecteur de pays, appelle
   * `/api/shop/shipping/calculate`, et bloque la commande tant que le devis
   * n'est pas revenu.
   */
  requiresShippingQuote: boolean;
};

/**
 * INVARIANT : les deux capacites de livraison sont MUTUELLEMENT EXCLUSIVES.
 * Un mode ne peut pas facturer au forfait ET exiger un devis ; il peut en
 * revanche n'etre inscrit dans aucune des deux listes -- c'est le cas
 * fail-closed d'un mode inconnu, qui n'ouvre alors aucun chemin d'achat.
 */

export function getModeCapabilities(site: ModeCapabilitiesInput): ModeCapabilities {
  // Aucun repli vers le mode vitrine : `canTransact` prend `unknown` et
  // refuse deja `null`, `undefined`, `0` et toute valeur non inscrite dans
  // son allowlist. Le repli masquait la vraie regle sans rien ajouter.
  const mode = site.mode;
  const hasProducts = Array.isArray(site.products) && site.products.length > 0;
  const hasShop =
    canTransact(mode) && (hasProducts || CATALOG_BEFORE_OWN_PRODUCTS.has(mode));
  return {
    hasShop,
    billsFlatShipping: FLAT_SHIPPING_MODES.has(mode),
    requiresShippingQuote: QUOTED_SHIPPING_MODES.has(mode),
  };
}
