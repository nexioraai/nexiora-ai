import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getProvider } from '@/lib/payments';
import { checkStock } from '@/lib/shop';
import { checkCatalogStock } from '@/lib/catalog-stock';
import type { CartItem } from '@/lib/payments/types';
import { STRIPE_SHIPPING_COUNTRIES } from '@/lib/payments/countries';
import { cjAdapter } from '@/lib/suppliers/cj-adapter';
import { printfulAdapter } from '@/lib/suppliers/printful-adapter';
import { printifyAdapter } from '@/lib/suppliers/printify-adapter';
import type { ShippingRequest } from '@/lib/suppliers/supplier-adapter';

/** Décode un id panier catalog : "catalog-{uuid}::{variantId}" -> { realId: uuid, variantId }.
 *  variantId est optionnel (produits sans variantes). */
function parseCatalogId(cartId: string): { realId: string; variantId?: string } {
  const withoutPrefix = cartId.replace(/^catalog-/, '');
  const [realId, variantId] = withoutPrefix.split('::');
  return { realId, variantId: variantId || undefined };
}

/** POST /api/shop/checkout → crée la session de paiement. Body: { slug, items } (route publique : un client final achète). */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { slug, items, countryCode } = body as { slug?: string; items?: CartItem[]; countryCode?: string };
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    if (!items || items.length === 0) return NextResponse.json({ error: 'Panier vide' }, { status: 400 });

    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, payment_provider, payment_account_id, shipping_flat, mode')
      .eq('slug', slug)
      .single();
    if (siteError || !site) return NextResponse.json({ error: 'Site introuvable' }, { status: 404 });
    if (!site.payment_account_id) return NextResponse.json({ error: 'Paiements non configurés pour ce site' }, { status: 400 });

    const stock = await checkStock(items.map((i) => ({ id: i.id, quantity: i.quantity })));
    if (!stock.ok) return NextResponse.json({ error: stock.reason }, { status: 409 });

    // Verification stock catalog (live aupres du fournisseur) : le client n'achete jamais du vide.
    const catalogStockLines = items
      .filter((i) => i.id?.startsWith('catalog-'))
      .map((i) => {
        const { realId, variantId } = parseCatalogId(i.id);
        return { realId, variantId, quantity: i.quantity };
      });
    const catStock = await checkCatalogStock(catalogStockLines, countryCode || 'US');
    if (!catStock.ok) return NextResponse.json({ error: catStock.reason }, { status: 409 });

    const origin = new URL(req.url).origin;
    const successUrl = `${origin}/sites/${slug}?paid=1`;
    const cancelUrl = `${origin}/sites/${slug}?canceled=1`;

    // Calcul serveur du frais de port : universel multi-fournisseur.
    // On ne fait jamais confiance a un montant envoye par le client.
    const flat = Number(site.shipping_flat) || 0;
    let shippingAmount = flat;
    let estimatedDelivery: string | null = null;

    if (countryCode && STRIPE_SHIPPING_COUNTRIES.includes(countryCode as any)) {
      try {
        const adapters: Record<string, any> = {
          cj: cjAdapter,
          printful: printfulAdapter,
          printify: printifyAdapter,
        };
        const creds: Record<string, Record<string, string>> = {
          cj: { email: process.env.CJ_EMAIL || '', apiKey: process.env.CJ_API_KEY || '' },
          printful: { printful_token: process.env.PRINTFUL_API_TOKEN || '', state_code: '' },
          printify: { printify_token: process.env.PRINTIFY_API_TOKEN || '', printify_shop_id: process.env.PRINTIFY_SHOP_ID || '' },
        };

        // Separer shop vs catalog
        const shopItems = items.filter((i) => !i.id?.startsWith('catalog-'));
        const catalogItems = items.filter((i) => i.id?.startsWith('catalog-'));

        // Shop products => CJ direct
        const supplierGroups: Record<string, ShippingRequest[]> = {};
        if (shopItems.length > 0) {
          const { data: prods } = await supabaseAdmin
            .from('shop_products')
            .select('id, cj_vid')
            .in('id', shopItems.map((i) => i.id));
          for (const p of (prods || [])) {
            if (!p.cj_vid) continue;
            const item = shopItems.find((i) => i.id === p.id);
            if (!item) continue;
            if (!supplierGroups['cj']) supplierGroups['cj'] = [];
            supplierGroups['cj'].push({ supplier_product_id: p.cj_vid, quantity: item.quantity });
          }
        }

        // Catalog products => grouper par supplier_id
        if (catalogItems.length > 0) {
          const realIds = catalogItems.map((i) => parseCatalogId(i.id).realId);
          const { data: catProds } = await supabaseAdmin
            .from('catalog_products')
            .select('id, supplier_id, supplier_product_id')
            .in('id', realIds);
          for (const cp of (catProds || [])) {
            if (!cp.supplier_product_id || !cp.supplier_id) continue;
            const item = catalogItems.find((i) => parseCatalogId(i.id).realId === cp.id);
            if (!item) continue;
            if (!supplierGroups[cp.supplier_id]) supplierGroups[cp.supplier_id] = [];
            supplierGroups[cp.supplier_id].push({
              supplier_product_id: cp.supplier_product_id,
              quantity: item.quantity,
            });
          }
        }

        // Appeler calculateShipping pour chaque groupe
        let totalShipping = 0;
        let maxDays = 0;
        for (const [supplierId, groupItems] of Object.entries(supplierGroups)) {
          const adapter = adapters[supplierId];
          if (!adapter?.calculateShipping) continue;
          try {
            const result = await adapter.calculateShipping(groupItems, countryCode, creds[supplierId] || {});
            totalShipping += result.total_cost;
            if (result.estimated_days_max > maxDays) maxDays = result.estimated_days_max;
          } catch (err: any) {
            console.error('[checkout/shipping]', supplierId, 'failed:', err.message || err);
          }
        }

        if (totalShipping > 0) {
          shippingAmount = Math.round(totalShipping * 100) / 100;
          estimatedDelivery = maxDays > 0 ? String(maxDays) + ' days' : null;
        }
      } catch (e) {
        // Adapter indisponible -> on garde le forfait. Ne casse jamais le checkout.
      }
    }

    // Calculate supplier cost for application_fee
    const NEXIORA_COMMISSION_PERCENT = 5;
    let supplierCost = 0;
    // Catalog items: look up cost from catalog_products
    const catalogCartItems = items.filter((i) => i.id?.startsWith('catalog-'));
    if (catalogCartItems.length > 0) {
      for (const item of catalogCartItems) {
        const { realId } = parseCatalogId(item.id);
        if (realId) {
          const { data: cp } = await supabaseAdmin
            .from('catalog_products')
            .select('price')
            .eq('id', realId)
            .maybeSingle();
          if (cp?.price) supplierCost += Number(cp.price) * item.quantity;
        }
      }
    }
    // Shop items: look up cost from shop_products
    const shopCartItems = items.filter((i) => !i.id?.startsWith('catalog-'));
    if (shopCartItems.length > 0) {
      const { data: shopProds } = await supabaseAdmin
        .from('shop_products')
        .select('id, cost_price')
        .in('id', shopCartItems.map((i) => i.id));
      for (const sp of (shopProds || [])) {
        const item = shopCartItems.find((i) => i.id === sp.id);
        if (item && sp.cost_price) supplierCost += Number(sp.cost_price) * item.quantity;
      }
    }

    const totalAmount = items.reduce((sum, i) => sum + i.priceNumber * i.quantity, 0);
    const nexioraCommission = totalAmount * (NEXIORA_COMMISSION_PERCENT / 100);
    const applicationFeeAmount = site.mode === 3 ? (supplierCost + nexioraCommission) : 0;

    const provider = getProvider(site.payment_provider);
    const { url, orderId } = await provider.createCheckout(
      site.payment_account_id,
      slug,
      items,
      successUrl,
      cancelUrl,
      shippingAmount,
      applicationFeeAmount
    );

    const amount = totalAmount;
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
        supplier_cost: supplierCost,
        nexiora_commission: nexioraCommission,
        merchant_profit: amount - supplierCost - nexioraCommission,
      })
      .select('id')
      .single();

    if (order) {
      const { data: orderItems } = await supabaseAdmin.from('shop_order_items').insert(
        items.map((i) => ({
          order_id: order.id,
          product_id: i.id,
          product_name: i.name,
          quantity: i.quantity,
          unit_price: i.priceNumber,
        }))
      ).select('id');
      // Save custom designs if any
      if (orderItems) {
        const designRows = items
          .map((item, idx) => item.customDesignUrl && orderItems[idx]
            ? { order_item_id: orderItems[idx].id, design_url: item.customDesignUrl, placement: 'front' }
            : null)
          .filter((r): r is { order_item_id: string; design_url: string; placement: string } => r !== null);
        if (designRows.length > 0) {
          await supabaseAdmin.from('order_item_designs').insert(designRows);
        }
      }
    }

    return NextResponse.json({ url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
