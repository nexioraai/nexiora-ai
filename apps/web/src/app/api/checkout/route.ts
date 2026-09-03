import { NextResponse } from 'next/server';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';

export async function POST(req: Request) {
  try {
    const { slug } = await req.json();
    if (!slug) {
      return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    }

    // ============================================================
    // DETTE 6a, EXTENSION -- `owner_id` EST L'IDENTITE, PAS `owner_email`.
    //
    // Cette route resolvait le site par `.eq('slug', slug).eq('owner_email',
    // user.email)`, seule garde de propriete avant la creation d'un CLIENT
    // STRIPE REEL et d'une session d'abonnement.
    //
    // CE QUE CELA OUVRAIT. `sites.owner_email` est ecrite UNE SEULE FOIS, a
    // la creation du site (api/chat/route.ts), et AUCUN update ne la touche
    // jamais -- verifie par balayage. Un proprietaire qui change d'adresse
    // laisse donc la colonne figee sur l'ancienne. Quiconque obtient ensuite
    // cette adresse chez le fournisseur d'identite devenait proprietaire aux
    // yeux de cette route : il pouvait souscrire un abonnement sur le site
    // d'autrui, pendant que le proprietaire legitime en perdait l'acces.
    //
    // AUCUN MECANISME NOUVEAU. `requireSiteOwner` est la primitive canonique
    // deja employee par 18 routes : `owner_id` prioritaire, repli sur
    // `owner_email` UNIQUEMENT quand `owner_id` est encore null cote base
    // (site anterieur au backfill) -- jamais quand il est renseigne mais
    // different. Ecrire la regle ici en aurait cree une seconde copie.
    //
    // ORDRE : la propriete est tranchee AVANT tout appel Stripe.
    // ============================================================
    const auth = await requireSiteOwner(req, slug, 'id, slug, stripe_customer_id');
    if (!auth.ok) return auth.response;
    const site = auth.site as { id: string; slug: string; stripe_customer_id: string | null };

    // L'adresse sert de DONNEE Stripe (email du client, metadata), jamais de
    // cle d'identite. La route exigeait deja une adresse presente : ce
    // controle preserve ce contrat, il ne decide d'aucune propriete.
    const ownerEmail = auth.email;
    if (!ownerEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Récupérer ou créer le client Stripe. Cle d'idempotence Stripe (audit
    // Mode 3/POD BRAND, lot Stripe) : deux déclenchements quasi simultanés
    // (double-clic, deux onglets) sans cette clé créaient deux clients
    // Stripe réels distincts pour le même site -- le second écrasait
    // silencieusement stripe_customer_id du premier dans `sites`, laissant
    // une session de paiement "orpheline" que le webhook ne pourrait plus
    // jamais rattacher à ce site (customer_id introuvable dans `sites`) :
    // le marchand payait réellement sans que son site ne se publie jamais.
    // Stripe garantit qu'un même idempotencyKey renvoie TOUJOURS le même
    // objet côté Stripe (fenêtre 24h), quel que soit le nombre d'appels
    // concurrents -- élimine la duplication à la source, plus robuste
    // qu'une garde CAS côté Supabase sur l'écriture (qui n'empêcherait pas
    // la création réelle du second client Stripe, seulement son enregistrement).
    // Basé sur `slug` (stable, unique, déjà la clé de lookup partout dans ce
    // fichier) plutôt qu'un identifiant généré à la volée à chaque appel.
    let customerId = site.stripe_customer_id;
    if (!customerId) {
      const customer = await getStripe().customers.create(
        {
          email: ownerEmail,
          metadata: { slug: site.slug, owner_email: ownerEmail },
        },
        { idempotencyKey: `nexiora_site_publish_customer_${site.slug}` }
      );
      customerId = customer.id;
      // DETTE 6a, EXTENSION -- CETTE ECRITURE N'EST PAS UNE GARDE.
      // La propriete est deja tranchee ci-dessus ; sans elle on ne serait pas
      // ici. La clause `owner_email` n'y etait qu'une redondance -- mais une
      // redondance DANGEREUSE : son resultat n'etait jamais verifie, si bien
      // qu'un non-appariement aurait perdu `stripe_customer_id` EN SILENCE,
      // et le webhook n'aurait plus jamais pu rattacher le paiement au site
      // (l'incident decrit plus haut dans ce fichier).
      //
      // ANCRAGE SUR `id`, ET SURTOUT PAS SUR `owner_id`. La primitive
      // autorise encore un repli sur `owner_email` quand `owner_id` est null ;
      // filtrer sur `owner_id` casserait ce cas, PostgREST traduisant
      // `.eq(col, null)` en `col=eq.null`, qui n'apparie aucune ligne NULL.
      // La ligne dont la propriete vient d'etre etablie est designee par son
      // identifiant, sans reinterpreter la regle.
      const { error: updateError } = await supabase
        .from('sites')
        .update({ stripe_customer_id: customerId })
        .eq('id', site.id);
      if (updateError) {
        // Journalise, sans changer le flux : le client Stripe existe deja et
        // la cle d'idempotence rend un rejeu sur. Ce qui manquait, c'etait la
        // VISIBILITE de l'echec.
        console.error('Checkout: stripe_customer_id non enregistre', updateError);
      }
    }

    // Origine pour les URLs de retour (local vs prod automatiquement)
    const origin = req.headers.get('origin') || 'https://www.deribfy.com';

    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      success_url: `${origin}/welcome?slug=${site.slug}`,
      cancel_url: `${origin}/dashboard?checkout=canceled`,
      metadata: { slug: site.slug, owner_email: ownerEmail },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('Checkout error:', err);
    return NextResponse.json(
      { error: 'Server error', details: err?.message },
      { status: 500 }
    );
  }
}
