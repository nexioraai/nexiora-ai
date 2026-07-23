import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const maxDuration = 30;

// Printfiles never change for a given product — cache in module scope
const cache = new Map<string, any>();

async function pfFetch(path: string): Promise<any> {
  const token = process.env.PRINTFUL_API_TOKEN || '';
  const storeId = process.env.PRINTFUL_STORE_ID || '';
  const res = await fetch(`https://api.printful.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(storeId ? { 'X-PF-Store-Id': storeId } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Printful ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()).result;
}

const PREFERRED = ['front', 'default', 'front_large', 'embroidery_front', 'embroidery_front_large'];

// Classify any Printful placement into a visitor-facing side.
// Placement names vary a lot: front, front_large, front_dtfabric,
// embroidery_chest_left, embroidery_chest_center, sleeve_left, back...
function classify(p: string): { side: string; rank: number } | null {
  if (/label/i.test(p)) return null;                       // inside/outside labels: not for visitors
  if (/back/i.test(p)) return { side: 'back', rank: 2 };
  if (/sleeve_left|wrist_left/i.test(p)) return { side: 'sleeve_left', rank: 3 };
  if (/sleeve_right|wrist_right/i.test(p)) return { side: 'sleeve_right', rank: 4 };
  if (/front|chest|default/i.test(p)) return { side: 'front', rank: 1 };
  return { side: 'front', rank: 5 };                       // anything else printable
}

/** GET /api/pod/printfile-info?product_id=X&variant_id=Y
 *  Returns { placement, area_width, area_height } for the front-like print area. */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let productId = searchParams.get('product_id');
    const variantId = searchParams.get('variant_id');

    // Storefront only knows the variant id — resolve the parent product from catalog
    if (!productId && variantId) {
      const { data: cp } = await supabaseAdmin
        .from('catalog_products')
        .select('supplier_parent_id')
        .eq('supplier_id', 'printful')
        .eq('supplier_product_id', String(variantId))
        .single();
      productId = cp?.supplier_parent_id || null;
    }
    if (!productId) return NextResponse.json({ error: 'Missing product_id' }, { status: 400 });

    const cacheKey = `${productId}:${variantId || ''}`;
    if (cache.has(cacheKey)) return NextResponse.json(cache.get(cacheKey));

    const pf = await pfFetch(`/mockup-generator/printfiles/${productId}`);
    const available = Object.keys(pf.available_placements || {});
    const vp = (pf.variant_printfiles || []).find((v: any) => String(v.variant_id) === String(variantId))
      || (pf.variant_printfiles || [])[0];
    const filesById = new Map((pf.printfiles || []).map((f: any) => [f.printfile_id, f]));

    const candidates = [
      ...PREFERRED.filter(p => available.includes(p)),
      ...available.filter(p => !PREFERRED.includes(p) && (p.startsWith('front') || p === 'default')),
    ];

    // All printable sides the visitor can choose from (one placement per side)
    const bySide = new Map<string, any>();
    for (const p of available) {
      if (!vp?.placements?.[p]) continue;
      const cls = classify(p);
      if (!cls) continue;
      const file: any = filesById.get(vp.placements[p]);
      if (!file) continue;
      const existing = bySide.get(cls.side);
      if (existing && existing.rank <= cls.rank) continue;
      bySide.set(cls.side, {
        placement: p, side: cls.side, rank: cls.rank,
        area_width: file.width, area_height: file.height,
      });
    }
    const order = ['front', 'back', 'sleeve_left', 'sleeve_right'];
    const placements: any[] = order
      .map(sd => bySide.get(sd))
      .filter(Boolean)
      .map(({ rank, ...rest }: any) => rest);

    if (placements.length === 0) {
      // Fallback: any front-like placement, even unnamed
      for (const p of candidates) {
        if (!vp?.placements?.[p]) continue;
        const file: any = filesById.get(vp.placements[p]);
        if (!file) continue;
        placements.push({ placement: p, side: 'front', area_width: file.width, area_height: file.height });
        break;
      }
    }

    if (placements.length === 0) {
      return NextResponse.json({ error: 'No compatible placement' }, { status: 404 });
    }

    const info = {
      placements,
      // backward-compatible front info
      placement: placements[0].placement,
      area_width: placements[0].area_width,
      area_height: placements[0].area_height,
    };
    cache.set(cacheKey, info);
    return NextResponse.json(info);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
