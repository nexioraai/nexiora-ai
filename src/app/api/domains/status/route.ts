import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getVercelDomainStatus } from '@/lib/domains/vercel';

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
    .select('id, owner_email, custom_domain, custom_domain_google_status, custom_domain_google_token, custom_domain_google_attempts, custom_domain_google_last_attempt_at, custom_domain_google_last_error')
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

  // BYOD : le domaine n'est jamais dans site_domains (Nexiora ne possede pas
  // sa zone DNS) — seul un appel Vercel en direct dit s'il est reellement
  // rattache et verifie ; la valeur stockee dans sites.custom_domain seule
  // ne le garantit pas.
  let byodVerification: { attached: boolean; verified: boolean } | null = null;
  let byodTxt: { type: string; name: string; value: string }[] = [];
  // Etat Google BYOD : deja gere par le cron domain-indexing-byod, ici on ne
  // fait que lire les colonnes sites.custom_domain_google_* pour affichage.
  let byodGoogle: {
    status: string | null;
    token: string | null;
    attempts: number | null;
    lastAttemptAt: string | null;
    lastError: string | null;
  } | null = null;
  if (!domain && site.custom_domain) {
    try {
      const st = await getVercelDomainStatus(site.custom_domain);
      byodVerification = { attached: st.attached, verified: st.verified };
      byodTxt = st.verification.map((v) => ({ type: v.type, name: v.domain, value: v.value }));
    } catch (e) {
      console.error('getVercelDomainStatus failed for', site.custom_domain, e);
    }
    byodGoogle = {
      status: site.custom_domain_google_status,
      token: site.custom_domain_google_token,
      attempts: site.custom_domain_google_attempts,
      lastAttemptAt: site.custom_domain_google_last_attempt_at,
      lastError: site.custom_domain_google_last_error,
    };
  }

  return NextResponse.json({
    customDomain: site.custom_domain || null,
    purchased: domain || null,
    byodVerification,
    byodTxt,
    byodGoogle,
  });
}
