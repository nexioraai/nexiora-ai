import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import Anthropic from '@anthropic-ai/sdk';
import { sitePricing } from '@/lib/pricing';

const anthropic = new Anthropic();

export async function POST(req: Request) {
  try {
    const { slug, image } = await req.json();
    if (!slug || !image) {
      return NextResponse.json({ error: 'Missing slug or image' }, { status: 400 });
    }

    const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: 'Invalid image format' }, { status: 400 });
    }
    const mediaType = match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    const base64Data = match[2];

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: 'You are a product search assistant. Look at this image and return ONLY 2-4 short English search keywords that describe the product shown (e.g. "wireless headphones black" or "phone case clear"). No explanation, no punctuation, just the keywords separated by spaces.' },
        ],
      }],
    });

    const keywords = ((msg.content[0] as any)?.text || '').trim();
    if (!keywords) {
      return NextResponse.json({ products: [], keywords: '', total: 0 });
    }

    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id, cj_margin_percent')
      .eq('slug', slug)
      .single();

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const { margin: markup } = sitePricing(site);

    const words = keywords
      .split(/\s+/)
      .map((w: string) => w.replace(/[^a-zA-Z0-9]/g, ''))
      .filter((w: string) => w.length >= 2);

    if (words.length === 0) {
      return NextResponse.json({ products: [], keywords, total: 0 });
    }

    const orFilter = words.map((w: string) => 'name.ilike.%' + w + '%,description.ilike.%' + w + '%').join(',');

    const { data: products } = await supabaseAdmin
      .from('catalog_products')
      .select('id, supplier_id, supplier_product_id, name, description, category, images, price, currency, variants, shipping_days_min, shipping_days_max, warehouse_country, in_stock')
      .eq('in_stock', true)
      .or(orFilter)
      .limit(24);

    const safe = (products || []).map((p: any) => ({
      ...p,
      price: Math.round(p.price * (1 + markup / 100) * 100) / 100,
    }));

    return NextResponse.json({ products: safe, keywords, total: safe.length });
  } catch (e: any) {
    console.error('[image-search]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
