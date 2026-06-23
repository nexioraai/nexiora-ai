import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjCalculateFreight } from '@/lib/cj/client';
import { STRIPE_SHIPPING_COUNTRIES } from '@/lib/payments/countries';

/**
 * POST /api/shop/shipping/calculate (public : un client final calcule ses frais).
 * Body: { slug, items: [{ id, quantity }], countryCode }
 * Calcule le vrai cout de port CJ pour le pays choisi (option la moins chere).
 * Repli sur le forfait du marchand (shipping_flat) si CJ echoue ou produits non-CJ.
 */
export async function POST(req: Request) {
  try {
    const { slug, items, countryCode } = await req.json() as {
      slug?: string;
      items?: { id: string; quantity: number }[];
      countryCode?: string;
    };

    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    if (!items || items.length === 0) return NextResponse.json({ error: 'Panier vide' }, { status: 400 });
    if (!countryCode || !STRIPE_SHIPPING_COUNTRIES.includes(countryCode as any)) {
      return NextResponse.json({ error: 'Pays invalide' }, { status: 400 });
    }

    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id, cj_email, cj_api_key, shipping_flat')
      .eq('slug', slug)
      .single();
    if (!site) return NextResponse.json({ error: 'Site introuvable' }, { status: 404 });

    const flat = Number(site.shipping_flat) || 0;

    // Recupere les cj_vid des produits du panier
    const ids = items.map((i) => i.id);
    const { data: products } = await supabaseAdmin
      .from('shop_products')
      .select('id, cj_vid')
      .in('id', ids);

    const vidById = new Map<string, string>();
    (products || []).forEach((p: any) => { if (p.cj_vid) vidById.set(p.id, p.cj_vid); });

    // Lignes CJ uniquement (produits avec cj_vid). Si aucune -> forfait.
    const cjProducts = items
      .filter((i) => vidById.has(i.id))
      .map((i) => ({ vid: vidById.get(i.id)!, quantity: i.quantity }));

    if (cjProducts.length === 0 || !site.cj_email || !site.cj_api_key) {
      return NextResponse.json({ shipping: flat, source: 'flat' });
    }

    try {
      const options = await cjCalculateFreight(site.cj_email, site.cj_api_key, countryCode, cjProducts);
      const list = Array.isArray(options) ? options : [];
      // Cherche le cout le plus bas parmi les champs de prix possibles
      const prices = list
        .map((o: any) => Number(o?.logisticPrice ?? o?.price ?? o?.freightAmount))
        .filter((n) => Number.isFinite(n) && n >= 0);
      if (prices.length === 0) {
        return NextResponse.json({ shipping: flat, source: 'flat' });
      }
      const cheapest = Math.min(...prices);
      return NextResponse.json({ shipping: Math.round(cheapest * 100) / 100, source: 'cj' });
    } catch (e) {
      // CJ indisponible -> repli forfait, ne casse jamais le checkout
      return NextResponse.json({ shipping: flat, source: 'flat' });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
