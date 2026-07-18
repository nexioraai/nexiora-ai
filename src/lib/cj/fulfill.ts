import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjCalculateFreight, cjCreateOrder, cjGetBalance, cjGetOrderDetail, cjGetVariants } from './client';

const MAX_PAY_ATTEMPTS = 3;

/** Détermine si une erreur CJ est permanente (inutile de réessayer). */
function isPermanentError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('param') ||
    m.includes('invalid') ||
    m.includes('insufficient') ||
    m.includes('not found') ||
    m.includes('not a cj')
  );
}

/**
 * Exécute le dropshipping CJ pour une commande payée (côté client).
 * Lignes avec cj_vid → commande CJ. Lignes sans cj_vid → ignorées (stock).
 * Mode déterminé par sites.cj_auto_pay :
 *   - false (défaut) : crée la commande chez CJ, paiement manuel par le marchand.
 *   - true : paie automatiquement via solde CJ (payType 2), avec garde-fous.
 */
export async function fulfillCjOrder(orderId: string): Promise<string[]> {
  const { data: order } = await supabaseAdmin
    .from('shop_orders')
    .select('id, site_id, shipping_address, customer_name, customer_email, cj_pay_status, cj_pay_attempts')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return [];

  const { data: site } = await supabaseAdmin
    .from('sites')
    .select('cj_email, cj_api_key, cj_auto_pay')
    .eq('id', order.site_id)
    .maybeSingle();
  if (!site?.cj_email || !site?.cj_api_key) return [];

  const { data: items } = await supabaseAdmin
    .from('shop_order_items')
    .select('quantity, product_id')
    .eq('order_id', order.id);
  if (!items || items.length === 0) return [];

  const productIds = items.map((it: any) => it.product_id).filter(Boolean);

  // Sépare produits shop vs catalogue
  const shopIds = productIds.filter((id: string) => !id.startsWith('catalog-'));
  const catalogIds = productIds.filter((id: string) => id.startsWith('catalog-'));

  const vidById = new Map<string, string>();

  // Produits shop classiques (shop_products.cj_vid)
  if (shopIds.length > 0) {
    const { data: products } = await supabaseAdmin
      .from('shop_products')
      .select('id, cj_vid')
      .in('id', shopIds);
    (products || []).forEach((p: any) => { if (p.cj_vid) vidById.set(p.id, p.cj_vid); });
  }

  // Produits catalogue (catalog_products.supplier_product_id = pid CJ)
  if (catalogIds.length > 0) {
    const stripVariant = (v: string) => String(v).replace(/^catalog-/, '').split('::')[0];
    const chosenVid = new Map<string, string>();
    for (const cid of catalogIds) {
      const parts = String(cid).replace(/^catalog-/, '').split('::');
      if (parts[1]) chosenVid.set(parts[0], parts[1]);
    }
    const realIds = catalogIds.map((id: string) => stripVariant(id));
    const { data: catProds } = await supabaseAdmin
      .from('catalog_products')
      .select('id, supplier_product_id')
      .in('id', realIds);
    for (const cp of (catProds || [])) {
      if (!cp.supplier_product_id) continue;
      try {
        // Respecter la variante choisie par l'acheteur. Sans choix explicite,
        // on retombe sur la premiere variante du produit.
        const picked = chosenVid.get(cp.id);
        if (picked) {
          vidById.set('catalog-' + cp.id, picked);
          continue;
        }
        const variants = await cjGetVariants(site.cj_email, site.cj_api_key, cp.supplier_product_id);
        const firstVid = Array.isArray(variants) && variants.length > 0
          ? (variants[0].vid || variants[0].variantId)
          : null;
        if (firstVid) vidById.set('catalog-' + cp.id, firstVid);
      } catch (e) {
        console.error('CJ getVariants failed for catalog product:', cp.supplier_product_id, e);
      }
    }
  }

  // Les ids panier catalog peuvent porter une variante ("catalog-{uuid}::{vid}"),
  // alors que vidById est indexe sans variante. On normalise avant le lookup.
  const lookupKey = (pid: string) =>
    String(pid).startsWith('catalog-') ? 'catalog-' + String(pid).replace(/^catalog-/, '').split('::')[0] : pid;
  const cjProducts = items
    .filter((it: any) => it.product_id && vidById.has(lookupKey(it.product_id)))
    .map((it: any) => ({ vid: vidById.get(lookupKey(it.product_id))!, quantity: it.quantity }));

  if (cjProducts.length === 0) return [];

  // --- Validation d'adresse stricte (les deux modes) ---
  const addr: any = order.shipping_address || {};
  const endCountryCode = addr.country || '';
  const missing: string[] = [];
  if (!endCountryCode) missing.push('country');
  if (!addr.city) missing.push('city');
  if (!addr.postal_code) missing.push('postal_code');
  if (!addr.line1) missing.push('line1');
  if (missing.length > 0) {
    console.error(`CJ fulfill: adresse incomplete (${missing.join(', ')}) pour ${order.id}`);
    await supabaseAdmin
      .from('shop_orders')
      .update({ cj_pay_status: 'failed' })
      .eq('id', order.id);
    return [];
  }

  // --- Meilleur transporteur ---
  let logisticName: string | undefined;
  try {
    const freight = await cjCalculateFreight(site.cj_email, site.cj_api_key, endCountryCode, cjProducts);
    if (Array.isArray(freight) && freight.length > 0) {
      logisticName = freight[0].logisticName;
    }
  } catch (e) {
    console.error('CJ freight calc failed:', e);
  }

  const baseOrder = {
    orderNumber: order.id,
    shippingZip: addr.postal_code,
    shippingCountryCode: endCountryCode,
    shippingCountry: endCountryCode,
    shippingProvince: addr.state || '',
    shippingCity: addr.city,
    shippingPhone: addr.phone || '0000000000',
    shippingCustomerName: order.customer_name || 'Client',
    shippingAddress: [addr.line1, addr.line2].filter(Boolean).join(', '),
    email: order.customer_email || '',
    ...(logisticName ? { logisticName } : {}),
    fromCountryCode: 'CN',
    products: cjProducts,
  };

  // ================= MODE MANUEL (cj_auto_pay = false) =================
  if (!site.cj_auto_pay) {
    const result = await cjCreateOrder(site.cj_email, site.cj_api_key, baseOrder);
    const cjOrderId = result?.orderId || result?.orderCode || null;
    if (cjOrderId) {
      await supabaseAdmin
        .from('shop_orders')
        .update({ cj_order_id: cjOrderId, status: 'processing' })
        .eq('id', order.id);
    }
    return cjProducts.map((p) => p.vid);
  }

  // ================= MODE AUTO (cj_auto_pay = true) =================
  // Verrou idempotent atomique : seul un passage peut prendre la commande.
  const { data: locked } = await supabaseAdmin
    .from('shop_orders')
    .update({ cj_pay_status: 'processing', cj_pay_attempts: (order.cj_pay_attempts || 0) + 1 })
    .eq('id', order.id)
    .in('cj_pay_status', ['pending', 'failed'])
    .lt('cj_pay_attempts', MAX_PAY_ATTEMPTS)
    .select('id');

  if (!locked || locked.length === 0) {
    // Déjà payé, déjà en cours, ou tentatives épuisées → on ne fait rien.
    return [];
  }

  // Garde-fou anti double-commande : une tentative precedente a pu creer
  // la commande chez CJ avant une coupure reseau. On verifie avant de recreer.
  const existing = await cjGetOrderDetail(site.cj_email, site.cj_api_key, order.id);
  if (existing && (existing.orderId || existing.cjOrderId)) {
    const existingId = existing.orderId || existing.cjOrderId;
    const alreadyPaid = ['UNSHIPPED', 'SHIPPED', 'DELIVERED'].includes(existing.orderStatus);
    await supabaseAdmin
      .from('shop_orders')
      .update({
        cj_order_id: existingId,
        cj_pay_status: alreadyPaid ? 'paid' : 'processing',
        status: 'processing',
      })
      .eq('id', order.id);
    return cjProducts.map((p) => p.vid);
  }

  // Garde-fou solde
  try {
    const balance = await cjGetBalance(site.cj_email, site.cj_api_key);
    if (balance <= 0) {
      console.error(`CJ fulfill: solde insuffisant (${balance}) pour ${order.id}`);
      await supabaseAdmin
        .from('shop_orders')
        .update({ cj_pay_status: 'failed' })
        .eq('id', order.id);
      return [];
    }
  } catch (e) {
    console.error('CJ getBalance failed:', e);
    // Transitoire : on rouvre pour retry.
    await supabaseAdmin
      .from('shop_orders')
      .update({ cj_pay_status: 'pending' })
      .eq('id', order.id);
    return [];
  }

  // Création + paiement par solde (payType 2)
  try {
    const result = await cjCreateOrder(site.cj_email, site.cj_api_key, { ...baseOrder, payType: 2 });
    const cjOrderId = result?.orderId || result?.orderCode || null;
    await supabaseAdmin
      .from('shop_orders')
      .update({ cj_order_id: cjOrderId, cj_pay_status: 'paid', status: 'processing' })
      .eq('id', order.id);
    return cjProducts.map((p) => p.vid);
  } catch (e: any) {
    const msg = String(e?.message || e);
    const permanent = isPermanentError(msg);
    console.error(`CJ pay failed (${permanent ? 'permanent' : 'transitoire'}) pour ${order.id}:`, msg);
    await supabaseAdmin
      .from('shop_orders')
      .update({ cj_pay_status: permanent ? 'failed' : 'pending' })
      .eq('id', order.id);
    return [];
  }
}
