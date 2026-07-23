import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const maxDuration = 30;

// Templates never change for a given product — cache in module scope
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

type Side = 'front' | 'back' | 'sleeve_left' | 'sleeve_right';

// Side order shown to the visitor
const SIDE_ORDER: Side[] = ['front', 'back', 'sleeve_left', 'sleeve_right'];

// Declarative classification. First match wins. `prefer` breaks ties between
// placements of the SAME side only — never across sides.
const RULES: { match: RegExp; side: Side | null; prefer: number }[] = [
  { match: /label/i, side: null, prefer: 0 },                                  // not for visitors
  { match: /back/i, side: 'back', prefer: 1 },
  { match: /sleeve_left|wrist_left/i, side: 'sleeve_left', prefer: 1 },
  { match: /sleeve_right|wrist_right/i, side: 'sleeve_right', prefer: 1 },
  { match: /chest_left|chest_right/i, side: 'front', prefer: 2 },              // small corner logo
  { match: /front|chest|default/i, side: 'front', prefer: 1 },                 // main front area
];

function classify(p: string): { side: Side; prefer: number } | null {
  for (const r of RULES) {
    if (!r.match.test(p)) continue;
    return r.side ? { side: r.side, prefer: r.prefer } : null;
  }
  return { side: 'front', prefer: 3 }; // unknown but printable
}

/** GET /api/pod/printfile-info?variant_id=Y[&product_id=X]
 *  Returns, for every printable side, the official Printful template image and
 *  the exact print area on it (as fractions), so the canvas never guesses. */
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

    const tpl = await pfFetch(`/mockup-generator/templates/${productId}`);
    const templatesById = new Map<number, any>(
      (tpl.templates || []).map((t: any) => [t.template_id, t])
    );

    // Templates for this specific variant, falling back to the first mapping
    const mapping = (tpl.variant_mapping || []).find(
      (m: any) => String(m.variant_id) === String(variantId)
    ) || (tpl.variant_mapping || [])[0];

    if (!mapping?.templates?.length) {
      return NextResponse.json({ error: 'No template for this product' }, { status: 404 });
    }

    // Keep one placement per side: biggest print area wins, rule preference breaks ties
    const bySide = new Map<string, any>();
    for (const entry of mapping.templates) {
      const cls = classify(entry.placement || '');
      if (!cls) continue;
      const t: any = templatesById.get(entry.template_id);
      if (!t || !t.image_url || !t.template_width || !t.template_height) continue;

      const candidate = {
        placement: entry.placement,
        side: cls.side,
        prefer: cls.prefer,
        image_url: t.image_url,
        background_color: t.background_color || null,
        // Print area as fractions of the template image — exact, never guessed
        area: {
          left: t.print_area_left / t.template_width,
          top: t.print_area_top / t.template_height,
          width: t.print_area_width / t.template_width,
          height: t.print_area_height / t.template_height,
        },
        // Printfile pixel dimensions (used to build Printful coordinates)
        area_width: t.print_area_width,
        area_height: t.print_area_height,
        _size: t.print_area_width * t.print_area_height,
      };

      const existing = bySide.get(cls.side);
      const better = !existing
        || candidate._size > existing._size
        || (candidate._size === existing._size && candidate.prefer < existing.prefer);
      if (better) bySide.set(cls.side, candidate);
    }

    const placements = SIDE_ORDER
      .map(sd => bySide.get(sd))
      .filter(Boolean)
      .map(({ prefer, _size, ...rest }: any) => rest);

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
