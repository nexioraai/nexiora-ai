import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjGetCategories } from '@/lib/cj/client';

/** GET /api/shop/cj/categories?slug=xxx — catégories CJ hiérarchiques. */
export async function GET(req: Request) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);
    if (userError || !user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'slug manquant' }, { status: 400 });

    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('cj_email, cj_api_key')
      .eq('slug', slug)
      .eq('owner_email', user.email)
      .single();
    if (!site?.cj_email || !site?.cj_api_key) {
      return NextResponse.json({ error: 'Compte CJ non connecté' }, { status: 400 });
    }

    const categories = await cjGetCategories(site.cj_email, site.cj_api_key);
    return NextResponse.json({ categories });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
