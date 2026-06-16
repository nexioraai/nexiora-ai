import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { stripe } from '@/lib/stripe';

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

    // Récupérer ou créer le client Stripe
    let customerId = site.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { slug: site.slug, owner_email: user.email },
      });
      customerId = customer.id;
      await supabase
        .from('sites')
        .update({ stripe_customer_id: customerId })
        .eq('slug', slug)
        .eq('owner_email', user.email);
    }

    // Origine pour les URLs de retour (local vs prod automatiquement)
    const origin = req.headers.get('origin') || 'https://www.nexiora.ca';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      success_url: `${origin}/welcome`,
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
