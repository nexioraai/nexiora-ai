import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { decrementStock } from '@/lib/shop';
import { fulfillCjOrder } from '@/lib/cj/fulfill';
import { fulfillPodOrder } from '@/lib/suppliers/pod-fulfill';
import { sendOrderConfirmationEmail } from '@/lib/email/sendOrderConfirmationEmail';
import { logAnomaly } from '@/lib/anomaly';

/**
 * Traite un paiement boutique reussi (checkout.session.completed, mode=payment).
 * Appele par les DEUX webhooks Stripe (principal + connect) pour garantir que
 * le fulfillment part quel que soit le webhook qui recoit l'evenement.
 *
 * Idempotent : fulfillCjOrder a son propre verrou, un double appel ne cree
 * pas deux commandes CJ.
 */
export async function handlePaidCheckout(session: any): Promise<void> {
  // Adresse de livraison : Stripe a deplace shipping_details dans
  // collected_information (versions recentes). On lit les deux emplacements.
  const shippingAddress =
    session.collected_information?.shipping_details?.address ??
    session.shipping_details?.address ??
    null;
  const customerName =
    session.collected_information?.shipping_details?.name ??
    session.customer_details?.name ??
    null;
  const customerEmail = session.customer_details?.email ?? null;

  const { data: order } = await supabase
    .from('shop_orders')
    .update({
      status: 'paid',
      customer_email: customerEmail,
      customer_name: customerName,
      shipping_address: shippingAddress,
      // Necessaire pour rembourser plus tard (annulation) : Stripe rembourse
      // un payment_intent, pas une session.
      payment_intent_id: typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
    })
    .eq('payment_ref', session.id)
    .select('id, estimated_delivery, site_id, cancel_token')
    .maybeSingle();

  if (!order) return;

  // Dropshipping CJ : cree les commandes fournisseur pour les lignes CJ.
  // Paiement deja encaisse (status='paid' ci-dessus) : un echec ici ne doit
  // jamais bloquer la suite (stock/email), seulement rester visible — le
  // verrou cj_pay_status/cj_pay_attempts protege deja contre la double
  // commande, cette anomalie ne fait qu'exposer un echec sinon invisible.
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
  // POD fulfill (Printful/Printify/Gelato) avec designs custom. Idempotence
  // deja assuree par le moteur P0-3.7/3.8 (create_provider_submission) :
  // meme logique, on ajoute uniquement la visibilite sur un echec inattendu.
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
  // Decrement du stock uniquement pour les produits NON geres par CJ.
  const { data: orderItems } = await supabase
    .from('shop_order_items')
    .select('product_id, quantity')
    .eq('order_id', order.id);
  if (orderItems && orderItems.length > 0) {
    const { data: prods } = await supabase
      .from('shop_products')
      .select('id, cj_vid')
      .in('id', orderItems.filter((it: any) => it.product_id).map((it: any) => it.product_id));
    const cjProductIds = new Set((prods || []).filter((p: any) => p.cj_vid).map((p: any) => p.id));
    const stockItems = orderItems
      .filter((it: any) => it.product_id && !cjProductIds.has(it.product_id))
      .map((it: any) => ({ id: it.product_id, quantity: it.quantity }));
    if (stockItems.length > 0) {
      await decrementStock(stockItems);
    }
  }
  // Email de confirmation de commande
  try {
    const { data: siteData } = await supabase
      .from('sites')
      .select('name')
      .eq('id', order.site_id)
      .single();
    await sendOrderConfirmationEmail({
      to: customerEmail,
      customerName: customerName,
      shopName: siteData?.name || 'Votre boutique',
      orderId: order.id,
      total: (session.amount_total || 0) / 100,
      currency: session.currency || 'usd',
      estimatedDelivery: order.estimated_delivery || undefined,
      cancelToken: (order as any).cancel_token || undefined,
      siteOrigin: process.env.NEXT_PUBLIC_SITE_URL || 'https://deribfy.com',
    });
  } catch (emailErr) {
    console.error('Order confirmation email error:', emailErr);
  }
}
