import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';

async function authSite(req: Request, slug: string): Promise<{ siteId: string } | { error: NextResponse }> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);
  if (userError || !user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: site, error: siteError } = await supabaseAdmin
    .from('sites')
    .select('id')
    .eq('slug', slug)
    .eq('owner_email', user.email)
    .single();
  if (siteError || !site) return { error: NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 }) };
  return { siteId: site.id };
}

/** GET /api/shop/shipping?slug=... → { shippingFlat } */
export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    const auth = await authSite(req, slug);
    if ('error' in auth) return auth.error;
    const { data } = await supabaseAdmin.from('sites').select('shipping_flat').eq('id', auth.siteId).single();
    return NextResponse.json({ shippingFlat: Number(data?.shipping_flat) || 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** PATCH /api/shop/shipping → sauve le tarif. Body: { slug, shippingFlat } */
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { slug, shippingFlat } = body;
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    const value = Number(shippingFlat);
    if (isNaN(value) || value < 0) return NextResponse.json({ error: 'Tarif invalide' }, { status: 400 });
    const auth = await authSite(req, slug);
    if ('error' in auth) return auth.error;
    await supabaseAdmin.from('sites').update({ shipping_flat: value }).eq('id', auth.siteId);
    return NextResponse.json({ shippingFlat: value });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
