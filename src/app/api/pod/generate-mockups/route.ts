import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const PRINTFUL_BLANKS = [
  { product_id: 71, variant_id: 4012, name: 'Unisex Staple T-Shirt', placement: 'front' },
  { product_id: 380, variant_id: 9867, name: 'Unisex Hoodie', placement: 'front' },
  { product_id: 382, variant_id: 9951, name: 'Unisex Sweatshirt', placement: 'front' },
  { product_id: 474, variant_id: 14709, name: 'iPhone Case', placement: 'front' },
  { product_id: 19, variant_id: 1320, name: 'Classic Mug 11oz', placement: 'front' },
  { product_id: 1, variant_id: 1, name: 'Poster', placement: 'default' },
  { product_id: 534, variant_id: 16585, name: 'Tote Bag', placement: 'front' },
  { product_id: 279, variant_id: 7854, name: 'Baseball Cap', placement: 'front' },
];

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

/** POST /api/pod/generate-mockups — { slug } */
export async function POST(req: Request) {
  try {
    const { slug } = await req.json();
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });

    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id, pod_designs, dropship_type')
      .eq('slug', slug)
      .single();
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

    const designs = Array.isArray(site.pod_designs) ? site.pod_designs : [];
    if (designs.length === 0) {
      return NextResponse.json({ error: 'No designs uploaded' }, { status: 400 });
    }

    const designUrl = designs[0].url;
    if (!designUrl) return NextResponse.json({ error: 'Design URL missing' }, { status: 400 });

    // 1. Launch ALL tasks in parallel
    const tasks: { blank: typeof PRINTFUL_BLANKS[0]; task_key: string }[] = [];
    const errors: string[] = [];

    await Promise.all(
      PRINTFUL_BLANKS.map(async (blank) => {
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
            tasks.push({ blank, task_key: task.task_key });
          } else {
            errors.push(`${blank.name}: no task_key`);
          }
        } catch (err: any) {
          errors.push(`${blank.name}: ${err.message}`);
        }
      })
    );

    // 2. Poll ALL tasks in parallel (max 40s, 8 polls × 5s)
    const mockups: any[] = [];
    const pending = new Set(tasks.map(t => t.task_key));

    for (let round = 0; round < 8 && pending.size > 0; round++) {
      await delay(5000);
      await Promise.all(
        tasks.filter(t => pending.has(t.task_key)).map(async (t) => {
          try {
            const poll = await pfFetch(`/mockup-generator/task?task_key=${t.task_key}`);
            if (poll.status === 'completed' && poll.mockups?.[0]) {
              const m = poll.mockups[0];
              mockups.push({
                product_name: t.blank.name,
                product_id: t.blank.product_id,
                variant_id: t.blank.variant_id,
                mockup_url: m.mockup_url,
                extra: (m.extra || []).map((e: any) => ({ title: e.title, url: e.url })),
                design_url: designUrl,
                created_at: new Date().toISOString(),
              });
              pending.delete(t.task_key);
            } else if (poll.status === 'failed') {
              errors.push(`${t.blank.name}: ${poll.error || 'failed'}`);
              pending.delete(t.task_key);
            }
          } catch {}
        })
      );
    }

    // 3. Save mockups to pod_designs
    const updatedDesigns = designs.map((d: any, i: number) => {
      if (i === 0) return { ...d, mockups };
      return d;
    });

    await supabaseAdmin
      .from('sites')
      .update({ pod_designs: updatedDesigns })
      .eq('slug', slug);

    return NextResponse.json({
      success: true,
      generated: mockups.length,
      total: PRINTFUL_BLANKS.length,
      errors,
      mockups: mockups.map(m => ({ name: m.product_name, url: m.mockup_url })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
