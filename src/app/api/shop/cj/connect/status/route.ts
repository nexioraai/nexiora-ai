import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/** GET /api/shop/cj/connect/status?slug=... → { connected: boolean } */
export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('cj_email')
      .eq('slug', slug)
      .single();
    return NextResponse.json({ connected: !!site?.cj_email });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
