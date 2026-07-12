import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const supplier = searchParams.get('supplier') || 'printful';

    const { data, error } = await supabaseAdmin
      .from('catalog_products')
      .select('supplier_product_id, supplier_parent_id, name, price, currency, images')
      .eq('supplier_id', supplier)
      .eq('in_stock', true)
      .not('supplier_parent_id', 'is', null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Group by parent product, collect variants
    const grouped: Record<string, any> = {};
    for (const row of (data || [])) {
      const pid = row.supplier_parent_id;
      const imgs = Array.isArray(row.images) ? row.images : [];
      const variantLabel = (row.name || '').replace(/^.+\u2014\s*/, '') || 'Default';
      const variant = {
        variant_id: row.supplier_product_id,
        label: variantLabel,
        price: row.price,
        currency: row.currency || 'USD',
        image: imgs[0] || null,
      };
      if (!grouped[pid]) {
        grouped[pid] = {
          product_id: pid,
          name: (row.name || '').replace(/\s*\u2014\s*.+$/, ''),
          price: row.price,
          currency: row.currency || 'USD',
          image: imgs[0] || null,
          variants: [variant],
        };
      } else {
        grouped[pid].variants.push(variant);
        if (row.price < grouped[pid].price) {
          grouped[pid].price = row.price;
          grouped[pid].currency = row.currency || 'USD';
          if (imgs[0]) grouped[pid].image = imgs[0];
        }
      }
    }

    const products = Object.values(grouped).sort((a: any, b: any) =>
      a.name.localeCompare(b.name)
    );

    return NextResponse.json({ products, total: products.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
