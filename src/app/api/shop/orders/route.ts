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

/** GET /api/shop/orders?slug=... → commandes du site avec leurs lignes. */
export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    const auth = await authSite(req, slug);
    if ('error' in auth) return auth.error;

    const { data, error } = await supabaseAdmin
      .from('shop_orders')
      .select('id, status, total, currency, customer_email, customer_name, shipping_address, tracking_number, payment_provider, created_at, shop_order_items(product_name, quantity, unit_price)')
      .eq('site_id', auth.siteId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    return NextResponse.json({ orders: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** PATCH /api/shop/orders → marque une commande expédiée. Body: { slug, orderId, trackingNumber } */
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { slug, orderId, trackingNumber } = body;
    if (!slug || !orderId) return NextResponse.json({ error: 'Missing slug or orderId' }, { status: 400 });
    const auth = await authSite(req, slug);
    if ('error' in auth) return auth.error;

    // Vérifie que la commande appartient bien au site
    const { data: order } = await supabaseAdmin
      .from('shop_orders')
      .select('id')
      .eq('id', orderId)
      .eq('site_id', auth.siteId)
      .maybeSingle();
    if (!order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });

    await supabaseAdmin
      .from('shop_orders')
      .update({ status: 'shipped', tracking_number: trackingNumber || null })
      .eq('id', orderId);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
