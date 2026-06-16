import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { stripe } from '@/lib/stripe';

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig!, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      // Abonnement activé / renouvelé : on publie
      case 'checkout.session.completed':
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const obj: any = event.data.object;
        const customerId = obj.customer as string;
        const status = obj.status || 'active';
        const isActive = status === 'active' || status === 'trialing';

        await supabase
          .from('sites')
          .update({
            published: isActive,
            subscription_status: status,
          })
          .eq('stripe_customer_id', customerId);
        break;
      }
      // Abonnement annulé : on dépublie
      case 'customer.subscription.deleted': {
        const obj: any = event.data.object;
        const customerId = obj.customer as string;

        await supabase
          .from('sites')
          .update({
            published: false,
            subscription_status: 'canceled',
          })
          .eq('stripe_customer_id', customerId);
        break;
      }
    }
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('Webhook handler error:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }
}
