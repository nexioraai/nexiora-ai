import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { listAllDomains } from '@/lib/domains/porkbun';
import { provisionDomain } from '@/lib/domains/provision';

export const maxDuration = 120;

/**
 * Provisionne un domaine DEJA present dans le compte Porkbun Nexiora
 * (transfere, ou achete hors parcours Stripe).
 * Aucun achat n'est declenche : purchased_at est prerempli, ce qui fait
 * sauter l'etape 1 de provisionDomain. Le reste de la chaine est identique
 * au parcours payant : Vercel, DNS, TXT Google.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  // Deux voies d'appel : le marchand via son token Supabase, ou l'operateur
  // Nexiora via CRON_SECRET (reprise manuelle, domaine transfere).
  const isOperator = !!process.env.CRON_SECRET && token === process.env.CRON_SECRET;
  let userEmail: string | null = null;
  if (!isOperator) {
    const { data: { user }, error: authErr } = await supabaseAnon.auth.getUser(token);
    if (authErr || !user?.email) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    userEmail = user.email;
  }

  const { slug, domain } = await req.json().catch(() => ({}));
  const clean = String(domain || '').trim().toLowerCase();
  if (!slug || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(clean)) {
    return NextResponse.json({ error: 'Domaine invalide' }, { status: 400 });
  }

  const { data: site } = await supabaseAdmin
    .from('sites')
    .select('id, owner_email')
    .eq('slug', slug)
    .maybeSingle();
  if (!site || (!isOperator && site.owner_email !== userEmail)) {
    return NextResponse.json({ error: 'Site introuvable' }, { status: 403 });
  }

  // Le domaine doit reellement etre dans le compte Porkbun, sinon l'ecriture
  // DNS partirait dans le vide et le marchand croirait son site en ligne.
  let owned: { domain: string }[];
  try {
    owned = await listAllDomains();
  } catch (e: any) {
    return NextResponse.json({ error: 'Porkbun injoignable' }, { status: 502 });
  }
  if (!owned.some((d) => d.domain.toLowerCase() === clean)) {
    return NextResponse.json(
      { error: 'Ce domaine n\'est pas dans le compte Porkbun Nexiora' },
      { status: 422 }
    );
  }

  // Reprise si la ligne existe deja (rejeu apres echec), sinon creation.
  const { data: existing } = await supabaseAdmin
    .from('site_domains')
    .select('id, site_id, status')
    .eq('domain', clean)
    .maybeSingle();

  let domainId: string;
  if (existing) {
    if (existing.site_id !== site.id) {
      return NextResponse.json({ error: 'Ce domaine est deja rattache a un autre site' }, { status: 409 });
    }
    domainId = existing.id;
    // Voir provision.ts : 'dns_configured' est intermediaire, pas termine.
    if (existing.status === 'sitemap_submitted') {
      return NextResponse.json({ ok: true, status: existing.status, alreadyDone: true });
    }
  } else {
    const { data: row, error: insErr } = await supabaseAdmin
      .from('site_domains')
      .insert({
        site_id: site.id,
        domain: clean,
        status: 'purchased',
        purchased_at: new Date().toISOString(),
        price_cents: 0,
      })
      .select('id')
      .single();
    if (insErr || !row) {
      return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 500 });
    }
    domainId = row.id;
  }

  const result = await provisionDomain(domainId);
  if (!result.ok) {
    const { data: r } = await supabaseAdmin
      .from('site_domains')
      .select('last_error')
      .eq('id', domainId)
      .maybeSingle();
    return NextResponse.json(
      { error: r?.last_error || 'Provisioning echoue', status: result.status },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, domain: clean, status: result.status });
}
