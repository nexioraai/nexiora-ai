import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getProvider } from '@/lib/payments';
import type { CartItem } from '@/lib/payments/types';

/** POST /api/shop/checkout → crée la session de paiement. Body: { slug, items } (route publique : un client final achète). */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { slug, items } = body as { slug?: string; items?: CartItem[] };
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    if (!items || items.length === 0) return NextResponse.json({ error: 'Panier vide' }, { status: 400 });

    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, payment_provider, payment_account_id, shipping_flat')
      .eq('slug', slug)
      .single();
    if (siteError || !site) return NextResponse.json({ error: 'Site introuvable' }, { status: 404 });
    if (!site.payment_account_id) return NextResponse.json({ error: 'Paiements non configurés pour ce site' }, { status: 400 });

    const origin = new URL(req.url).origin;
    const successUrl = `${origin}/sites/${slug}?paid=1`;
    const cancelUrl = `${origin}/sites/${slug}?canceled=1`;

    const provider = getProvider(site.payment_provider);
    const { url, orderId } = await provider.createCheckout(
      site.payment_account_id,
      slug,
      items,
      successUrl,
      cancelUrl,
      Number(site.shipping_flat) || 0
    );

    const amount = items.reduce((sum, i) => sum + i.priceNumber * i.quantity, 0);
    await supabaseAdmin.from('shop_orders').insert({
      site_id: site.id,
      status: 'pending',
      total: amount,
      currency: items[0].currency,
      payment_provider: site.payment_provider || 'stripe',
      payment_account_id: site.payment_account_id,
      payment_ref: orderId,
    });

    return NextResponse.json({ url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
