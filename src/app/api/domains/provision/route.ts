import { NextRequest, NextResponse } from 'next/server';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';
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

  const { slug, domain } = await req.json().catch(() => ({}));
  const clean = String(domain || '').trim().toLowerCase();
  if (!slug || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(clean)) {
    return NextResponse.json({ error: 'Domaine invalide' }, { status: 400 });
  }

  // ============================================================
  // DETTE 6a, EXTENSION -- `owner_email` N'EST PLUS L'IDENTITE.
  //
  // La garde s'ecrivait `site.owner_email !== userEmail` : une comparaison en
  // JavaScript plutot qu'un `.eq()`, mais exactement la meme cle, donc
  // exactement le meme defaut. `sites.owner_email` est ecrite UNE SEULE FOIS,
  // a la creation du site, et aucun update ne la touche jamais -- un
  // proprietaire qui change d'adresse laisse la colonne figee sur l'ancienne,
  // et quiconque obtient ensuite cette adresse devenait proprietaire aux yeux
  // de cette route, qui provisionne un domaine REEL (DNS, Vercel, Google).
  //
  // LA VOIE OPERATEUR EST PRESERVEE TELLE QUELLE. `CRON_SECRET` n'est pas une
  // identite d'utilisateur : aucune primitive de propriete ne s'y applique, et
  // lui en imposer une casserait la reprise manuelle. Les deux voies restent
  // donc distinctes -- l'operateur resout le site sans controle de propriete
  // (c'est le sens de ce secret), le marchand passe par la primitive
  // canonique. Aucune regle de propriete n'est reecrite ici.
  // ============================================================
  let site: { id: string };
  if (isOperator) {
    const { data } = await supabaseAdmin
      .from('sites')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: 'Site introuvable' }, { status: 404 });
    site = data as { id: string };
  } else {
    const auth = await requireSiteOwner(req, slug, 'id');
    if (!auth.ok) return auth.response;
    site = auth.site as { id: string };
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
