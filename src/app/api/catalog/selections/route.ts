import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const maxDuration = 10;

/**
 * GET /api/catalog/selections?slug=my-shop
 * Retourne les produits sélectionnés pour un site avec les détails catalog_products.
 *
 * DELETE /api/catalog/selections?slug=my-shop&id=<selection_id>
 * Supprime une sélection.
 *
 * PATCH /api/catalog/selections
 * Body: { slug, id, sell_price?, merchant_approved?, custom_name?, custom_description? }
 * Met à jour une sélection.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug requis' }, { status: 400 });

  const { data: site } = await supabaseAdmin
    .from('sites')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!site) return NextResponse.json({ error: 'Site introuvable' }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from('site_catalog_selections')
    .select(`
      id,
      sell_price,
      custom_name,
      custom_description,
      ai_suggested,
      merchant_approved,
      ai_reason,
      sort_order,
      catalog_product_id,
      catalog_products (
        id,
        supplier_id,
        supplier_product_id,
        name,
        description,
        category,
        price,
        currency,
        images,
        shipping_days_min,
        shipping_days_max,
        warehouse_country,
        in_stock
      )
    `)
    .eq('site_id', site.id)
    .order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ selections: data || [] });
}

export async function PATCH(req: NextRequest) {
  try {
    const { slug, id, ...updates } = await req.json();
    if (!slug || !id) return NextResponse.json({ error: 'slug et id requis' }, { status: 400 });

    const allowed = ['sell_price', 'merchant_approved', 'custom_name', 'custom_description', 'sort_order'];
    const clean: Record<string, any> = {};
    for (const k of allowed) {
      if (k in updates) clean[k] = updates[k];
    }

    if (Object.keys(clean).length === 0) {
      return NextResponse.json({ error: 'Rien à mettre à jour' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('site_catalog_selections')
      .update(clean)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ selection: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  const id = req.nextUrl.searchParams.get('id');
  if (!slug || !id) return NextResponse.json({ error: 'slug et id requis' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('site_catalog_selections')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
