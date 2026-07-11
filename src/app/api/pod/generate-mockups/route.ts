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
    const { slug, action, task_keys } = await req.json();
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
              results.push({
                product_name: tk.name,
                product_id: tk.product_id,
                variant_id: tk.variant_id,
                mockup_url: m.mockup_url,
                extra: (m.extra || []).map((e: any) => ({ title: e.title, url: e.url })),
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

    // 1. Query real Printful products from catalog_products
    const { data: catProducts } = await supabaseAdmin
      .from('catalog_products')
      .select('supplier_product_id, name')
      .eq('supplier_id', 'printful')
      .eq('in_stock', true)
      .limit(20);

    if (!catProducts || catProducts.length === 0) {
      return NextResponse.json({ error: 'No Printful products in catalog' }, { status: 400 });
    }

    // 2. Resolve product_id parent for each variant (deduplicate by product_id)
    const seen = new Set<number>();
    const blanks: { product_id: number; variant_id: number; name: string; placement: string }[] = [];

    for (const cp of catProducts) {
      try {
        const data = await pfFetch(`/products/variant/${cp.supplier_product_id}`);
        const productId = data?.product?.id;
        if (!productId || seen.has(productId)) continue;
        seen.add(productId);

        // Get available placement
        let placement = 'front';
        try {
          const pf = await pfFetch(`/mockup-generator/printfiles/${productId}`);
          const placements = pf?.available_placements || {};
          if (placements.front) placement = 'front';
          else if (placements.default) placement = 'default';
          else placement = Object.keys(placements)[0] || 'front';
        } catch {}

        blanks.push({
          product_id: productId,
          variant_id: Number(cp.supplier_product_id),
          name: data?.product?.title || cp.name,
          placement,
        });
        await delay(1000);
      } catch {}

      if (blanks.length >= 6) break; // Max 6 unique products (Vercel 60s safe)
    }

    if (blanks.length === 0) {
      return NextResponse.json({ error: 'Could not resolve any Printful products' }, { status: 400 });
    }

    // 3. Create mockup tasks
    const launched: any[] = [];
    const errors: string[] = [];

    for (const blank of blanks) {
      try {
        const task = await pfFetch(`/mockup-generator/create-task/${blank.product_id}`, {
          method: 'POST',
          body: JSON.stringify({
            variant_ids: [blank.variant_id],
            format: 'jpg',
            files: [{
              placement: blank.placement,
              image_url: designUrl,
              position: POSITION,
            }],
          }),
        });
        if (task?.task_key) {
          launched.push({
            task_key: task.task_key,
            name: blank.name,
            product_id: blank.product_id,
            variant_id: blank.variant_id,
          });
        }
      } catch (err: any) {
        errors.push(`${blank.name}: ${err.message}`);
      }
      await delay(2000);
    }

    return NextResponse.json({
      status: 'launched',
      task_keys: launched,
      errors,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
