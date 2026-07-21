import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjGetVariants } from '@/lib/cj/client';

export async function GET(req: NextRequest) {
  const orderId = 'd7a9306c-e85f-4b3d-8799-f8744ed52515';
  const email = process.env.CJ_EMAIL || '';
  const apiKey = process.env.CJ_API_KEY || '';

  const { data: items } = await supabaseAdmin
    .from('shop_order_items').select('quantity, product_id').eq('order_id', orderId);

  const productIds = (items || []).map((it: any) => it.product_id).filter(Boolean);
  const catalogIds = productIds.filter((id: string) => id.startsWith('catalog-'));
  const stripVariant = (v: string) => String(v).replace(/^catalog-/, '').split('::')[0];
  const realIds = catalogIds.map((id: string) => stripVariant(id));

  const { data: catProds } = await supabaseAdmin
    .from('catalog_products').select('id, supplier_product_id').in('id', realIds);

  const vidById: Record<string, string> = {};
  for (const cp of (catProds || [])) {
    if (!cp.supplier_product_id) continue;
    try {
      const variants = await cjGetVariants(email, apiKey, cp.supplier_product_id);
      const firstVid = Array.isArray(variants) && variants.length > 0 ? (variants[0].vid || variants[0].variantId) : null;
      if (firstVid) vidById['catalog-' + cp.id] = firstVid;
    } catch (e) {}
  }

  return NextResponse.json({
    itemsProductIds: productIds,
    catalogIds,
    realIds,
    catProdsFound: (catProds || []).map((c: any) => ({ id: c.id, spi: c.supplier_product_id })),
    vidByIdKeys: Object.keys(vidById),
  });
}
