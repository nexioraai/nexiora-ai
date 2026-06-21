import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';
import { decrementStock } from '@/lib/shop';
import { fulfillCjOrder } from '@/lib/cj/fulfill';

/**
 * Webhook dédié aux paiements boutique (Stripe Connect).
 * Distinct du webhook abonnements : ces événements proviennent des comptes
 * connectés des marchands et utilisent leur propre secret de signature.
 */
export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_CONNECT_WEBHOOK_SECRET manquant');
    return NextResponse.json({ error: 'Config error' }, { status: 500 });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig!, webhookSecret);
  } catch (err: any) {
    console.error('Connect webhook signature failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      // Paiement boutique réussi → commande payée
      case 'checkout.session.completed': {
        const session: any = event.data.object;
        const { data: order } = await supabase
          .from('shop_orders')
          .update({
            status: 'paid',
            customer_email: session.customer_details?.email ?? null,
            customer_name: session.customer_details?.name ?? null,
            shipping_address: session.shipping_details?.address ?? session.collected_information?.shipping_details?.address ?? null,
          })
          .eq('payment_ref', session.id)
          .select('id')
          .maybeSingle();

        if (order) {
          // Dropshipping CJ : crée les commandes fournisseur pour les lignes CJ.
          let cjVids: string[] = [];
          try {
            cjVids = await fulfillCjOrder(order.id);
          } catch (e) {
            console.error('CJ fulfill error:', e);
          }

          // Décrément du stock uniquement pour les produits NON gérés par CJ.
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
        }
        break;
      }
      // Paiement expiré / abandonné → commande annulée
      case 'checkout.session.expired': {
        const session: any = event.data.object;
        await supabase
          .from('shop_orders')
          .update({ status: 'canceled' })
          .eq('payment_ref', session.id);
        break;
      }
    }
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('Connect webhook handler error:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }
}
