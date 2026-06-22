import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjCalculateFreight, cjCreateOrder, cjGetBalance } from './client';

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
  const { data: products } = await supabaseAdmin
    .from('shop_products')
    .select('id, cj_vid')
    .in('id', productIds);

  const vidById = new Map<string, string>();
  (products || []).forEach((p: any) => { if (p.cj_vid) vidById.set(p.id, p.cj_vid); });

  const cjProducts = items
    .filter((it: any) => it.product_id && vidById.has(it.product_id))
    .map((it: any) => ({ vid: vidById.get(it.product_id)!, quantity: it.quantity }));

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
