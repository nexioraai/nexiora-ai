import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCjToken } from '@/lib/cj/auth';

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

/** POST /api/shop/cj/connect → enregistre les identifiants CJ du marchand. Body: { slug, cjEmail, cjApiKey } */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { slug, cjEmail, cjApiKey } = body;
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    if (!cjEmail || !cjApiKey) return NextResponse.json({ error: 'Identifiants CJ manquants' }, { status: 400 });

    const auth = await authSite(req, slug);
    if ('error' in auth) return auth.error;

    await getCjToken(cjEmail, cjApiKey);

    await supabaseAdmin
      .from('sites')
      .update({ cj_email: cjEmail, cj_api_key: cjApiKey })
      .eq('id', auth.siteId);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
