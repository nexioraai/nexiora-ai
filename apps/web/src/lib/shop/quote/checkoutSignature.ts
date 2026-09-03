import 'server-only';

// ============================================================
// DEUX IDENTITES DISTINCTES (LOT 4) -- a ne jamais confondre.
//
//   quoteHash             = f(etat commercial SERVEUR)
//   checkoutIdempotencyKey = f(buyerNonce, origin, quoteHash)
//
// Elles repondent a deux questions differentes :
//   quoteHash  -- "est-ce le MEME DEVIS ?" Deux acheteurs qui voient le meme
//                 prix doivent obtenir le MEME hash : c'est ce qui permettra
//                 de detecter qu'un prix a change entre l'affichage du panier
//                 et le paiement, plutot que de debiter silencieusement un
//                 montant different de celui affiche.
//   idempotencyKey -- "est-ce la MEME TENTATIVE D'ACHAT ?" Deux acheteurs
//                 doivent obtenir des cles DIFFERENTES, meme a devis
//                 identique.
//
// P0 CORRIGE AU LOT 3, A NE JAMAIS REINTRODUIRE -- la cle etait derivee du
// seul contenu du panier, sans composant propre a l'acheteur. Deux acheteurs
// anonymes au panier identique obtenaient la meme cle, donc Stripe leur
// servait LA MEME SESSION DE PAIEMENT : le second payait dans la commande du
// premier. C'est precisement pourquoi `quoteHash` ne doit JAMAIS servir seul
// de cle d'idempotence -- il est, par construction, identique entre
// acheteurs. Le seul point d'entree autorise pour Stripe est
// buildCheckoutIdempotencyKey().
//
// Determinisme : tous les montants entrent en CENTIMES ENTIERS. Le LOT 1 les
// a rendus exacts au centime, donc `Math.round(x * 100)` est stable -- sans
// quoi une derive flottante produirait deux hash pour un meme montant.
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

/**
 * Etat commercial du devis. Strictement ce qui determine le PRIX et les
 * CONDITIONS de la vente -- rien qui identifie l'acheteur, rien de technique.
 *
 * INCLUS, et pourquoi :
 *   siteId          le compte Stripe destinataire depend du site ; le slug est
 *                   volontairement exclu (renommable, non stable).
 *   currency        change le montant reellement debite.
 *   lines           cartId + quantite + prix unitaire SERVEUR = le devis
 *                   ligne a ligne. L'ORDRE est significatif : voir plus bas.
 *   designUrls      ne changent aucun montant, mais changent le produit
 *                   FABRIQUE -- deux devis identiques au centime pres mais
 *                   portant des visuels differents ne sont pas le meme devis.
 *   shippingAmount  montant de livraison retenu (marge incluse, LOT 2).
 *   shipmentTier    determine le transporteur ; deux paliers au meme prix
 *                   restent deux conditions commerciales distinctes.
 *   promoId + discountAmount  le montant pilote la remise ; l'identifiant
 *                   distingue deux codes de meme valeur, dont la consommation
 *                   (used_count) n'est pas la meme.
 *   applicationFee  part prelevee par Nexiora : condition commerciale de la
 *                   vente, meme si l'acheteur ne la voit pas.
 *
 * EXCLUS, et pourquoi -- chaque exclusion evite un hash qui varierait SANS
 * qu'aucune condition commerciale ne change :
 *   buyerNonce      identifie l'acheteur, pas le devis. L'inclure rendrait le
 *                   hash inutilisable pour comparer deux acheteurs -- et
 *                   surtout, ce serait confondre les deux identites.
 *   origin          determine success_url / cancel_url. Ce sont des
 *                   parametres Stripe, pas des conditions commerciales : le
 *                   prix ne change pas selon le domaine d'acces. Il entre
 *                   donc dans la CLE, pas dans le devis.
 *   quote.source    n'est transmis a Stripe nulle part. Un cache expirant
 *                   alors que le live renvoie le MEME montant ne change pas
 *                   le devis.
 *   logisticName    consequence du palier, deja present. Un renommage de
 *                   transporteur chez CJ ne change pas le devis.
 *   estimatedDelivery, supplierCost, merchantProfit  derives des composants
 *                   ci-dessus ; supplierCost et merchantProfit sont de la
 *                   comptabilite interne, jamais des conditions de vente.
 *   priceNumber client, horodatages, cancel_token  sans autorite ou non
 *                   deterministes.
 */
export type QuoteState = {
  siteId: string;
  currency: string;
  lines: SignatureLine[];
  shippingAmount: number;
  shipmentTier: string | null;
  promoId: string | null;
  discountAmount: number;
  applicationFee: number;
};

/** Montant -> centimes entiers. Stable car les montants sont exacts au centime (LOT 1). */
const cents = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100);

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
 * Empreinte compacte et deterministe d'une chaine canonique.
 * La longueur canonique est incluse : deux etats de longueurs differentes ne
 * peuvent pas collisionner sur les seuls 64 bits de hachage.
 */
function digest(prefix: string, canonical: string): string {
  const a = fnv1a(canonical, 0x811c9dc5).toString(16).padStart(8, '0');
  const b = fnv1a(canonical, 0x9e3779b1).toString(16).padStart(8, '0');
  return `${prefix}_v1_${canonical.length.toString(36)}_${a}${b}`;
}

/**
 * Serialisation canonique de l'etat commercial.
 *
 * L'ORDRE DES LIGNES EST SIGNIFICATIF, et ce n'est pas un choix par defaut :
 * `line_items` est un tableau ordonne cote Stripe. Deux ordres produisent
 * deux requetes differentes. Pretendre que deux ordres donnent "le meme
 * devis" serait affirmer une egalite que le checkout ne respecte pas -- et,
 * si cette egalite etait propagee a la cle d'idempotence, provoquerait une
 * `idempotency_error`, c'est-a-dire une panne de paiement.
 */
function canonicalQuote(q: QuoteState): string {
  const lines = q.lines
    .map((l) => [l.cartId, l.quantity, cents(l.unitPrice), (l.designUrls ?? []).join('+')].join('~'))
    .join('|');

  return [
    'q1',
    q.siteId,
    q.currency,
    cents(q.shippingAmount),
    q.shipmentTier ?? '',
    q.promoId ?? '',
    cents(q.discountAmount),
    cents(q.applicationFee),
    lines,
  ].join('#');
}

/**
 * Identite COMMERCIALE du devis -- independante de l'acheteur.
 *
 * Deux acheteurs voyant exactement le meme prix obtiennent le meme hash.
 * C'est la propriete recherchee : elle permettra de comparer le devis
 * affiche au panier et le devis recalcule au paiement.
 *
 * NE JAMAIS l'utiliser seul comme cle d'idempotence Stripe : il est identique
 * entre acheteurs, ce qui est exactement le P0 corrige au LOT 3.
 */
export function buildQuoteHash(state: QuoteState): string {
  return digest('q', canonicalQuote(state));
}

/**
 * Identite d'une TENTATIVE D'ACHAT -- seule valeur transmise a Stripe.
 *
 * Combine l'identite de l'acheteur, les parametres Stripe qui ne sont pas
 * commerciaux (`origin`, via success_url / cancel_url) et l'identite du devis.
 * Aucune des trois composantes ne suffit seule :
 *   - devis seul       -> collision entre acheteurs (P0 du LOT 3) ;
 *   - acheteur seul    -> insensible aux changements de prix serveur ;
 *   - sans origin      -> meme cle rejouee avec d'autres success_url
 *                         -> `idempotency_error`.
 */
export function buildCheckoutIdempotencyKey(params: {
  buyerNonce: string;
  origin: string;
  quoteHash: string;
}): string {
  return digest('co', ['k1', params.buyerNonce, params.origin, params.quoteHash].join('#'));
}
