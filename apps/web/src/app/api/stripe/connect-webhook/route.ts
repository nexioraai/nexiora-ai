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
        // Audit Mode 3/POD BRAND, perfectionnement -- cause racine : seule
        // ecriture de statut de tout le repo sans garde CAS (`.eq('status', ...)`),
        // contrairement au patron systematiquement applique ailleurs
        // (handlePaidCheckout.ts, orders/route.ts PATCH, cj-tracking/route.ts,
        // cancel-order/route.ts via cancelShopOrderAtomic). Stripe ne devrait
        // jamais emettre 'expired' pour une session deja 'completed', mais
        // rien ne garantit l'ORDRE de livraison des webhooks (retry, deux
        // webhooks Stripe distincts pour la meme session -- ce projet en a
        // deux, voir handlePaidCheckout.ts) : sans garde, un 'expired' recu
        // apres un 'completed' deja traite ecraserait silencieusement une
        // commande payee (voire deja expediee) en 'canceled'. Une session
        // n'expire legitimement que si elle n'a jamais ete payee -- la
        // commande doit donc etre encore 'pending'.
        await supabase
          .from('shop_orders')
          .update({ status: 'canceled' })
          .eq('payment_ref', session.id)
          .eq('status', 'pending');
        break;
      }
    }
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('Connect webhook handler error:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }
}
