import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/shop/promo/active?slug=my-shop
 * Retourne le code promo actif pour affichage bannière.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ promo: null });

  const { data: site } = await supabaseAdmin
    .from('sites')
    .select('id')
    .eq('slug', slug)
    .single();
  if (!site) return NextResponse.json({ promo: null });

  const { data: promo } = await supabaseAdmin
    .from('promo_codes')
    .select('code, discount_type, discount_value, min_order, expires_at')
    .eq('site_id', site.id)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!promo) return NextResponse.json({ promo: null });

  // Check expiry
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return NextResponse.json({ promo: null });
  }

  return NextResponse.json({ promo });
}
