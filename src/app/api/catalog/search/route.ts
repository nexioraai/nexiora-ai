import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const maxDuration = 10;

/**
 * GET /api/catalog/search?q=écouteurs&slug=my-shop&supplier=cj&max_days=5&sort=price&page=1
 * Recherche visiteur dans le cache catalog_products.
 * 100% locale (Supabase), zéro appel API fournisseur.
 * Filtre automatiquement par la niche du site marchand.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const q = url.searchParams.get('q')?.trim();
  const slug = url.searchParams.get('slug');
  const supplier = url.searchParams.get('supplier');
  const maxDays = url.searchParams.get('max_days');
  const sort = url.searchParams.get('sort') || 'relevance';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const country = url.searchParams.get('country')?.toUpperCase();
  const pageSize = 24;

  if (!slug) {
    return NextResponse.json({ error: 'slug requis' }, { status: 400 });
  }

  // 1. Récupère la niche du site pour filtrer
  const { data: site } = await supabaseAdmin
    .from('sites')
    .select('type, mode, cj_margin_percent')
    .eq('slug', slug)
    .eq('published', true)
    .single();

  if (!site) {
    return NextResponse.json({ error: 'Site introuvable' }, { status: 404 });
  }

  // 2. Construit la requête sur catalog_products
  let query = supabaseAdmin
    .from('catalog_products')
    .select('*', { count: 'exact' })
    .eq('in_stock', true);

  // Recherche full-text : mot-clé visiteur ou niche du site par défaut
  const searchTerm = q || extractNicheKeyword(site.type);
  if (searchTerm) {
    query = query.textSearch('name', searchTerm, { type: 'websearch', config: 'english' });
  }

  // Filtre par fournisseur
  if (supplier) {
    query = query.eq('supplier_id', supplier);
  }

  // Filtre par délai max
  if (maxDays) {
    query = query.lte('shipping_days_min', parseInt(maxDays, 10));
  }

  // Tri
  switch (sort) {
    case 'price_asc':
      query = query.order('price', { ascending: true });
      break;
    case 'price_desc':
      query = query.order('price', { ascending: false });
      break;
    case 'shipping':
      query = query.order('shipping_days_min', { ascending: true });
      break;
    default:
      query = query.order('last_synced_at', { ascending: false });
  }

  // Pagination
  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data: products, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Map country to preferred warehouse order
  const warehousePriority: Record<string, string[]> = {
    US: ['US', 'CA', 'MX', 'DE', 'CN', 'TH'],
    CA: ['US', 'CA', 'MX', 'DE', 'CN', 'TH'],
    MX: ['US', 'CA', 'MX', 'DE', 'CN', 'TH'],
    GB: ['DE', 'US', 'CN', 'TH'],
    DE: ['DE', 'US', 'CN', 'TH'],
    FR: ['DE', 'US', 'CN', 'TH'],
    JP: ['JP', 'TH', 'CN', 'US', 'DE'],
    AU: ['AU', 'TH', 'CN', 'US', 'DE'],
    BR: ['BR', 'US', 'CN', 'DE'],
  };
  const defaultPriority = ['US', 'DE', 'CN', 'TH'];
  const priority = country ? (warehousePriority[country] || defaultPriority) : null;

  let sorted = (products || []).map((p: any) => ({
    ...p,
    price: Math.round(p.price * (1 + (site.cj_margin_percent || 100) / 100) * 100) / 100,
  }));

  if (priority) {
    sorted.sort((a: any, b: any) => {
      const aIdx = priority.indexOf(a.warehouse_country) ?? 99;
      const bIdx = priority.indexOf(b.warehouse_country) ?? 99;
      return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    });
  }

  return NextResponse.json({
    products: sorted,
    total: count || 0,
    page,
    page_size: pageSize,
    has_more: (count || 0) > from + pageSize,
  });
}


/** Extrait un mot-clé de recherche depuis le type du site. */
function extractNicheKeyword(type: string | null): string | null {
  if (!type) return null;
  const cleaned = type
    .replace(/\b(dropshipping|retailer|store|shop|boutique|online|e-commerce|ecommerce|print-on-demand|print on demand|pod|marketplace|fashion brand)\b/gi, '')
    .replace(/[&.]/g, ' ')
    .trim();
  return cleaned || null;
}
