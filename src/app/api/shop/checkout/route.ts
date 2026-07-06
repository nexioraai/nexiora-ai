import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getProvider } from '@/lib/payments';
import { checkStock } from '@/lib/shop';
import type { CartItem } from '@/lib/payments/types';
import { cjCalculateFreight } from '@/lib/cj/client';
import { STRIPE_SHIPPING_COUNTRIES } from '@/lib/payments/countries';

/** POST /api/shop/checkout → crée la session de paiement. Body: { slug, items } (route publique : un client final achète). */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { slug, items, countryCode } = body as { slug?: string; items?: CartItem[]; countryCode?: string };
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    if (!items || items.length === 0) return NextResponse.json({ error: 'Panier vide' }, { status: 400 });

    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, payment_provider, payment_account_id, shipping_flat, cj_email, cj_api_key')
      .eq('slug', slug)
      .single();
    if (siteError || !site) return NextResponse.json({ error: 'Site introuvable' }, { status: 404 });
    if (!site.payment_account_id) return NextResponse.json({ error: 'Paiements non configurés pour ce site' }, { status: 400 });

    const stock = await checkStock(items.map((i) => ({ id: i.id, quantity: i.quantity })));
    if (!stock.ok) return NextResponse.json({ error: stock.reason }, { status: 409 });

    const origin = new URL(req.url).origin;
    const successUrl = `${origin}/sites/${slug}?paid=1`;
    const cancelUrl = `${origin}/sites/${slug}?canceled=1`;

    // Calcul serveur du frais de port : vrai cout CJ si possible, sinon forfait.
    // On ne fait jamais confiance a un montant envoye par le client.
    let shippingAmount = Number(site.shipping_flat) || 0;
    let estimatedDelivery: string | null = null;
    if (countryCode && STRIPE_SHIPPING_COUNTRIES.includes(countryCode as any) && site.cj_email && site.cj_api_key) {
      try {
        const ids = items.map((i) => i.id);
        const { data: prods } = await supabaseAdmin
          .from('shop_products')
          .select('id, cj_vid')
          .in('id', ids);
        const vidById = new Map<string, string>();
        (prods || []).forEach((p: any) => { if (p.cj_vid) vidById.set(p.id, p.cj_vid); });
        const cjProducts = items
          .filter((i) => vidById.has(i.id))
          .map((i) => ({ vid: vidById.get(i.id)!, quantity: i.quantity }));
        if (cjProducts.length > 0) {
          const options = await cjCalculateFreight(site.cj_email, site.cj_api_key, countryCode, cjProducts);
          const list = Array.isArray(options) ? options : [];
          const prices = list
            .map((o: any) => Number(o?.logisticPrice ?? o?.price ?? o?.freightAmount))
            .filter((n) => Number.isFinite(n) && n >= 0);
          if (prices.length > 0) {
            const cheapest = Math.min(...prices);
            shippingAmount = Math.round(cheapest * 100) / 100;
            const bestOption = list.find((o: any) => Number(o?.logisticPrice ?? o?.price ?? o?.freightAmount) === cheapest);
            estimatedDelivery = bestOption?.logisticAging || null;
          }
        }
      } catch (e) {
        // CJ indisponible -> on garde le forfait. Ne casse jamais le checkout.
      }
    }

    const provider = getProvider(site.payment_provider);
    const { url, orderId } = await provider.createCheckout(
      site.payment_account_id,
      slug,
      items,
      successUrl,
      cancelUrl,
      shippingAmount
    );

    const amount = items.reduce((sum, i) => sum + i.priceNumber * i.quantity, 0);
    const { data: order } = await supabaseAdmin
      .from('shop_orders')
      .insert({
        site_id: site.id,
        status: 'pending',
        total: amount,
        currency: items[0].currency,
        payment_provider: site.payment_provider || 'stripe',
        payment_account_id: site.payment_account_id,
        payment_ref: orderId,
        estimated_delivery: estimatedDelivery,
      })
      .select('id')
      .single();

    if (order) {
      await supabaseAdmin.from('shop_order_items').insert(
        items.map((i) => ({
          order_id: order.id,
          product_id: i.id,
          product_name: i.name,
          quantity: i.quantity,
          unit_price: i.priceNumber,
        }))
      );
    }

    return NextResponse.json({ url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
