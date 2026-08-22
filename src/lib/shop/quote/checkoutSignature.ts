import 'server-only';

// ============================================================
// SIGNATURE D'IDEMPOTENCE DU CHECKOUT (LOT 3).
//
// CAUSE RACINE -- la cle etait derivee cote NAVIGATEUR, a partir du panier
// client, alors que la requete envoyee a Stripe est construite cote SERVEUR.
// Les deux pouvaient donc diverger :
//
//   1. COLLISION ENTRE ACHETEURS (P0, actif en production avant ce lot) --
//      la chaine canonique ne contenait aucun composant propre a l'acheteur.
//      Deux acheteurs anonymes avec le meme panier obtenaient la MEME cle,
//      donc la MEME session Stripe : le second payait dans la commande du
//      premier (payment_ref UNIQUE -> conflit -> meme URL renvoyee).
//
//   2. PARAMETRES SERVEUR ABSENTS DE LA CLE -- prix serveur, montant de
//      livraison, remise reelle et application_fee sont recalcules ici. Si
//      l'un changeait entre deux tentatives (marchand modifiant un prix,
//      cache de livraison rafraichi), la cle restait identique alors que les
//      parametres envoyes a Stripe changeaient -> `idempotency_error`.
//
// LA CLE = f(identite de l'acheteur, etat commercial SERVEUR).
// Aucune des deux moities ne suffit seule : voir buyerNonce.ts.
//
// Determinisme : tous les montants entrent en CENTIMES ENTIERS. Le LOT 1 les
// a deja rendus exacts au centime, donc `Math.round(x * 100)` est stable --
// sans quoi une derive flottante produirait deux cles pour un meme montant.
// ============================================================

/** Une ligne de panier, telle qu'elle sera reellement envoyee a Stripe. */
export type SignatureLine = {
  /** Identifiant panier (inclut la variante : "catalog-{uuid}::{variantId}"). */
  cartId: string;
  quantity: number;
  /** Prix unitaire SERVEUR. Jamais celui annonce par le navigateur. */
  unitPrice: number;
  /** URLs de design : ne changent pas le prix, mais changent ce qui est FABRIQUE. */
  designUrls?: string[];
};

export type CheckoutSignatureInput = {
  /** Identite de l'acheteur (navigateur). Sans elle : collision entre acheteurs. */
  buyerNonce: string;
  siteId: string;
  currency: string;
  origin: string;
  lines: SignatureLine[];
  shippingAmount: number;
  shipmentTier: string | null;
  promoId: string | null;
  discountAmount: number;
  applicationFee: number;
};

/** Montant -> centimes entiers. Stable car les montants sont deja exacts au centime (LOT 1). */
const cents = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100);

/**
 * Representation canonique de l'etat commercial.
 *
 * INCLUS, et pourquoi :
 *   buyerNonce       identifie la TENTATIVE ; sans lui, deux acheteurs au
 *                    panier identique partagent une session Stripe.
 *   siteId           le compte Stripe destinataire depend du site ; le slug
 *                    est volontairement exclu (renommable, non stable).
 *   currency         change le montant reellement debite.
 *   origin           determine success_url / cancel_url, qui SONT des
 *                    parametres Stripe : un origin different sans changement
 *                    de cle provoquerait `idempotency_error`.
 *   lines            cartId + quantite + prix unitaire serveur = line_items.
 *                    L'ORDRE est significatif : line_items est un tableau
 *                    ordonne, deux ordres sont deux requetes differentes.
 *   designUrls       ne changent aucun montant, mais changent le produit
 *                    FABRIQUE ; reutiliser la session reutiliserait la
 *                    commande, donc les designs du premier acheteur.
 *   shippingAmount   shipping_rate_data.fixed_amount.
 *   shipmentTier     determine le transporteur et shop_orders.shipment_tier ;
 *                    deux paliers au meme prix restent deux etats distincts.
 *   promoId + discountAmount  le montant pilote amount_off ; l'identifiant
 *                    distingue deux codes de meme valeur, dont la
 *                    consommation (used_count) n'est pas la meme.
 *   applicationFee   payment_intent_data.application_fee_amount.
 *
 * EXCLUS, et pourquoi -- chaque exclusion evite une cle qui varierait SANS
 * qu'aucun parametre Stripe ne change, ce qui creerait des sessions inutiles :
 *   quote.source     n'est envoye a Stripe nulle part. Un cache expirant
 *                    alors que le live renvoie le MEME montant ne doit pas
 *                    produire une nouvelle session.
 *   logisticName     consequence du palier, deja present. Un simple renommage
 *                    de transporteur chez CJ ne doit rien changer.
 *   estimatedDelivery, supplierCost, merchantProfit  jamais transmis a
 *                    Stripe ; derives des composants deja inclus.
 *   priceNumber client  aucune autorite sur le montant (recalcule serveur).
 *   cancel_token, horodatages, email/nom acheteur  non deterministes ou
 *                    collectes par Stripe lui-meme.
 */
function canonical(input: CheckoutSignatureInput): string {
  const lines = input.lines
    .map((l) =>
      [
        l.cartId,
        l.quantity,
        cents(l.unitPrice),
        (l.designUrls ?? []).join('+'),
      ].join('~')
    )
    .join('|');

  return [
    'v1',
    input.buyerNonce,
    input.siteId,
    input.currency,
    input.origin,
    cents(input.shippingAmount),
    input.shipmentTier ?? '',
    input.promoId ?? '',
    cents(input.discountAmount),
    cents(input.applicationFee),
    lines,
  ].join('#');
}

/** FNV-1a 32 bits. Deux graines distinctes -> 64 bits effectifs. */
function fnv1a(s: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Signature courte et deterministe de l'etat commercial complet.
 *
 * Stripe borne ses cles d'idempotence a 255 caracteres et `stripe.ts` y
 * ajoute un suffixe (`:tax`, `:notax`, `:coupon`) : la sortie est compacte
 * par construction, quelle que soit la taille du panier.
 *
 * Une collision produirait une `idempotency_error` visible cote Stripe,
 * jamais une charge silencieusement erronee -- la longueur canonique est
 * incluse dans la signature pour rendre ce cas encore plus improbable.
 */
export function buildCheckoutSignature(input: CheckoutSignatureInput): string {
  const c = canonical(input);
  const a = fnv1a(c, 0x811c9dc5).toString(16).padStart(8, '0');
  const b = fnv1a(c, 0x9e3779b1).toString(16).padStart(8, '0');
  return `co_v1_${c.length.toString(36)}_${a}${b}`;
}
