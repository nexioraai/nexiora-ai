import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getProvider } from '@/lib/payments';

async function authSite(req: Request, slug: string): Promise<{ siteId: string; accountId: string | null; provider: string | null } | { error: NextResponse }> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);
  if (userError || !user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: site, error: siteError } = await supabaseAdmin
    .from('sites')
    .select('id, payment_account_id, payment_provider')
    .eq('slug', slug)
    .eq('owner_email', user.email)
    .single();
  if (siteError || !site) return { error: NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 }) };
  return { siteId: site.id, accountId: site.payment_account_id, provider: site.payment_provider };
}

/** GET /api/shop/connect/status?slug=... → { connected, ready } */
export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    const auth = await authSite(req, slug);
    if ('error' in auth) return auth.error;

    if (!auth.accountId) return NextResponse.json({ connected: false, ready: false });

    const provider = getProvider(auth.provider);
    const { ready } = await provider.getStatus(auth.accountId);
    return NextResponse.json({ connected: true, ready });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
