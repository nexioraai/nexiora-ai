import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { STRIPE_SHIPPING_COUNTRIES } from '@/lib/payments/countries';
import { cjAdapter } from '@/lib/suppliers/cj-adapter';
import { printfulAdapter } from '@/lib/suppliers/printful-adapter';
import { zendropAdapter } from '@/lib/suppliers/zendrop-adapter';
import { printifyAdapter } from '@/lib/suppliers/printify-adapter';
import type { ShippingRequest } from '@/lib/suppliers/supplier-adapter';
import type { ShippingTier } from '@/lib/cj/shipping-tiers';

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
      .select('id, shipping_flat')
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

    // Catalog products => resoudre le fournisseur depuis la base.
    // Cart IDs : "catalog-{uuid}" ou "catalog-{uuid}::{variantId}".
    const supplierGroups: Record<string, { supplier_product_id: string; quantity: number }[]> = {};
    if (catalogIds.length > 0) {
      const realIds = catalogIds
        .map((i) => i.id.replace(/^catalog-/, '').split('::')[0])
        .filter(Boolean);
      const { data: catProds } = await supabaseAdmin
        .from('catalog_products')
        .select('id, supplier_id, supplier_product_id')
        .in('id', realIds);
      for (const cp of (catProds || [])) {
        if (!cp.supplier_id || !cp.supplier_product_id) continue;
        const item = catalogIds.find((i) => i.id.replace(/^catalog-/, '').split('::')[0] === cp.id);
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

    // Credentials plateforme Nexiora — tous les produits transitent par le compte plateforme
    const creds: Record<string, Record<string, string>> = {
      cj: { email: process.env.CJ_EMAIL || '', apiKey: process.env.CJ_API_KEY || '' },
      printful: { printful_token: process.env.PRINTFUL_API_TOKEN || '', state_code: stateCode || '' },
      printify: { printify_token: process.env.PRINTIFY_API_TOKEN || '', printify_shop_id: process.env.PRINTIFY_SHOP_ID || '' },
      zendrop: {},
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

    // --- Tiers de livraison CJ (eco/standard/express) ---
    // Si le panier contient des produits CJ, on lit shipping_cache.tiers et on
    // agrege les 3 tiers (marge +20% comme le checkout). Reponse enrichie sans
    // toucher au montant 'shipping' historique (retro-compat).
    const SHIPPING_MARGIN = 1.20;
    let cjTiers: { tier: string; label: string; cost: number; days_min: number | null; days_max: number | null }[] | null = null;
    const cjGroup = supplierGroups['cj'];
    if (cjGroup && cjGroup.length > 0) {
      const productIds = cjGroup.map((g) => g.supplier_product_id);
      const { data: cacheRows } = await supabaseAdmin
        .from('shipping_cache')
        .select('supplier_product_id, tiers')
        .eq('supplier_id', 'cj')
        .eq('country_code', countryCode)
        .in('supplier_product_id', productIds);
      // On agrege : chaque produit doit avoir les 3 tiers, on somme par tier.
      if (cacheRows && cacheRows.length === productIds.length && cacheRows.every((r: any) => Array.isArray(r.tiers) && r.tiers.length > 0)) {
        const agg: Record<string, { cost: number; days_min: number; days_max: number }> = {};
        let ok = true;
        for (const g of cjGroup) {
          const row = cacheRows.find((r: any) => r.supplier_product_id === g.supplier_product_id);
          const tiers: ShippingTier[] = row?.tiers || [];
          for (const key of ['eco', 'standard', 'express']) {
            const t = tiers.find((x) => x.tier === key);
            if (!t) { ok = false; break; }
            if (!agg[key]) agg[key] = { cost: 0, days_min: 0, days_max: 0 };
            agg[key].cost += Number(t.cost) * g.quantity;
            agg[key].days_min = Math.max(agg[key].days_min, t.days_min || 0);
            agg[key].days_max = Math.max(agg[key].days_max, t.days_max || 0);
          }
          if (!ok) break;
        }
        if (ok) {
          const labels: Record<string, string> = { eco: 'Économique', standard: 'Standard', express: 'Express' };
          cjTiers = ['eco', 'standard', 'express'].map((key) => ({
            tier: key,
            label: labels[key],
            cost: Math.round(agg[key].cost * SHIPPING_MARGIN * 100) / 100,
            days_min: agg[key].days_min || null,
            days_max: agg[key].days_max || null,
          }));
        }
      }
    }

    return NextResponse.json({
      shipping: Math.round(totalShipping * 100) / 100,
      source: sources.join('+'),
      aging: minDays < 999 ? `${minDays}-${maxDays} days` : null,
      cjTiers,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
