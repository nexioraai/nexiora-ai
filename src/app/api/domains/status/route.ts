import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';

/** Etat du domaine d'un site, pour affichage au marchand. */
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  const { data: { user }, error: authErr } = await supabaseAnon.auth.getUser(token);
  if (authErr || !user?.email) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'Slug manquant' }, { status: 400 });

  const { data: site } = await supabaseAdmin
    .from('sites')
    .select('id, owner_email, custom_domain')
    .eq('slug', slug)
    .maybeSingle();
  if (!site || site.owner_email !== user.email) {
    return NextResponse.json({ error: 'Site introuvable' }, { status: 403 });
  }

  const { data: domain } = await supabaseAdmin
    .from('site_domains')
    .select('domain, status, purchased_at, dns_configured_at, google_verified_at, sitemap_submitted_at, renews_at, last_error')
    .eq('site_id', site.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    customDomain: site.custom_domain || null,
    purchased: domain || null,
  });
}
