import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { zendropAdapter } from './zendrop-adapter';

/**
 * Fulfil Zendrop items for a paid order.
 * Returns array of supplier order IDs created.
 */
export async function fulfillZendropOrder(orderId: string): Promise<string[]> {
  const { data: order } = await supabaseAdmin
    .from('shop_orders')
    .select('id, site_id, shipping_address, customer_name, customer_email')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return [];

  const { data: items } = await supabaseAdmin
    .from('shop_order_items')
    .select('id, product_id, quantity')
    .eq('order_id', order.id);
  if (!items || items.length === 0) return [];

  // Only catalog items from zendrop
  const catalogItems = items.filter((i: any) => i.product_id?.startsWith('catalog-'));
  if (catalogItems.length === 0) return [];

  const stripVariant = (v: string) => String(v).replace(/^catalog-/, '').split('::')[0];
  const realIds = catalogItems.map((i: any) => stripVariant(i.product_id));
  const { data: catProds } = await supabaseAdmin
    .from('catalog_products')
    .select('id, supplier_id, supplier_product_id')
    .in('id', realIds)
    .eq('supplier_id', 'zendrop');
  if (!catProds || catProds.length === 0) return [];

  const addr: any = order.shipping_address || {};
  const shippingAddress = {
    full_name: order.customer_name || 'Client',
    address_line1: addr.line1 || addr.address1 || '',
    address_line2: addr.line2 || addr.address2 || '',
    city: addr.city || '',
    province_state: addr.state || '',
    postal_code: addr.postal_code || addr.zip || '',
    country: addr.country || '',
    phone: addr.phone || '',
  };

  const supplierOrderIds: string[] = [];

  for (const catProd of catProds) {
    const cartItem = catalogItems.find((i: any) => stripVariant(i.product_id) === catProd.id);
    if (!cartItem) continue;

    try {
      const result = await zendropAdapter.createOrder({
        supplier_product_id: catProd.supplier_product_id,
        variant_id: catProd.supplier_product_id,
        quantity: cartItem.quantity,
        shipping_address: shippingAddress,
        merchant_order_id: order.id,
      }, {});

      if (result.success && result.supplier_order_id) {
        supplierOrderIds.push(result.supplier_order_id);
      } else {
        console.error(`Zendrop fulfill failed for ${catProd.supplier_product_id}:`, result.error_message);
      }
    } catch (e: any) {
      console.error(`Zendrop fulfill error for ${catProd.supplier_product_id}:`, e.message);
    }
  }

  if (supplierOrderIds.length > 0) {
    await supabaseAdmin
      .from('shop_orders')
      .update({ status: 'processing' })
      .eq('id', order.id);
  }

  return supplierOrderIds;
}
