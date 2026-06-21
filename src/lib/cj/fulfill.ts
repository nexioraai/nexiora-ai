import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjCalculateFreight, cjCreateOrder } from './client';

/**
 * Exécute le dropshipping CJ pour une commande payée.
 * Pour chaque ligne dont le produit a un cj_vid, calcule le meilleur
 * transporteur (selon le pays du client) puis crée la commande chez CJ.
 * Les lignes sans cj_vid sont ignorées (gérées en stock par le webhook).
 * Renvoie la liste des vid traités en dropshipping.
 */
export async function fulfillCjOrder(orderId: string): Promise<string[]> {
  // Récupère la commande + son site
  const { data: order } = await supabaseAdmin
    .from('shop_orders')
    .select('id, site_id, shipping_address, customer_name, customer_email')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return [];

  const { data: site } = await supabaseAdmin
    .from('sites')
    .select('cj_email, cj_api_key')
    .eq('id', order.site_id)
    .maybeSingle();
  if (!site?.cj_email || !site?.cj_api_key) return [];

  // Lignes de la commande jointes au produit (pour le cj_vid)
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

  const addr: any = order.shipping_address || {};
  const endCountryCode = addr.country || 'US';

  // Meilleur transporteur (CJ trie par pertinence → on prend le 1er)
  let logisticName: string | undefined;
  try {
    const freight = await cjCalculateFreight(site.cj_email, site.cj_api_key, endCountryCode, cjProducts);
    if (Array.isArray(freight) && freight.length > 0) {
      logisticName = freight[0].logisticName;
    }
  } catch (e) {
    console.error('CJ freight calc failed:', e);
  }

  // Crée la commande CJ
  const cjOrder = {
    orderNumber: order.id,
    shippingZip: addr.postal_code || '',
    shippingCountryCode: endCountryCode,
    shippingCountry: endCountryCode,
    shippingProvince: addr.state || '',
    shippingCity: addr.city || '',
    shippingPhone: '0000000000',
    shippingCustomerName: order.customer_name || 'Client',
    shippingAddress: [addr.line1, addr.line2].filter(Boolean).join(', ') || '',
    email: order.customer_email || '',
    ...(logisticName ? { logisticName } : {}),
    fromCountryCode: 'CN',
    products: cjProducts,
  };

  const result = await cjCreateOrder(site.cj_email, site.cj_api_key, cjOrder);

  // Stocke la référence CJ sur la commande si présente
  const cjOrderId = result?.orderId || result?.orderCode || null;
  if (cjOrderId) {
    await supabaseAdmin
      .from('shop_orders')
      .update({ status: 'processing' })
      .eq('id', order.id);
  }

  return cjProducts.map((p) => p.vid);
}
