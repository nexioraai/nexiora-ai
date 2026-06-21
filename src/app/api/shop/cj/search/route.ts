import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjSearchProducts } from '@/lib/cj/client';

/** POST /api/shop/cj/search → recherche produits CJ. Body: { slug, keyword } */
export async function POST(req: Request) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);
    if (userError || !user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { slug, keyword } = await req.json();
    if (!slug || !keyword) return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });

    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('cj_email, cj_api_key')
      .eq('slug', slug)
      .eq('owner_email', user.email)
      .single();
    if (!site?.cj_email || !site?.cj_api_key) {
      return NextResponse.json({ error: 'Compte CJ non connecté' }, { status: 400 });
    }

    const result = await cjSearchProducts(site.cj_email, site.cj_api_key, keyword);
    return NextResponse.json({ products: result?.list ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
