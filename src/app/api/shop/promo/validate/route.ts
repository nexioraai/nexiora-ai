import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/shop/promo/validate
 * Body: { slug, code, subtotal }
 * Retourne le rabais applicable.
 */
export async function POST(req: NextRequest) {
  try {
    const { slug, code, subtotal } = await req.json();
    if (!slug || !code) return NextResponse.json({ error: 'slug et code requis' }, { status: 400 });

    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id')
      .eq('slug', slug)
      .single();
    if (!site) return NextResponse.json({ error: 'Site introuvable' }, { status: 404 });

    const { data: promo } = await supabaseAdmin
      .from('promo_codes')
      .select('*')
      .eq('site_id', site.id)
      .ilike('code', code.trim())
      .eq('active', true)
      .single();

    if (!promo) return NextResponse.json({ valid: false, error: 'Code invalide' });

    // Check expiry
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, error: 'Code expiré' });
    }

    // Check max uses
    if (promo.max_uses && promo.used_count >= promo.max_uses) {
      return NextResponse.json({ valid: false, error: 'Code épuisé' });
    }

    // Check min order
    const sub = Number(subtotal) || 0;
    if (promo.min_order && sub < Number(promo.min_order)) {
      return NextResponse.json({ valid: false, error: `Minimum ${promo.min_order}$ requis` });
    }

    // Calculate discount
    let discount = 0;
    if (promo.discount_type === 'percent') {
      discount = Math.round(sub * (Number(promo.discount_value) / 100) * 100) / 100;
    } else {
      discount = Math.min(Number(promo.discount_value), sub);
    }

    return NextResponse.json({
      valid: true,
      promo_id: promo.id,
      code: promo.code,
      discount_type: promo.discount_type,
      discount_value: Number(promo.discount_value),
      discount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
