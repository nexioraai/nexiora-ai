import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Produits Printful populaires pour mockups (product_id → variant_id par défaut + nom)
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

    // 1. Get site with pod_designs
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

    // Use first design
    const designUrl = designs[0].url;
    if (!designUrl) return NextResponse.json({ error: 'Design URL missing' }, { status: 400 });

    // 2. Generate mockups for each blank
    const mockups: any[] = [];
    const errors: string[] = [];

    for (const blank of PRINTFUL_BLANKS) {
      try {
        // Create task
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

        if (!task?.task_key) {
          errors.push(`${blank.name}: no task_key`);
          continue;
        }

        // Poll for result (max 30s)
        let result = null;
        for (let i = 0; i < 6; i++) {
          await delay(5000);
          const poll = await pfFetch(`/mockup-generator/task?task_key=${task.task_key}`);
          if (poll.status === 'completed') {
            result = poll;
            break;
          }
          if (poll.status === 'failed') {
            errors.push(`${blank.name}: mockup failed — ${poll.error || 'unknown'}`);
            break;
          }
        }

        if (result?.mockups?.[0]) {
          const m = result.mockups[0];
          mockups.push({
            product_name: blank.name,
            product_id: blank.product_id,
            variant_id: blank.variant_id,
            mockup_url: m.mockup_url,
            extra: (m.extra || []).map((e: any) => ({ title: e.title, url: e.url })),
            design_url: designUrl,
            created_at: new Date().toISOString(),
          });
        }

        // Rate limit: wait between products
        await delay(2000);
      } catch (err: any) {
        errors.push(`${blank.name}: ${err.message}`);
      }
    }

    // 3. Save mockups to site
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
      errors,
      mockups: mockups.map(m => ({ name: m.product_name, url: m.mockup_url })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
