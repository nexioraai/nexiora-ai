import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';

/** GET /api/shop/cj/connect/status?slug=... → { connected: boolean } */
export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('cj_email, cj_auto_pay, cj_margin_percent, cj_round_mode')
      .eq('slug', slug)
      .single();
    return NextResponse.json({ connected: !!site?.cj_email, autoPay: !!site?.cj_auto_pay, marginPercent: site?.cj_margin_percent ?? 100, roundMode: site?.cj_round_mode ?? 'off' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** PATCH /api/shop/cj/connect/status → bascule le paiement auto CJ. Body: { slug, autoPay } */
export async function PATCH(req: Request) {
  try {
    const { slug, autoPay, marginPercent, roundMode } = await req.json();
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });

    const updates: Record<string, any> = {};
    if (autoPay !== undefined) {
      if (typeof autoPay !== 'boolean') return NextResponse.json({ error: 'autoPay invalide' }, { status: 400 });
      updates.cj_auto_pay = autoPay;
    }
    if (marginPercent !== undefined) {
      const m = Number(marginPercent);
      if (!Number.isFinite(m) || m < 0 || m > 1000) return NextResponse.json({ error: 'marginPercent invalide' }, { status: 400 });
      updates.cj_margin_percent = m;
    }
    if (roundMode !== undefined) {
      if (!['off', 'down', 'up'].includes(roundMode)) return NextResponse.json({ error: 'roundMode invalide' }, { status: 400 });
      updates.cj_round_mode = roundMode;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Aucune modification' }, { status: 400 });
    }

    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);
    if (userError || !user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, cj_email')
      .eq('slug', slug)
      .eq('owner_email', user.email)
      .single();
    if (siteError || !site) return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 });
    if (!site.cj_email) return NextResponse.json({ error: 'Compte CJ non connecté' }, { status: 400 });

    await supabaseAdmin
      .from('sites')
      .update(updates)
      .eq('id', site.id);

    return NextResponse.json({ ok: true, ...updates });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
