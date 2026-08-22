import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);
    if (userError || !user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await req.json();
    if (!slug) {
      return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    }

    // Récupérer le site de l'utilisateur (sécurité : slug ET owner_email)
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('slug, owner_email, stripe_customer_id')
      .eq('slug', slug)
      .eq('owner_email', user.email)
      .single();

    if (siteError || !site) {
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 });
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
          email: user.email,
          metadata: { slug: site.slug, owner_email: user.email },
        },
        { idempotencyKey: `nexiora_site_publish_customer_${site.slug}` }
      );
      customerId = customer.id;
      await supabase
        .from('sites')
        .update({ stripe_customer_id: customerId })
        .eq('slug', slug)
        .eq('owner_email', user.email);
    }

    // Origine pour les URLs de retour (local vs prod automatiquement)
    const origin = req.headers.get('origin') || 'https://www.deribfy.com';

    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      success_url: `${origin}/welcome?slug=${site.slug}`,
      cancel_url: `${origin}/dashboard?checkout=canceled`,
      metadata: { slug: site.slug, owner_email: user.email },
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
