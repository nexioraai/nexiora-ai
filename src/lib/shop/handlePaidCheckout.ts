import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { decrementStock } from '@/lib/shop';
import { fulfillCjOrder } from '@/lib/cj/fulfill';
import { fulfillPodOrder } from '@/lib/suppliers/pod-fulfill';
import { sendOrderConfirmationEmail } from '@/lib/email/sendOrderConfirmationEmail';
import { logAnomaly } from '@/lib/anomaly';
import { getProvider } from '@/lib/payments';

/**
 * Champs reellement lus par cette fonction sur l'objet Checkout Session
 * transmis par les webhooks Stripe. `collected_information` est un champ
 * recent de l'API Stripe (deplacement de shipping_details), pas encore
 * present dans les types du SDK installe (stripe@22.2.1 au moment de ce
 * correctif) -- typage local plutot qu'un cast vers le type officiel du SDK,
 * qui ne connait pas ce champ.
 */
interface PaidCheckoutSession {
  id: string;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | { id: string } | null;
  customer_details?: { email?: string | null; name?: string | null; phone?: string | null } | null;
  shipping_details?: { address?: unknown } | null;
  collected_information?: { shipping_details?: { address?: unknown; name?: string | null } } | null;
}

/** Ligne shop_orders telle que selectionnee apres la transition pending->paid. */
type PaidOrderRow = {
  id: string;
  /** Qui execute cette vente. Decide a la creation, immuable en base. */
  fulfillment_domain: 'merchant' | 'supplier' | null;
  estimated_delivery: string | null;
  site_id: string;
  cancel_token: string | null;
  payment_provider: string;
  promo_code_id: string | null;
};

type OrderItemRow = { product_id: string | null; quantity: number };
type ShopProductRow = { id: string; cj_vid: string | null };

/**
 * Traite un paiement boutique reussi (checkout.session.completed, mode=payment).
 * Appele par les DEUX webhooks Stripe (principal + connect) pour garantir que
 * le fulfillment part quel que soit le webhook qui recoit l'evenement.
 *
 * Idempotent : fulfillCjOrder a son propre verrou, un double appel ne cree
 * pas deux commandes CJ.
 *
 * F7/F4 : la mise a jour de statut ci-dessous est desormais gardee par
 * `.eq('status', 'pending')` -- meme patron deja utilise dans ce projet pour
 * invoice.paid (src/app/api/stripe/webhook/route.ts). Demontre, pas suppose :
 * un UPDATE...WHERE Postgres verrouille la ligne pendant la transaction ; sous
 * deux appels strictement concurrents pour le meme paiement, le second se
 * resout TOUJOURS contre l'etat deja valide (committed) du premier, jamais
 * contre un etat perime -- sa clause WHERE ne correspond alors plus a aucune
 * ligne, `order` devient null, la fonction retourne immediatement. Comme
 * cette garde est la toute premiere operation, elle protege transitivement
 * TOUT le reste de la fonction (fulfillment CJ/POD, decrement de stock,
 * email) contre un webhook rejoue -- aucun mecanisme supplementaire requis
 * pour ce point precis.
 */
export async function handlePaidCheckout(session: PaidCheckoutSession): Promise<void> {
  // Adresse de livraison : Stripe a deplace shipping_details dans
  // collected_information (versions recentes). On lit les deux emplacements.
  // Telephone (audit adresse Reseller/CJ, partie 7) : Stripe le place sur
  // customer_details.phone, jamais imbrique dans l'adresse -- fusionne ici,
  // au point d'ecriture unique de shipping_address (jamais reecrit ensuite,
  // cf. audit idempotence), plutot que duplique dans fulfill.ts/pod-fulfill.ts.
  const shippingAddressRaw =
    session.collected_information?.shipping_details?.address ??
    session.shipping_details?.address ??
    null;
  const shippingAddress = shippingAddressRaw
    ? { ...shippingAddressRaw, phone: session.customer_details?.phone ?? undefined }
    : null;
  const customerName =
    session.collected_information?.shipping_details?.name ??
    session.customer_details?.name ??
    null;
  const customerEmail = session.customer_details?.email ?? null;
  // Necessaire pour rembourser plus tard (annulation, ou F7 plus bas si le
  // stock s'avere finalement insuffisant) : Stripe rembourse un
  // payment_intent, pas une session. Calcule une seule fois, reutilise pour
  // l'ecriture ET pour l'appel de remboursement eventuel plus bas -- pas
  // besoin de le relire depuis la base.
  const paymentIntentId: string | null = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  const { data: orderRaw } = await supabase
    .from('shop_orders')
    .update({
      status: 'paid',
      customer_email: customerEmail,
      customer_name: customerName,
      shipping_address: shippingAddress,
      payment_intent_id: paymentIntentId,
    })
    .eq('payment_ref', session.id)
    // F4/F7 : garde d'idempotence -- voir commentaire de fonction ci-dessus.
    .eq('status', 'pending')
    .select('id, fulfillment_domain, estimated_delivery, site_id, cancel_token, payment_provider, promo_code_id')
    .maybeSingle();
  const order = orderRaw as PaidOrderRow | null;

  if (!order) return;

  // ---- Consommation du code promo (passe de cloture, P-4) ----
  // Cause racine : `used_count` n'etait JAMAIS incremente nulle part --
  // `max_uses` etait purement decoratif, un code limite a 10 utilisations
  // etait utilisable indefiniment.
  //
  // Placement deliberе ICI et non au checkout : une utilisation doit
  // correspondre a un paiement REELLEMENT accepte, jamais a une session
  // abandonnee. Ce point est protege par le CAS `.eq('status','pending')`
  // ci-dessus, qui garantit que ce bloc s'execute EXACTEMENT UNE FOIS par
  // commande -- un webhook rejoue (ou le second des deux webhooks Stripe de
  // ce projet) ne trouve plus 'pending' et sort avant d'arriver ici. Aucun
  // double comptage possible, sans mecanisme d'idempotence supplementaire.
  //
  // L'increment lui-meme passe par consume_promo_code() (RPC atomique) :
  // un simple SELECT puis UPDATE serait vulnerable a la course entre deux
  // paiements simultanes. La RPC applique
  // `UPDATE ... WHERE id = ? AND (max_uses IS NULL OR used_count < max_uses)`,
  // dont la clause WHERE est reevaluee par Postgres APRES acquisition du
  // verrou de ligne -- deux transactions concurrentes se serialisent donc
  // reellement et max_uses ne peut pas etre depasse.
  if (order.promo_code_id) {
    const { data: consumed, error: consumeErr } = await supabase.rpc('consume_promo_code', {
      p_promo_id: order.promo_code_id,
    });
    if (consumeErr || !consumed?.success) {
      // Le paiement est deja encaisse et la remise deja accordee par Stripe :
      // on ne peut plus revenir en arriere. Cas realiste : le code a atteint
      // max_uses entre la creation de la session et la confirmation du
      // paiement. On trace pour que le marchand le voie, on ne bloque jamais
      // une commande payee.
      await logAnomaly({
        type: 'promo_consume_failed',
        severity: 'warning',
        siteId: order.site_id,
        details: { orderId: order.id, promoCodeId: order.promo_code_id, reason: consumeErr?.message ?? consumed?.reason ?? 'unknown' },
      });
    }
  }

  // ---- AIGUILLAGE DE DOMAINE (phase 3) ----
  // Plan de reference : docs/PLAN-SEPARATION-MODE2-MODE3.md
  //
  // Ce point n'est plus un moteur de decision : c'est une LECTURE. Le domaine
  // a ete decide une seule fois, a la creation de la commande, et il est
  // immuable en base. Rien ici ne consulte le mode du site, le sous-type, ni
  // un fournisseur -- il n'y a donc aucune regle metier a y ecrire, et c'est
  // precisement ce qui empeche ce point de redevenir un lieu de fusion entre
  // les deux domaines.
  //
  // CE QUE CELA FERME. Avant cette phase, les deux moteurs fournisseur
  // etaient appeles INCONDITIONNELLEMENT. Mesure sur le code deploye : une
  // commande Mode 2 atteignait reellement la creation de commande chez CJ, et
  // reellement `adapter.createOrder` chez Printful.
  //
  // Une commande marchande ne descend dans aucun de ces deux moteurs. Le
  // decrement de stock et l'e-mail acheteur, eux, restent COMMUNS aux deux
  // domaines et se poursuivent plus bas : ce sont des responsabilites du
  // tronc commun, pas du domaine fournisseur.
  //
  // Paiement deja encaisse (status='paid' ci-dessus) : un echec de fulfillment
  // ne doit jamais bloquer la suite, seulement rester visible.
  if (order.fulfillment_domain === 'supplier') {
    try {
      await fulfillCjOrder(order.id);
    } catch (e) {
      console.error('CJ fulfill error:', e);
      await logAnomaly({
        type: 'cj_fulfill_failed',
        siteId: order.site_id,
        details: { orderId: order.id, reason: e instanceof Error ? e.message : String(e) },
      });
    }
    try {
      await fulfillPodOrder(order.id);
    } catch (e) {
      console.error('POD fulfill error:', e);
      await logAnomaly({
        type: 'pod_fulfill_failed',
        siteId: order.site_id,
        details: { orderId: order.id, reason: e instanceof Error ? e.message : String(e) },
      });
    }
  }
  // Decrement du stock uniquement pour les produits NON geres par CJ.
  // F7 : la commande entiere passe par decrement_shop_stock_batch() (RPC
  // atomique, tout ou rien) -- si le stock s'avere finalement insuffisant
  // pour au moins un produit (un autre acheteur a pu le prendre entre la
  // creation du checkout et la confirmation du paiement), AUCUN produit
  // n'est decremente et le paiement deja encaisse est rembourse
  // automatiquement, plutot que de laisser une commande payee mais
  // infulfillable silencieusement.
  let stockFailed = false;
  const { data: orderItemsRaw } = await supabase
    .from('shop_order_items')
    .select('product_id, quantity')
    .eq('order_id', order.id);
  const orderItems = orderItemsRaw as OrderItemRow[] | null;
  if (orderItems && orderItems.length > 0) {
    const { data: prodsRaw } = await supabase
      .from('shop_products')
      .select('id, cj_vid')
      .in('id', orderItems.filter((it) => it.product_id).map((it) => it.product_id));
    const prods = prodsRaw as ShopProductRow[] | null;
    const cjProductIds = new Set((prods || []).filter((p) => p.cj_vid).map((p) => p.id));
    const stockItems = orderItems
      .filter((it) => it.product_id && !cjProductIds.has(it.product_id))
      .map((it) => ({ id: it.product_id as string, quantity: it.quantity }));
    if (stockItems.length > 0) {
      // F9/F10 : orderId transmis pour que la RPC marque atomiquement (même
      // transaction que la décrémentation) quelles lignes ont réellement été
      // décrémentées -- seule source de vérité pour une restauration
      // déterministe à l'annulation (cancelShopOrderAtomic, shop.ts).
      const result = await decrementStock(stockItems, order.id);
      if (!result.ok) {
        stockFailed = true;
        await logAnomaly({
          type: 'stock_insufficient_after_payment',
          severity: 'blocked',
          siteId: order.site_id,
          details: { orderId: order.id, reason: result.reason, productId: result.productId },
        });
        // Remboursement automatique integral : le client a paye pour une
        // commande qui ne peut finalement pas etre honoree. Idempotence :
        // - cote Deribfy, ce chemin ne peut s'executer qu'une fois par
        //   commande (garde .eq('status','pending') deja demontree en tete
        //   de fichier -- decrementStock ne s'appelle qu'une fois par
        //   webhook reellement traite).
        // - cote Stripe, refundPayment() passe desormais sa propre cle
        //   d'idempotence (voir stripe.ts) : meme si ce code etait un jour
        //   appele une seconde fois par un chemin different, Stripe renvoie
        //   le meme remboursement au lieu d'en creer un second.
        try {
          const provider = getProvider(order.payment_provider);
          if (paymentIntentId) {
            await provider.refundPayment(paymentIntentId);
            // Meme garde que la transition pending->paid : n'ecrase jamais
            // un statut deja avance par un autre traitement concurrent.
            await supabase
              .from('shop_orders')
              .update({ status: 'refunded' })
              .eq('id', order.id)
              .eq('status', 'paid');
          }
        } catch (refundErr) {
          // Meme philosophie que cancel-order/route.ts : un remboursement
          // qui echoue est une situation a traiter manuellement, on alerte
          // immediatement plutot que de retenter automatiquement (un retry
          // automatique non garde pourrait lui-meme causer un double
          // remboursement).
          await logAnomaly({
            type: 'refund_failed',
            severity: 'blocked',
            siteId: order.site_id,
            details: { orderId: order.id, reason: refundErr instanceof Error ? refundErr.message : String(refundErr) },
          });
        }
      }
    }
  }
  // Email de confirmation de commande -- jamais envoye si la commande vient
  // d'etre remboursee faute de stock (le client recoit deja la confirmation
  // de remboursement de Stripe ; lui envoyer "commande confirmee" serait
  // trompeur).
  if (!stockFailed) {
    try {
      const { data: siteData } = await supabase
        .from('sites')
        .select('name')
        .eq('id', order.site_id)
        .single();
      await sendOrderConfirmationEmail({
        to: customerEmail ?? '',
        customerName: customerName ?? undefined,
        shopName: siteData?.name || 'Votre boutique',
        orderId: order.id,
        total: (session.amount_total || 0) / 100,
        currency: session.currency || 'usd',
        estimatedDelivery: order.estimated_delivery || undefined,
        cancelToken: order.cancel_token || undefined,
        siteOrigin: process.env.NEXT_PUBLIC_SITE_URL || 'https://www.deribfy.com',
      });
    } catch (emailErr) {
      console.error('Order confirmation email error:', emailErr);
    }
  }
}
