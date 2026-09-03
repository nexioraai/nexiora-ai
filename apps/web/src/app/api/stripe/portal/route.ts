import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * P0-3.9.7 — Sécurité : cette route ouvrait auparavant un portail de
 * facturation Stripe pour n'importe quel `siteSlug` fourni, sans vérifier
 * que l'appelant en est propriétaire (accès financier cross-tenant réel).
 * Corrigé en réutilisant requireSiteOwner(), déjà utilisé ailleurs dans le
 * repo pour exactement ce contrôle — aucun nouveau mécanisme introduit.
 */
export async function POST(req: NextRequest) {
  try {
    const { siteSlug } = await req.json();
    if (!siteSlug) return NextResponse.json({ error: 'Missing siteSlug' }, { status: 400 });

    const auth = await requireSiteOwner(req, siteSlug, 'id, stripe_customer_id');
    if (!auth.ok) return auth.response;

    const stripeCustomerId = (auth.site as { stripe_customer_id?: string }).stripe_customer_id;
    if (!stripeCustomerId) {
      return NextResponse.json({ error: 'No billing info' }, { status: 404 });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.deribfy.com'}/parametres`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Portal error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
