import 'server-only';
import { STRIPE_SHIPPING_COUNTRIES } from './countries';
import { getStripe } from '@/lib/stripe';
import type { PaymentProvider } from './types';

/**
 * Le repli "sans taxe" n'est autorise que pour UNE cause : Stripe Tax n'est
 * pas activable sur ce compte connecte.
 *
 * Sont explicitement EXCLUS -- et donc relances :
 *   StripeIdempotencyError  meme cle rejouee avec d'autres parametres. C'est
 *                           le cas qui, avec l'ancien `catch` nu, faisait
 *                           encaisser un paiement SANS TAXE.
 *   StripeConnectionError / StripeAPIError / StripeRateLimitError  incidents
 *                           transitoires : reessayer sans taxe serait
 *                           encaisser au mauvais montant.
 *   StripeCardError, montant invalide, coupon invalide, etc.
 *
 * LIMITE ASSUMEE : la signature exacte renvoyee par Stripe lorsqu'un compte
 * n'a pas active Stripe Tax n'a pas pu etre confirmee depuis ce depot. La
 * correspondance ci-dessous est donc volontairement ETROITE (type + mention
 * explicite d'automatic_tax) et chaque repli est journalise avec le `code` et
 * le `param` reels, pour la figer des la premiere observation reelle.
 * Une correspondance trop large ramenerait exactement le defaut corrige ici.
 */
function isAutomaticTaxUnavailable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { type?: string; code?: string; param?: string; message?: string };
  if (e.type !== 'StripeInvalidRequestError') return false;
  const haystack = `${e.param ?? ''} ${e.code ?? ''} ${e.message ?? ''}`.toLowerCase();
  return haystack.includes('automatic_tax') || haystack.includes('stripe tax');
}

export const stripeProvider: PaymentProvider = {
  async createOnboarding(siteSlug, returnUrl) {
    const stripe = getStripe();
    const account = await stripe.accounts.create({ type: 'express' });
    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: returnUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
    return { url: link.url, accountId: account.id };
  },

  async createCheckout(accountId, siteSlug, items, successUrl, cancelUrl, shippingFlat, applicationFeeAmount?: number, checkoutNonce?: string, promoDiscount?: number) {
    const stripe = getStripe();

    const lineItems = items.map((i) => ({
      price_data: {
        currency: i.currency.toLowerCase(),
        product_data: { name: i.name },
        unit_amount: Math.round(i.priceNumber * 100),
        tax_behavior: 'exclusive' as const,
      },
      quantity: i.quantity,
    }));

    const currency = (items[0]?.currency || 'cad').toLowerCase();
    const shippingOptions =
      shippingFlat > 0
        ? [
            {
              shipping_rate_data: {
                type: 'fixed_amount' as const,
                fixed_amount: { amount: Math.round(shippingFlat * 100), currency },
                display_name: 'Livraison',
                tax_behavior: 'exclusive' as const,
              },
            },
          ]
        : undefined;

    // Remise promo (passe de cloture, P-1) -- appliquee via un coupon Stripe
    // `amount_off` plutot qu'en reduisant chaque unit_amount.
    //
    // Justification (contestation de l'approche naive) : proratiser la remise
    // sur les lignes introduit une erreur d'arrondi des qu'un article a
    // quantity > 1 (chaque unit_amount arrondi au centime, puis multiplie),
    // si bien que le total reellement encaisse peut diverger de quelques
    // centimes du `clientPays` valide par les garde-fous Mode 3 -- inacceptable
    // quand ce meme montant sert de base a applicationFeeAmount. Le coupon
    // soustrait EXACTEMENT le montant valide serveur, une seule fois
    // (`duration: 'once'`), et rend la remise visible sur la page de paiement,
    // coherente avec ce qu'affichait le panier.
    //
    // Le montant provient exclusivement de checkout/route.ts (recalcule a
    // partir des prix serveur et du code promo resolu dans le tenant) --
    // jamais du navigateur.
    let discountParams: { discounts: { coupon: string }[] } | undefined;
    if (promoDiscount && promoDiscount > 0) {
      const coupon = await stripe.coupons.create(
        {
          amount_off: Math.round(promoDiscount * 100),
          currency,
          duration: 'once',
          max_redemptions: 1,
          name: 'Code promo',
        },
        // Meme nonce -> meme coupon reutilise, pour rester coherent avec
        // l'idempotence de la session elle-meme (deux onglets, resoumission).
        checkoutNonce ? { idempotencyKey: `${checkoutNonce}:coupon` } : undefined
      );
      discountParams = { discounts: [{ coupon: coupon.id }] };
    }

    const baseParams = {
      mode: 'payment' as const,
      line_items: lineItems,
      ...(discountParams ?? {}),
      success_url: successUrl,
      cancel_url: cancelUrl,
      shipping_address_collection: { allowed_countries: [...STRIPE_SHIPPING_COUNTRIES] },
      // Audit adresse Reseller/CJ, partie 7 : sans ceci, aucun numero reel
      // n'atteint jamais CJ (shippingPhone restait toujours un fallback
      // fabrique) -- Stripe le place sur customer_details.phone, jamais
      // imbrique dans l'adresse elle-meme (voir handlePaidCheckout.ts).
      phone_number_collection: { enabled: true },
      ...(shippingOptions ? { shipping_options: shippingOptions } : {}),
      payment_intent_data: {
        transfer_data: { destination: accountId },
        ...(applicationFeeAmount ? { application_fee_amount: Math.round(applicationFeeAmount * 100) } : {}),
      },
    };

    // Audit Mode 3/POD BRAND, perfectionnement -- cause racine : cette fonction
    // n'utilisait AUCUNE cle d'idempotence Stripe. Un double-clic, deux onglets
    // ou une resoumission reseau du meme panier declenchaient deux appels
    // stripe.checkout.sessions.create() reellement distincts -- deux sessions
    // Stripe independantes, potentiellement DEUX vraies charges si le client
    // paie les deux (ex: confusion apres un paiement lent, ou deux onglets
    // ouverts sur le meme panier). checkoutNonce (genere et persiste cote
    // navigateur, partage entre onglets) est fourni en idempotencyKey a
    // Stripe : un rejeu du meme nonce avec des parametres identiques renvoie
        // la MEME session au lieu d'en creer une seconde -- garanti par Stripe
    // lui-meme, jamais une simple garde applicative.
    //
    // Deux cles DISTINCTES derivees du meme nonce (":tax" / ":notax") : les
    // deux branches ci-dessous envoient des parametres differents
    // (automatic_tax/billing_address_collection). Stripe rejette une meme
    // idempotencyKey rejouee avec des parametres differents
    // (idempotency_error) -- reutiliser une seule cle pour les deux branches
    // casserait le fallback "Stripe Tax non active sur ce compte" a la
    // moindre resoumission. Chaque branche reste neanmoins idempotente pour
    // un rejeu qui emprunte la MEME branche.
    const taxKey = checkoutNonce ? { idempotencyKey: `${checkoutNonce}:tax` } : undefined;
    const noTaxKey = checkoutNonce ? { idempotencyKey: `${checkoutNonce}:notax` } : undefined;

    // Tente avec calcul automatique des taxes (Stripe Tax côté compte connecté).
    // Si Stripe Tax n'est pas activé sur ce compte, on retombe sans taxe.
    //
    // LOT 3 -- ce `catch` etait NU : il attrapait TOUTE erreur Stripe et
    // retombait sur la branche sans taxe. Consequence la plus grave :
    // une `idempotency_error` (meme cle rejouee avec des parametres
    // differents) faisait creer une session SANS `automatic_tax`, donc un
    // paiement encaisse SANS TAXE, silencieusement. Une erreur reseau ou un
    // rate-limit produisaient le meme effet.
    //
    // Le repli n'est desormais autorise que si l'erreur designe
    // explicitement automatic_tax. Tout le reste remonte : un checkout en
    // erreur est infiniment preferable a une taxe non collectee.
    try {
      const session = await stripe.checkout.sessions.create(
        {
          ...baseParams,
          automatic_tax: { enabled: true },
          billing_address_collection: 'required',
        },
        taxKey,
      );
      return { url: session.url ?? '', orderId: session.id };
    } catch (err: unknown) {
      if (!isAutomaticTaxUnavailable(err)) throw err;
      // Journalise la signature exacte de l'erreur : la correspondance
      // ci-dessous est volontairement etroite et devra etre resserree sur le
      // code Stripe reel des sa premiere observation en production.
      const e = err as { type?: string; code?: string; param?: string; message?: string };
      console.error('[stripe] repli sans taxe', { type: e.type, code: e.code, param: e.param, message: e.message });
      const session = await stripe.checkout.sessions.create(baseParams, noTaxKey);
      return { url: session.url ?? '', orderId: session.id };
    }
  },

  /**
   * Rembourse integralement un paiement boutique.
   * reverse_transfer: true -> Stripe REPREND l'argent deja transfere au
   * marchand (solde negatif si insuffisant, recupere sur ses ventes suivantes).
   * refund_application_fee: true -> Nexiora rend aussi sa commission.
   * Sans ces deux options, Nexiora paierait le remboursement de sa poche.
   *
   * F7 : cle d'idempotence Stripe explicite, deterministe (derivee du
   * payment_intent lui-meme, qui n'est rembourse integralement qu'une seule
   * fois dans ce systeme). Ne suppose jamais qu'un appel unique cote code
   * suffit a garantir un appel unique cote Stripe : si cette fonction etait
   * un jour appelee deux fois pour le meme paiement (par n'importe quel
   * appelant, present ou futur -- cancel-order/route.ts l'utilise deja),
   * Stripe renvoie desormais le MEME remboursement au lieu d'en creer un
   * second, independamment de toute garde applicative.
   */
  async refundPayment(paymentIntentId: string) {
    const stripe = getStripe();
    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        reverse_transfer: true,
        refund_application_fee: true,
      },
      { idempotencyKey: `refund_${paymentIntentId}` }
    );
    return { id: refund.id, status: refund.status, amount: refund.amount };
  },

  async getStatus(accountId) {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(accountId);
    return { ready: account.charges_enabled === true };
  },
};
