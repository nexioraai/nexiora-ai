import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase, supabaseAdmin } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';
import { handlePaidCheckout } from '@/lib/shop/handlePaidCheckout';
import { provisionDomain } from '@/lib/domains/provision';
import { resilierRenouvellement } from '@/lib/domains/renewal';
import { consignerEvenementDomaine } from '@/lib/domains/history';

// provisionDomain() enchaine Porkbun + Vercel + plusieurs ecritures DNS +
// Google, en serie : sans ce delai plus long (meme valeur que la route de
// provisioning manuel domains/provision/route.ts, qui fait exactement la
// meme chaine), Vercel pouvait couper la fonction avant la fin sur un achat
// lent, laissant le domaine bloque en 'paid' sans qu'aucun cron ne le
// reprenne (domain-retry ne surveille que 'failed').
export const maxDuration = 120;

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
        // ============================================================
        // F-1 -- LE RENOUVELLEMENT N'ATTEIGNAIT JAMAIS LA BASE.
        //
        // L'unique ecriture etait filtree par `.eq('status', 'pending')`. En
        // annee 2, le statut vaut `sitemap_submitted` : RIEN n'etait ecrit,
        // `renews_at` restait fige sur l'annee 1, et `provisionDomain`
        // sortait immediatement. Deribfy encaissait un renouvellement et n'en
        // gardait aucune trace.
        //
        // DEUX ECRITURES DISTINCTES DESORMAIS, parce que ce sont deux faits
        // differents :
        //   * `renews_at` est vrai a CHAQUE facture payee -- premier achat
        //     comme renouvellement. Il est donc ecrit sans condition de
        //     statut.
        //   * `status: 'paid'` est une TRANSITION du provisionnement initial.
        //     La conditionner a `pending` reste correct : un renouvellement ne
        //     doit surtout pas ramener un domaine deja provisionne a un etat
        //     anterieur.
        //
        // CE QUE STRIPE PROUVE ET CE QU'IL NE PROUVE PAS. Une facture payee
        // prouve que le CLIENT a paye Deribfy. Elle ne prouve pas que le
        // registraire a renouvele : c'est l'auto-renouvellement du compte qui
        // le fait, hors de ce code. `renews_at` reflete donc la periode
        // FACTUREE, jamais une garantie d'enregistrement -- et le journal
        // consigne l'evenement pour que l'ecart soit reconciliable.
        // ============================================================
        const finPeriode = (sub as any).current_period_end
          ? new Date((sub as any).current_period_end * 1000).toISOString()
          : null;

        await supabaseAdmin
          .from('site_domains')
          .update({ renews_at: finPeriode, updated_at: new Date().toISOString() })
          .eq('id', domainId);

        const { data: ligneRenouvelee } = await supabaseAdmin
          .from('site_domains')
          .select('site_id, domain, status')
          .eq('id', domainId)
          .maybeSingle();

        if (ligneRenouvelee?.domain) {
          await consignerEvenementDomaine({
            siteId: (ligneRenouvelee.site_id as string) ?? null,
            domain: ligneRenouvelee.domain as string,
            evenement:
              (ligneRenouvelee.status as string) === 'pending' ? 'achat_confirme' : 'renouvellement',
            origine: 'webhook',
            details: { domainId, renewsAt: finPeriode },
          });
        }

        await supabaseAdmin
          .from('site_domains')
          .update({
            status: 'paid',
            renews_at: finPeriode,
            // Marqueur de fraicheur explicite : domain-retry s'en sert pour
            // reprendre un provisioning coupe en route (fonction interrompue
            // avant que provisionDomain n'ait pu ecrire un statut plus
            // avance), sans dependre d'un trigger DB non verifiable ici.
            updated_at: new Date().toISOString(),
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

        // ============================================================
        // F-2 -- CETTE SORTIE ETAIT INERTE, ET ELLE COUTAIT DE L'ARGENT.
        //
        // Le filtre est JUSTE : l'arret d'un abonnement domaine ne doit pas
        // depublier les sites du marchand. Mais sortir sans rien faire
        // laissait le registraire auto-renouveler AUX FRAIS DE DERIBFY, sans
        // plafond ni alerte. Le client cessait de payer ; nous continuions.
        //
        // L'annulation est desormais PROPAGEE au registraire par l'autorite
        // partagee. Son echec n'est jamais avale : il laisse un etat de
        // reconciliation explicite et une anomalie bloquante.
        // ============================================================
        const domainIdAnnule = obj?.metadata?.nexiora_domain_id;
        if (domainIdAnnule) {
          const { data: ligne } = await supabaseAdmin
            .from('site_domains')
            .select('site_id, domain')
            .eq('id', domainIdAnnule)
            .maybeSingle();
          if (ligne?.site_id && ligne?.domain) {
            await resilierRenouvellement({
              siteId: ligne.site_id as string,
              domain: ligne.domain as string,
              origine: 'webhook',
            });
          }
          break;
        }

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
