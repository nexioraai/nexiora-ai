import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjSearchProductsV2, cjGetProductByIdOrSku } from '@/lib/cj/client';

/** Détecte le type d'input : url, sku, pid, ou keyword. */
function detectInputType(input: string): { type: 'url' | 'sku' | 'pid' | 'keyword'; value: string } {
  const trimmed = input.trim();
  // URL CJ → extraire le PID
  const urlMatch = trimmed.match(/cjdropshipping\.com\/product\/[^\/]*?-p-([A-F0-9-]{36})/i)
    || trimmed.match(/cjdropshipping\.com\/product\/.*?(\b[A-F0-9-]{36}\b)/i);
  if (urlMatch) return { type: 'pid', value: urlMatch[1] };
  // SKU CJ (commence par CJ, 10+ chars)
  if (/^CJ[A-Z]{2,}[A-Z0-9]{4,}/i.test(trimmed)) return { type: 'sku', value: trimmed.toUpperCase() };
  // UUID / PID direct
  if (/^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/i.test(trimmed)) return { type: 'pid', value: trimmed };
  return { type: 'keyword', value: trimmed };
}

/** POST /api/shop/cj/search — recherche intelligente CJ (V2 + lookup direct). */
export async function POST(req: Request) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);
    if (userError || !user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { slug, keyword, page, categoryId, minPrice, maxPrice, sortBy, sortOrder } = body;
    if (!slug || !keyword) return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });

    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('cj_email, cj_api_key')
      .eq('slug', slug)
      .eq('owner_email', user.email)
      .single();
    if (!site?.cj_email || !site?.cj_api_key) {
      return NextResponse.json({ error: 'Compte CJ non connecté' }, { status: 400 });
    }

    const detected = detectInputType(keyword);

    // Lookup direct par PID ou SKU
    if (detected.type === 'pid' || detected.type === 'sku') {
      try {
        const product = await cjGetProductByIdOrSku(site.cj_email, site.cj_api_key, detected.value);
        if (product) {
          return NextResponse.json({
            products: [product],
            total: 1,
            page: 1,
            pageSize: 1,
            mode: 'direct',
          });
        }
      } catch {
        // Fallback vers recherche V2
      }
    }

    // Recherche V2 (keyword, avec filtres optionnels)
    const result = await cjSearchProductsV2(site.cj_email, site.cj_api_key, {
      keyWord: detected.value,
      page: page || 1,
      size: 50,
      categoryId: categoryId || undefined,
      startSellPrice: minPrice != null ? Number(minPrice) : undefined,
      endSellPrice: maxPrice != null ? Number(maxPrice) : undefined,
      orderBy: sortBy || undefined,
      sort: sortOrder || undefined,
    });

    return NextResponse.json({
      products: result?.content?.[0]?.productList ?? result?.content ?? result?.list ?? [],
      total: result?.totalRecords ?? result?.total ?? 0,
      page: result?.pageNumber ?? result?.pageNum ?? 1,
      pageSize: result?.pageSize ?? 50,
      mode: 'search',
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
