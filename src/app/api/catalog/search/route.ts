import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const maxDuration = 10;

/**
 * GET /api/catalog/search?q=bracelet&slug=my-shop&sort=price_asc&page=1&country=CA
 * Recherche visiteur : d'abord les produits cures du marchand, puis le catalogue global.
 * 100% Supabase, zero appel API fournisseur.
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

  const { data: site } = await supabaseAdmin
    .from('sites')
    .select('id, type, mode, cj_margin_percent, cj_round_mode')
    .eq('slug', slug)
    .single();

  if (!site) {
    return NextResponse.json({ error: 'Site introuvable' }, { status: 404 });
  }

  const margin = site.cj_margin_percent ?? 100;
  const roundMode = site.cj_round_mode || 'off';

  const apply99 = (price: number, mode: string): number => {
    const floorInt = Math.floor(price);
    const lower = floorInt - 1 + 0.99;
    const upper = floorInt + 0.99;
    if (mode === 'up') return upper;
    if (mode === 'down') return lower < 0 ? upper : lower;
    return price;
  };

  const calcPrice = (cost: number) => apply99(Math.round(cost * (1 + margin / 100) * 100) / 100, roundMode);

  // Split query into words for ilike matching
  const words = q ? q.toLowerCase().split(/\s+/).filter(w => w.length >= 2) : [];

  // ====== 1. Search curated products first ======
  let curatedResults: any[] = [];
  if (words.length > 0) {
    let cQuery = supabaseAdmin
      .from('site_catalog_selections')
      .select('id, sell_price, custom_name, custom_description, catalog_product_id, catalog_products(id, name, description, price, currency, images, supplier_id, supplier_product_id, shipping_days_min, shipping_days_max, warehouse_country, in_stock)')
      .eq('site_id', site.id)
      .eq('merchant_approved', true);

    const { data: curatedSels } = await cQuery;

    if (curatedSels && curatedSels.length > 0) {
      curatedResults = curatedSels
        .filter((s: any) => {
          const cp = s.catalog_products;
          if (!cp || !cp.in_stock) return false;
          const name = (s.custom_name || cp.name || '').toLowerCase();
          const desc = (s.custom_description || cp.description || '').toLowerCase();
          return words.every(w => name.includes(w) || desc.includes(w));
        })
        .map((s: any) => {
          const cp = s.catalog_products;
          const cost = cp.price ? Number(cp.price) : 0;
          return {
            id: cp.id,
            supplier_id: cp.supplier_id,
            supplier_product_id: cp.supplier_product_id,
            name: s.custom_name || cp.name,
            description: s.custom_description || cp.description || '',
            price: cost > 0 ? calcPrice(cost) : (s.sell_price ? Number(s.sell_price) : 0),
            currency: cp.currency || 'CAD',
            images: cp.images || [],
            shipping_days_min: cp.shipping_days_min,
            shipping_days_max: cp.shipping_days_max,
            warehouse_country: cp.warehouse_country,
            _curated: true,
          };
        });
    }
  }

  // ====== 2. Search global catalog ======
  let query2 = supabaseAdmin
    .from('catalog_products')
    .select('*', { count: 'exact' })
    .eq('in_stock', true);

  // ilike for each word in name
  if (words.length > 0) {
    for (const w of words) {
      query2 = query2.ilike('name', `%${w}%`);
    }
  } else {
    const niche = extractNicheKeyword(site.type);
    if (niche) {
      const nicheWords = niche.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
      for (const w of nicheWords) {
        query2 = query2.ilike('name', `%${w}%`);
      }
    }
  }

  if (supplier) {
    query2 = query2.eq('supplier_id', supplier);
  }
  if (maxDays) {
    query2 = query2.lte('shipping_days_min', parseInt(maxDays, 10));
  }

  switch (sort) {
    case 'price_asc': query2 = query2.order('price', { ascending: true }); break;
    case 'price_desc': query2 = query2.order('price', { ascending: false }); break;
    case 'shipping': query2 = query2.order('shipping_days_min', { ascending: true }); break;
    default: query2 = query2.order('last_synced_at', { ascending: false });
  }

  const from = (page - 1) * pageSize;
  query2 = query2.range(from, from + pageSize - 1);

  const { data: globalProducts, count, error } = await query2;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Apply pricing to global results
  const curatedIds = new Set(curatedResults.map((p: any) => p.id));
  const globalMapped = (globalProducts || [])
    .filter((p: any) => !curatedIds.has(p.id)) // exclude duplicates
    .map((p: any) => {
      const cost = p.price ? Number(p.price) : 0;
      return { ...p, price: calcPrice(cost), _curated: false };
    });

  // ====== 3. Merge: curated first, then global ======
  let merged = [...curatedResults, ...globalMapped];

  // Warehouse priority sorting
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

  if (priority) {
    // Keep curated first, then sort global by warehouse
    const curated = merged.filter((p: any) => p._curated);
    const global = merged.filter((p: any) => !p._curated);
    global.sort((a: any, b: any) => {
      const aIdx = priority.indexOf(a.warehouse_country);
      const bIdx = priority.indexOf(b.warehouse_country);
      return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    });
    merged = [...curated, ...global];
  }

  // Remove internal flag
  const final = merged.map(({ _curated, ...rest }) => rest);

  return NextResponse.json({
    products: final,
    total: (count || 0) + curatedResults.length,
    page,
    page_size: pageSize,
    has_more: (count || 0) > from + pageSize,
  });
}

function extractNicheKeyword(type: string | null): string | null {
  if (!type) return null;
  const cleaned = type
    .replace(/\b(dropshipping|retailer|store|shop|boutique|online|e-commerce|ecommerce|print-on-demand|print on demand|pod|marketplace|fashion brand)\b/gi, '')
    .replace(/[&.]/g, ' ')
    .trim();
  return cleaned || null;
}
