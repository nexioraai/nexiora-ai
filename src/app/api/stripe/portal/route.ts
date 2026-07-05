import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { siteSlug } = await req.json();
    if (!siteSlug) return NextResponse.json({ error: 'Missing siteSlug' }, { status: 400 });

    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('stripe_customer_id')
      .eq('slug', siteSlug)
      .single();

    if (!site?.stripe_customer_id) {
      return NextResponse.json({ error: 'No billing info' }, { status: 404 });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: site.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://www.nexiora.ca'}/parametres`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Portal error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
