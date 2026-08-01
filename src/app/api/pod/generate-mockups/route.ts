import { NextResponse } from 'next/server';
import { createHash } from 'crypto';

export const maxDuration = 300;
import { supabaseAdmin } from '@/lib/supabase-admin';

const POSITION = {
  area_width: 1800,
  area_height: 2400,
  width: 1800,
  height: 1800,
  top: 300,
  left: 0,
};

async function pfFetch(path: string, init?: RequestInit): Promise<any> {
  const token = process.env.PRINTFUL_API_TOKEN || '';
  const storeId = process.env.PRINTFUL_STORE_ID || '';
  const res = await fetch(`https://api.printful.com${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(storeId ? { 'X-PF-Store-Id': storeId } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Printful ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()).result;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function POST(req: Request) {
  try {
    const { slug, action, task_keys, index: bodyIndex } = await req.json();
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });

    // ---- POLL mode ----
    if (action === 'poll' && Array.isArray(task_keys)) {
      const results: any[] = [];
      const pending: string[] = [];
      const errors: string[] = [];

      await Promise.all(
        task_keys.map(async (tk: any) => {
          try {
            const poll = await pfFetch(`/mockup-generator/task?task_key=${tk.task_key}`);
            if (poll.status === 'completed' && poll.mockups?.[0]) {
              const m = poll.mockups[0];
              // Lookup price from catalog
              const { data: cpRow } = await supabaseAdmin
                .from('catalog_products')
                .select('id, supplier_id, price, currency, shipping_days_min, shipping_days_max')
                .eq('supplier_id', 'printful')
                .eq('supplier_product_id', String(tk.variant_id))
                .single();
              results.push({
                product_name: tk.name,
                product_id: tk.product_id,
                variant_id: tk.variant_id,
                catalog_product_id: cpRow?.id ?? null,
                supplier_id: cpRow?.supplier_id ?? 'printful',
                mockup_url: m.mockup_url,
                extra: (m.extra || []).map((e: any) => ({ title: e.title, url: e.url })),
                price: cpRow?.price ?? null,
                currency: cpRow?.currency ?? 'USD',
                shipping_days_min: cpRow?.shipping_days_min ?? null,
                shipping_days_max: cpRow?.shipping_days_max ?? null,
                created_at: new Date().toISOString(),
              });
            } else if (poll.status === 'failed') {
              errors.push(`${tk.name}: ${poll.error || 'failed'}`);
            } else {
              pending.push(tk.task_key);
            }
          } catch (err: any) {
            errors.push(`${tk.name}: ${err.message}`);
          }
        })
      );

      if (results.length > 0) {
        // Fetch site first: current design URL needed for hashing + tagging
        const { data: site } = await supabaseAdmin
          .from('sites')
          .select('pod_designs')
          .eq('slug', slug)
          .single();
        const designs = Array.isArray(site?.pod_designs) ? site.pod_designs : [];
        const currentDesignUrl = designs[0]?.url || '';
        const designHash = createHash('md5').update(currentDesignUrl).digest('hex').slice(0, 8);
        // Download mockup images to Supabase Storage (permanent URLs)
        const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        for (const m of results) {
          const urls = [
            { key: 'mockup_url', url: m.mockup_url },
            ...((m.extra || []).map((e: any, ei: number) => ({ key: `extra_${ei}`, url: e.url }))),
          ];
          for (const item of urls) {
            try {
              const imgRes = await fetch(item.url);
              if (!imgRes.ok) continue;
              const buf = Buffer.from(await imgRes.arrayBuffer());
              const ext = item.url.includes('.png') ? 'png' : 'jpg';
              const storagePath = `${slug}/${designHash}-${m.product_id}-${m.variant_id}-${item.key}.${ext}`;
              await supabaseAdmin.storage.from('pod-designs').upload(storagePath, buf, {
                contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
                upsert: true,
              });
              const permUrl = `${sbUrl}/storage/v1/object/public/pod-designs/${storagePath}`;
              if (item.key === 'mockup_url') {
                m.mockup_url = permUrl;
              } else {
                const idx = parseInt(item.key.split('_')[1]);
                if (m.extra?.[idx]) m.extra[idx].url = permUrl;
              }
            } catch (e) {
              console.error('Mockup upload error:', e);
            }
          }
        }

        if (site) {
          results.forEach((r: any) => { r.design_url = currentDesignUrl; });
          const updated = designs.map((d: any, i: number) => {
            if (i === 0) {
              const existing = Array.isArray(d.mockups) ? d.mockups : [];
              const newKeys = new Set(results.map((r: any) => `${r.product_id}-${r.variant_id}`));
              // Purge mockups from previous designs + duplicates of new results
              const kept = existing.filter((m: any) =>
                m.design_url === currentDesignUrl && !newKeys.has(`${m.product_id}-${m.variant_id}`)
              );
              return { ...d, mockups: [...kept, ...results] };
            }
            return d;
          });
          await supabaseAdmin.from('sites').update({ pod_designs: updated }).eq('slug', slug);
        }
      }

      return NextResponse.json({
        status: pending.length > 0 ? 'pending' : 'done',
        generated: results.length,
        pending: pending.length,
        errors,
        mockups: results.map(m => ({ name: m.product_name, url: m.mockup_url })),
      });
    }

    // ---- CREATE mode ----
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id, pod_designs, dropship_type')
      .eq('slug', slug)
      .single();
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

    const designs = Array.isArray(site.pod_designs) ? site.pod_designs : [];
    if (designs.length === 0) return NextResponse.json({ error: 'No designs uploaded' }, { status: 400 });
    const designUrl = designs[0].url;
    if (!designUrl) return NextResponse.json({ error: 'Design URL missing' }, { status: 400 });

    // 1. Get selected products from pod_designs or fallback to auto
    const selectedProducts = designs[0]?.selected_products || {};
    const selectedIds = Object.entries(selectedProducts)
      .filter(([_, v]: [string, any]) => v.selected)
      .map(([id]: [string, any]) => id);

    let query = supabaseAdmin
      .from('catalog_products')
      .select('supplier_product_id, supplier_parent_id, name')
      .eq('supplier_id', 'printful')
      .eq('in_stock', true)
      .not('supplier_parent_id', 'is', null);

    if (selectedIds.length > 0) {
      query = query.in('supplier_parent_id', selectedIds);
    }

    const { data: catProducts } = await query.limit(1000);

    if (!catProducts || catProducts.length === 0) {
      return NextResponse.json({ error: 'No Printful products found. Select products or run sync.' }, { status: 400 });
    }

    // 2. Deduplicate by product_id, use merchant-selected variant if available
    const seen = new Set<string>();
    const blanks: { product_id: number; variant_id: number; name: string }[] = [];

    for (const cp of catProducts) {
      if (!cp.supplier_parent_id || seen.has(cp.supplier_parent_id)) continue;
      const sel = selectedProducts[cp.supplier_parent_id];
      const preferredVariant = sel?.variantId ? String(sel.variantId) : null;
      // If merchant selected a specific variant, skip until we find it
      if (preferredVariant && cp.supplier_product_id !== preferredVariant) continue;
      seen.add(cp.supplier_parent_id);
      blanks.push({
        product_id: Number(cp.supplier_parent_id),
        variant_id: Number(cp.supplier_product_id),
        name: cp.name,
      });
    }
    // Second pass: fill in products where preferred variant wasn't found
    for (const cp of catProducts) {
      if (!cp.supplier_parent_id || seen.has(cp.supplier_parent_id)) continue;
      seen.add(cp.supplier_parent_id);
      blanks.push({
        product_id: Number(cp.supplier_parent_id),
        variant_id: Number(cp.supplier_product_id),
        name: cp.name,
      });
    }

    if (blanks.length === 0) {
      return NextResponse.json({ error: 'No unique Printful products found' }, { status: 400 });
    }

    // Skip products that already have a mockup (avoid burning rate limit)
    const existingMockups = Array.isArray(designs[0]?.mockups) ? designs[0].mockups : [];
    const mockedIds = new Set(
      existingMockups
        .filter((m: any) => m.design_url === designUrl)
        .map((m: any) => String(m.product_id))
    );
    const todo = blanks.filter(b => !mockedIds.has(String(b.product_id)));

    if (todo.length === 0) {
      return NextResponse.json({ status: 'all_done', total: blanks.length, already_done: true });
    }

    // 3. Create ONE mockup task (index from frontend)
    const idx = typeof bodyIndex === 'number' ? bodyIndex : 0;
    const errors: string[] = [];

    if (idx >= todo.length) {
      return NextResponse.json({ status: 'all_done', total: todo.length });
    }

    const blank = todo[idx];
    const PLACEMENTS = ['front', 'default', 'front_large', 'embroidery_front', 'embroidery_front_large'];
    let launched = null;

    // Fetch real printfile specs for this product (placement + exact print area)
    let placementsToTry: { placement: string; position: typeof POSITION }[] = [];
    try {
      const pf = await pfFetch(`/mockup-generator/printfiles/${blank.product_id}`);
      const available = Object.keys(pf.available_placements || {});
      const vp = (pf.variant_printfiles || []).find((v: any) => v.variant_id === blank.variant_id)
        || (pf.variant_printfiles || [])[0];
      const filesById = new Map((pf.printfiles || []).map((f: any) => [f.printfile_id, f]));
      // Preferred order first, then any front-like placement the product actually exposes
      const candidates = [
        ...PLACEMENTS.filter(p => available.includes(p)),
        ...available.filter(p => !PLACEMENTS.includes(p) && (p.startsWith('front') || p.startsWith('embroidery_front') || p === 'default')),
      ];
      for (const p of candidates) {
        if (!vp?.placements?.[p]) continue;
        const file: any = filesById.get(vp.placements[p]);
        if (!file) continue;
        // Center the design at 80% of the print area width (square design assumed)
        const w = Math.round(file.width * 0.8);
        const h = w;
        placementsToTry.push({
          placement: p,
          position: {
            area_width: file.width,
            area_height: file.height,
            width: w,
            height: h,
            top: Math.max(0, Math.round((file.height - h) / 2)),
            left: Math.max(0, Math.round((file.width - w) / 2)),
          },
        });
      }
    } catch {
      // printfiles unavailable -> fallback below
    }
    if (placementsToTry.length === 0) {
      placementsToTry = PLACEMENTS.map(p => ({ placement: p, position: POSITION }));
    }

    for (const { placement, position } of placementsToTry) {
      try {
        let task: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            task = await pfFetch(`/mockup-generator/create-task/${blank.product_id}`, {
              method: 'POST',
              body: JSON.stringify({
                variant_ids: [blank.variant_id],
                format: 'jpg',
                files: [{
                  placement,
                  image_url: designUrl,
                  position,
                }],
              }),
            });
            break;
          } catch (err: any) {
            if (err.message.includes('429') && attempt < 2) {
              const m = err.message.match(/after (\d+) seconds/);
              const waitS = m ? parseInt(m[1]) + 3 : 63;
              await delay(waitS * 1000);
              continue;
            }
            throw err;
          }
        }
        if (task?.task_key) {
          launched = {
            task_key: task.task_key,
            name: blank.name,
            product_id: blank.product_id,
            variant_id: blank.variant_id,
          };
          break;
        }
      } catch (err: any) {
        if (err.message.includes('not allowed')) continue;
        errors.push(`${blank.name}: ${err.message}`);
        break;
      }
    }

    if (!launched && errors.length === 0) {
      errors.push(`${blank.name}: no compatible placement found`);
    }

    return NextResponse.json({
      status: 'launched',
      index: idx,
      total: todo.length,
      task: launched,
      errors,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
