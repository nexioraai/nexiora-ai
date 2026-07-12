import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { STRIPE_SHIPPING_COUNTRIES } from '@/lib/payments/countries';
import { cjAdapter } from '@/lib/suppliers/cj-adapter';
import { printfulAdapter } from '@/lib/suppliers/printful-adapter';
import { zendropAdapter } from '@/lib/suppliers/zendrop-adapter';
import { printifyAdapter } from '@/lib/suppliers/printify-adapter';
import type { ShippingRequest } from '@/lib/suppliers/supplier-adapter';

// Registry : chaque supplier_id pointe vers son adapter
const adapters: Record<string, { calculateShipping: (items: ShippingRequest[], country: string, creds: Record<string, string>) => Promise<{ total_cost: number; currency: string; estimated_days_min: number; estimated_days_max: number }> }> = {
  cj: cjAdapter as any,
  printful: printfulAdapter as any,
  printify: printifyAdapter as any,
  zendrop: zendropAdapter as any,
};

export async function POST(req: Request) {
  try {
    const { slug, items, countryCode, stateCode } = await req.json() as {
      slug?: string;
      items?: { id: string; quantity: number }[];
      countryCode?: string;
      stateCode?: string;
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

    // Separer shop vs catalog
    const shopIds = items.filter((i) => !i.id?.startsWith('catalog-'));
    const catalogIds = items.filter((i) => i.id?.startsWith('catalog-'));

    // Shop products => CJ direct (cj_vid)
    const cjShopItems: ShippingRequest[] = [];
    if (shopIds.length > 0) {
      const { data: prods } = await supabaseAdmin
        .from('shop_products')
        .select('id, cj_vid')
        .in('id', shopIds.map((i) => i.id));
      for (const p of (prods || [])) {
        if (!p.cj_vid) continue;
        const item = shopIds.find((i) => i.id === p.id);
        if (item) cjShopItems.push({ supplier_product_id: p.cj_vid, quantity: item.quantity });
      }
    }

    // Catalog products => grouper par supplier_id
    const supplierGroups: Record<string, { supplier_product_id: string; quantity: number }[]> = {};
    if (catalogIds.length > 0) {
      const realIds = catalogIds.map((i) => i.id.replace('catalog-', ''));
      const { data: catProds } = await supabaseAdmin
        .from('catalog_products')
        .select('id, supplier_id, supplier_product_id')
        .in('id', realIds);
      for (const cp of (catProds || [])) {
        if (!cp.supplier_product_id || !cp.supplier_id) continue;
        const item = catalogIds.find((i) => i.id === 'catalog-' + cp.id);
        if (!item) continue;
        if (!supplierGroups[cp.supplier_id]) supplierGroups[cp.supplier_id] = [];
        supplierGroups[cp.supplier_id].push({
          supplier_product_id: cp.supplier_product_id,
          quantity: item.quantity,
        });
      }
    }

    // Ajouter les shop CJ au groupe CJ
    if (cjShopItems.length > 0) {
      if (!supplierGroups['cj']) supplierGroups['cj'] = [];
      supplierGroups['cj'].push(...cjShopItems);
    }

    // Credentials par fournisseur
    const creds: Record<string, Record<string, string>> = {
      cj: { email: site.cj_email || '', apiKey: site.cj_api_key || '' },
      printful: { printful_token: process.env.PRINTFUL_API_TOKEN || '', state_code: stateCode || '' },
      printify: { printify_token: process.env.PRINTIFY_API_TOKEN || '', printify_shop_id: process.env.PRINTIFY_SHOP_ID || '' },
    };

    // Appeler calculateShipping pour chaque groupe
    let totalShipping = 0;
    let minDays = 999;
    let maxDays = 0;
    const sources: string[] = [];

    const entries = Object.entries(supplierGroups);
    if (entries.length === 0) {
      return NextResponse.json({ shipping: flat, source: 'flat' });
    }

    for (const [supplierId, groupItems] of entries) {
      const adapter = adapters[supplierId];
      if (!adapter?.calculateShipping) continue;
      const supplierCreds = creds[supplierId] || {};
      try {
        const result = await adapter.calculateShipping(groupItems, countryCode, supplierCreds);
        totalShipping += result.total_cost;
        if (result.estimated_days_min < minDays) minDays = result.estimated_days_min;
        if (result.estimated_days_max > maxDays) maxDays = result.estimated_days_max;
        sources.push(supplierId);
      } catch (err: any) {
        console.error(`[shipping/calculate] ${supplierId} failed:`, err.message || err);
      }
    }

    if (sources.length === 0) {
      // Si on avait des items catalogue mais aucun adapter n'a repondu = pas dispo
      if (entries.length > 0) {
        return NextResponse.json({ shipping: 0, source: 'unavailable' });
      }
      return NextResponse.json({ shipping: flat, source: 'flat' });
    }

    return NextResponse.json({
      shipping: Math.round(totalShipping * 100) / 100,
      source: sources.join('+'),
      aging: minDays < 999 ? `${minDays}-${maxDays} days` : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
