import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase, supabaseAdmin } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';
import { handlePaidCheckout } from '@/lib/shop/handlePaidCheckout';
import { provisionDomain } from '@/lib/domains/provision';

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig!, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      // Argent encaisse : c'est le seul moment ou Nexiora engage une depense
      // chez Porkbun. Vaut aussi pour les renouvellements annuels, d'ou la
      // reprise via provisionDomain qui saute les etapes deja faites.
      case 'invoice.paid': {
        const inv: any = event.data.object;
        const subId = inv.subscription as string | null;
        if (!subId) break;
        const sub = await getStripe().subscriptions.retrieve(subId);
        const domainId = (sub.metadata as any)?.nexiora_domain_id;
        if (!domainId) break;
        await supabaseAdmin
          .from('site_domains')
          .update({
            status: 'paid',
            renews_at: (sub as any).current_period_end
              ? new Date((sub as any).current_period_end * 1000).toISOString()
              : null,
          })
          .eq('id', domainId)
          .eq('status', 'pending');
        await provisionDomain(domainId);
        break;
      }

      // Paiement echoue : aucun achat, la ligne reste en erreur explicite.
      case 'invoice.payment_failed': {
        const inv: any = event.data.object;
        const subId = inv.subscription as string | null;
        if (!subId) break;
        const sub = await getStripe().subscriptions.retrieve(subId);
        const domainId = (sub.metadata as any)?.nexiora_domain_id;
        if (!domainId) break;
        await supabaseAdmin
          .from('site_domains')
          .update({ status: 'failed', last_error: 'Paiement refuse' })
          .eq('id', domainId);
        break;
      }

      // Abonnement activé / renouvelé : on publie
      case 'checkout.session.completed':
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const obj: any = event.data.object;
        // Achat boutique (mode=payment) : fulfillment dropshipping, PAS un abonnement.
        if (event.type === 'checkout.session.completed' && obj?.mode === 'payment') {
          await handlePaidCheckout(obj);
          break;
        }
        const customerId = obj.customer as string;

        // Un abonnement domaine ne dit rien de la publication du site : il ne
        // doit ni publier ni depublier quoi que ce soit. Sans ce filtre,
        // acheter un domaine (abonnement cree en 'incomplete') depublierait
        // tous les sites du marchand.
        if (obj?.metadata?.nexiora_domain_id) break;

        const isCheckout = event.type === 'checkout.session.completed';
        const status = isCheckout ? 'active' : (obj.status || 'active');
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

        // Idem : l'arret d'un abonnement domaine ne depublie pas les sites.
        if (obj?.metadata?.nexiora_domain_id) break;

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
