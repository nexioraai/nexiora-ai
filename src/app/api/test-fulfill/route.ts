import { NextRequest, NextResponse } from 'next/server';
import { cjGetVariants } from '@/lib/cj/client';

export async function GET(req: NextRequest) {
  const email = process.env.CJ_EMAIL || '';
  const apiKey = process.env.CJ_API_KEY || '';
  try {
    const variants = await cjGetVariants(email, apiKey, '1390570202273550336');
    return NextResponse.json({
      ok: true,
      emailUsed: email.slice(0, 6) + '...',
      variantsType: Array.isArray(variants) ? 'array' : typeof variants,
      count: Array.isArray(variants) ? variants.length : 0,
      firstVid: Array.isArray(variants) && variants[0] ? (variants[0].vid || variants[0].variantId) : null,
      raw: variants,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, emailUsed: email.slice(0, 6) + '...', error: String(e?.message || e) }, { status: 500 });
  }
}
