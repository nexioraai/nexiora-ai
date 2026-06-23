import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjGetVariants } from '@/lib/cj/client';

/** POST /api/shop/cj/import → importe un ou plusieurs produits CJ. Body: { slug, pids: string[] } */
export async function POST(req: Request) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);
    if (userError || !user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { slug, pids } = await req.json();
    if (!slug || !Array.isArray(pids) || pids.length === 0) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }

    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id, cj_email, cj_api_key, cj_margin_percent')
      .eq('slug', slug)
      .eq('owner_email', user.email)
      .single();
    if (!site?.cj_email || !site?.cj_api_key) {
      return NextResponse.json({ error: 'Compte CJ non connecté' }, { status: 400 });
    }

    let imported = 0;
    const errors: string[] = [];

    for (const pid of pids) {
      try {
        const variants = await cjGetVariants(site.cj_email, site.cj_api_key, pid);
        const first = Array.isArray(variants) ? variants[0] : variants?.[0];
        if (!first?.vid) {
          errors.push(`${pid}: aucun variant`);
          continue;
        }
        const { error: insertError } = await supabaseAdmin.from('shop_products').insert({
          site_id: site.id,
          name: first.variantNameEn || first.variantName || 'Produit CJ',
          description: '',
          price: Math.round((Number(first.variantSellPrice) || 0) * (1 + (Number(site.cj_margin_percent) || 0) / 100) * 100) / 100,
          currency: 'USD',
          images: first.variantImage ? [first.variantImage] : [],
          stock: 0,
          published: false,
          cj_pid: pid,
          cj_vid: first.vid,
        });
        if (insertError) {
          errors.push(`${pid}: ${insertError.message}`);
          continue;
        }
        imported++;
      } catch (e: any) {
        errors.push(`${pid}: ${e.message}`);
      }
    }

    return NextResponse.json({ imported, errors });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
