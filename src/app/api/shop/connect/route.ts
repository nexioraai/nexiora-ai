import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getProvider } from '@/lib/payments';

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

/** POST /api/shop/connect → crée le compte connecté + lien d'onboarding. Body: { slug } */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { slug } = body;
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    const auth = await authSite(req, slug);
    if ('error' in auth) return auth.error;

    const origin = new URL(req.url).origin;
    const returnUrl = `${origin}/edit/${slug}`;
    const provider = getProvider('stripe');
    const { url, accountId } = await provider.createOnboarding(slug, returnUrl);

    await supabaseAdmin
      .from('sites')
      .update({ payment_provider: 'stripe', payment_account_id: accountId })
      .eq('id', auth.siteId);

    return NextResponse.json({ url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
