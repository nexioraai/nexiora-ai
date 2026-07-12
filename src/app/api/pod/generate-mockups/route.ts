import { NextResponse } from 'next/server';
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
                .select('price, currency')
                .eq('supplier_id', 'printful')
                .eq('supplier_product_id', String(tk.variant_id))
                .single();
              results.push({
                product_name: tk.name,
                product_id: tk.product_id,
                variant_id: tk.variant_id,
                mockup_url: m.mockup_url,
                extra: (m.extra || []).map((e: any) => ({ title: e.title, url: e.url })),
                price: cpRow?.price ?? null,
                currency: cpRow?.currency ?? 'USD',
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

      if (pending.length === 0 && results.length > 0) {
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
              const storagePath = `${slug}/${m.product_id}-${m.variant_id}-${item.key}.${ext}`;
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

        const { data: site } = await supabaseAdmin
          .from('sites')
          .select('pod_designs')
          .eq('slug', slug)
          .single();
        if (site) {
          const designs = Array.isArray(site.pod_designs) ? site.pod_designs : [];
          const updated = designs.map((d: any, i: number) => {
            if (i === 0) return { ...d, mockups: results };
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

    const { data: catProducts } = await query.limit(100);

    if (!catProducts || catProducts.length === 0) {
      return NextResponse.json({ error: 'No Printful products found. Select products or run sync.' }, { status: 400 });
    }

    // 2. Deduplicate by product_id, pick first variant per product
    const seen = new Set<string>();
    const blanks: { product_id: number; variant_id: number; name: string }[] = [];

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

    // 3. Create ONE mockup task (index from frontend)
    const idx = typeof bodyIndex === 'number' ? bodyIndex : 0;
    const errors: string[] = [];

    if (idx >= blanks.length) {
      return NextResponse.json({ status: 'all_done', total: blanks.length });
    }

    const blank = blanks[idx];
    const PLACEMENTS = ['front', 'default', 'front_large'];
    let launched = null;

    for (const placement of PLACEMENTS) {
      try {
        const task = await pfFetch(`/mockup-generator/create-task/${blank.product_id}`, {
          method: 'POST',
          body: JSON.stringify({
            variant_ids: [blank.variant_id],
            format: 'jpg',
            files: [{
              placement,
              image_url: designUrl,
              position: POSITION,
            }],
          }),
        });
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

    return NextResponse.json({
      status: 'launched',
      index: idx,
      total: blanks.length,
      task: launched,
      errors,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
