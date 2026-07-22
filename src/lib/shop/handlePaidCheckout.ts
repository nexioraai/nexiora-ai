import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { decrementStock } from '@/lib/shop';
import { fulfillCjOrder } from '@/lib/cj/fulfill';
import { fulfillPodOrder } from '@/lib/suppliers/pod-fulfill';
import { fulfillZendropOrder } from '@/lib/suppliers/zendrop-fulfill';
import { sendOrderConfirmationEmail } from '@/lib/email/sendOrderConfirmationEmail';

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
    .select('id, estimated_delivery, site_id')
    .maybeSingle();

  if (!order) return;

  // Dropshipping CJ : cree les commandes fournisseur pour les lignes CJ.
  try {
    await fulfillCjOrder(order.id);
  } catch (e) {
    console.error('CJ fulfill error:', e);
  }
  // Zendrop fulfill
  try {
    await fulfillZendropOrder(order.id);
  } catch (e) {
    console.error('Zendrop fulfill error:', e);
  }
  // POD fulfill (Printful/Printify) avec designs custom
  try {
    await fulfillPodOrder(order.id);
  } catch (e) {
    console.error('POD fulfill error:', e);
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
    });
  } catch (emailErr) {
    console.error('Order confirmation email error:', emailErr);
  }
}
