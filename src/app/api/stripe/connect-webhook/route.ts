import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';
import { handlePaidCheckout } from '@/lib/shop/handlePaidCheckout';

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
        await handlePaidCheckout(session);
        break;
      }
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
