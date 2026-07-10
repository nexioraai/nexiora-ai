import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjCalculateFreight, cjGetVariants } from '@/lib/cj/client';
import { STRIPE_SHIPPING_COUNTRIES } from '@/lib/payments/countries';

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

    // Recupere les cj_vid des produits du panier (shop + catalog)
    const ids = items.map((i) => i.id);
    const shopIds = ids.filter((id) => !id.startsWith('catalog-'));
    const catalogIds = ids.filter((id) => id.startsWith('catalog-'));
    const vidById = new Map<string, string>();

    // Shop products (cj_vid direct)
    if (shopIds.length > 0) {
      const { data: products } = await supabaseAdmin
        .from('shop_products')
        .select('id, cj_vid')
        .in('id', shopIds);
      (products || []).forEach((p: any) => { if (p.cj_vid) vidById.set(p.id, p.cj_vid); });
    }

    // Catalog products (resolve vid via supplier_product_id)
    if (catalogIds.length > 0 && site.cj_email && site.cj_api_key) {
      const realIds = catalogIds.map((id) => id.replace('catalog-', ''));
      const { data: catProds } = await supabaseAdmin
        .from('catalog_products')
        .select('id, supplier_id, supplier_product_id')
        .in('id', realIds);
      for (const cp of (catProds || [])) {
        if (!cp.supplier_product_id || cp.supplier_id !== 'cj') continue;
        try {
          const variants = await cjGetVariants(site.cj_email, site.cj_api_key, cp.supplier_product_id);
          const vid = Array.isArray(variants) && variants.length > 0
            ? (variants[0].vid || variants[0].variantId)
            : null;
          if (vid) vidById.set('catalog-' + cp.id, vid);
        } catch {}
      }
    }

    // Lignes CJ uniquement. Si aucune -> forfait.
    const cjProducts = items
      .filter((i) => vidById.has(i.id))
      .map((i) => ({ vid: vidById.get(i.id)!, quantity: i.quantity }));

    if (cjProducts.length === 0 || !site.cj_email || !site.cj_api_key) {
      return NextResponse.json({ shipping: flat, source: 'flat' });
    }

    try {
      const options = await cjCalculateFreight(site.cj_email, site.cj_api_key, countryCode, cjProducts);
      const list = Array.isArray(options) ? options : [];
      const prices = list
        .map((o: any) => Number(o?.logisticPrice ?? o?.price ?? o?.freightAmount))
        .filter((n: number) => Number.isFinite(n) && n >= 0);
      if (prices.length === 0) {
        return NextResponse.json({ shipping: flat, source: 'flat' });
      }
      const cheapest = Math.min(...prices);
      const bestOption = list.find((o: any) => Number(o?.logisticPrice ?? o?.price ?? o?.freightAmount) === cheapest);
      const aging = bestOption?.logisticAging || null;
      return NextResponse.json({ shipping: Math.round(cheapest * 100) / 100, source: 'cj', aging });
    } catch {
      return NextResponse.json({ shipping: flat, source: 'flat' });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
