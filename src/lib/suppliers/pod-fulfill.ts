import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { printfulAdapter } from './printful-adapter';
import { printifyAdapter } from './printify-adapter';
import { gelatoAdapter } from './gelato-adapter';

/**
 * Fulfil POD items (Printful/Printify) for a paid order.
 * Reads order_item_designs to get the visitor's uploaded design.
 * Returns array of supplier order IDs created.
 */
export async function fulfillPodOrder(orderId: string): Promise<string[]> {
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

  // Only catalog items from printful/printify
  const catalogItems = items.filter((i: any) => i.product_id?.startsWith('catalog-'));
  if (catalogItems.length === 0) return [];

  // Get catalog product details
  const stripVariant = (v: string) => String(v).replace(/^catalog-/, '').split('::')[0];
  const realIds = catalogItems.map((i: any) => stripVariant(i.product_id));
  const { data: catProds } = await supabaseAdmin
    .from('catalog_products')
    .select('id, supplier_id, supplier_product_id')
    .in('id', realIds)
    .in('supplier_id', ['printful', 'printify', 'gelato']);
  if (!catProds || catProds.length === 0) return [];

  // Get designs for these order items
  const orderItemIds = catalogItems.map((i: any) => i.id);
  const { data: designs } = await supabaseAdmin
    .from('order_item_designs')
    .select('order_item_id, design_url, placement, position')
    .in('order_item_id', orderItemIds);
  // An item can carry several designs (front, back, sleeves...)
  const designsByItemId = new Map<string, { url: string; placement: string; position?: any }[]>();
  (designs || []).forEach((d: any) => {
    const list = designsByItemId.get(d.order_item_id) || [];
    list.push({ url: d.design_url, placement: d.placement || 'front', position: d.position });
    designsByItemId.set(d.order_item_id, list);
  });

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
    // Variante choisie par l'acheteur ("catalog-{uuid}::{variantId}").
    // Sans choix explicite, on retombe sur l'id produit (produit sans variantes).
    const pickedVariant = String(cartItem.product_id).replace(/^catalog-/, '').split('::')[1] || catProd.supplier_product_id;

    const designList = designsByItemId.get(cartItem.id) || [];
    const designRow = designList[0];
    const designUrl = designRow?.url || undefined;
    const adapter = catProd.supplier_id === 'printful' ? printfulAdapter
      : catProd.supplier_id === 'gelato' ? gelatoAdapter
      : printifyAdapter;
    const creds: Record<string, string> = catProd.supplier_id === 'printful'
      ? { printful_token: process.env.PRINTFUL_API_TOKEN || '' }
      : catProd.supplier_id === 'gelato'
      ? { gelato_key: process.env.GELATO_API_KEY || '' }
      : { printify_token: process.env.PRINTIFY_API_TOKEN || '', printify_shop_id: process.env.PRINTIFY_SHOP_ID || '' };

    try {
      const result = await adapter.createOrder({
        supplier_product_id: catProd.supplier_product_id,
        variant_id: pickedVariant,
        quantity: cartItem.quantity,
        shipping_address: shippingAddress,
        merchant_order_id: order.id,
        design_url: designUrl,
        design_position: designRow?.position || undefined,
        design_placement: designRow?.placement || undefined,
        design_files: designList.length > 0 ? designList : undefined,
      }, creds);

      if (result.success && result.supplier_order_id) {
        supplierOrderIds.push(result.supplier_order_id);
      } else {
        console.error(`POD fulfill failed for ${catProd.supplier_id}/${catProd.supplier_product_id}:`, result.error_message);
      }
    } catch (e: any) {
      console.error(`POD fulfill error for ${catProd.supplier_id}/${catProd.supplier_product_id}:`, e.message);
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
