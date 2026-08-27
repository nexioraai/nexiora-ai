import { NextRequest, NextResponse } from 'next/server'
import { requireSiteOwner } from '@/lib/auth/require-site-owner'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { addDomainToVercel } from '@/lib/domains/vercel'

function isValidDomain(d: string) {
  return /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(d)
}

export async function POST(req: NextRequest) {
  try {
    const { slug, domain } = await req.json()
    const clean = String(domain || '').trim().toLowerCase()

    if (!slug || !isValidDomain(clean)) {
      return NextResponse.json({ error: 'Domaine ou site invalide.' }, { status: 400 })
    }

    // ============================================================
    // DETTE 6a, EXTENSION -- `owner_email` N'EST PLUS L'IDENTITE.
    //
    // La garde s'ecrivait `site.owner_email !== user.email` : une comparaison
    // en JavaScript plutot qu'un `.eq()`, mais exactement la meme cle, et donc
    // exactement le meme defaut. `sites.owner_email` est ecrite UNE SEULE
    // FOIS, a la creation du site, et aucun update ne la touche jamais -- un
    // proprietaire qui change d'adresse laisse la colonne figee sur
    // l'ancienne, et quiconque obtient ensuite cette adresse devenait
    // proprietaire aux yeux de cette route.
    //
    // AUCUN MECANISME NOUVEAU : `requireSiteOwner`, primitive canonique --
    // `owner_id` prioritaire, repli sur `owner_email` UNIQUEMENT quand
    // `owner_id` est encore null cote base. Les codes deviennent ceux de la
    // primitive : 401 non authentifie, 404 site inexistant, 403 non
    // proprietaire (la route confondait les deux derniers dans un seul 403).
    // ============================================================
    const auth = await requireSiteOwner(req, slug, 'id, custom_domain')
    if (!auth.ok) return auth.response
    const site = auth.site as { id: string; custom_domain: string | null }

    // Un domaine ne peut pas etre rattache a deux sites.
    const { data: alreadyUsed } = await supabaseAdmin
      .from('sites')
      .select('id')
      .eq('custom_domain', clean)
      .neq('slug', slug)
      .maybeSingle()
    if (alreadyUsed) {
      return NextResponse.json({ error: 'Ce domaine est deja utilise.' }, { status: 409 })
    }

    // Audit Mode 3/POD BRAND, perfectionnement -- ce garde-fou verifiait
    // uniquement sites.custom_domain, jamais site_domains (domaines achetes
    // via Porkbun, deja payes ou en cours de provisioning). Sans ceci, un
    // domaine reserve/achete par un marchand pouvait etre revendique en BYOD
    // par un autre pendant la fenetre pending/paid/purchased -- les deux
    // mecanismes ne se recoupaient jamais.
    const { data: reserved } = await supabaseAdmin
      .from('site_domains')
      .select('id, status')
      .eq('domain', clean)
      .maybeSingle()
    if (reserved && reserved.status !== 'failed') {
      return NextResponse.json({ error: 'Ce domaine est deja reserve.' }, { status: 409 })
    }

    try {
      await addDomainToVercel(clean)
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || 'Erreur Vercel.' },
        { status: 400 }
      )
    }

    // Reinitialise l'etat Google BYOD uniquement si le domaine change
    // reellement (jamais sur une resoumission du meme domaine, pour ne pas
    // perdre un jeton ou une verification Google deja en cours).
    const isDomainChange = !!site.custom_domain && site.custom_domain !== clean
    const updatePayload = isDomainChange
      ? {
          custom_domain: clean,
          custom_domain_google_status: null,
          custom_domain_google_token: null,
          custom_domain_google_attempts: null,
          custom_domain_google_last_attempt_at: null,
          custom_domain_google_last_error: null,
        }
      : { custom_domain: clean }

    const { error: dbError } = await supabaseAdmin
      .from('sites')
      .update(updatePayload)
      .eq('slug', slug)

    if (dbError) {
      // Audit Mode 3/POD BRAND, perfectionnement -- filet de securite pour la
      // course residuelle (deux BYOD concurrents sur le meme domaine, deux
      // sites differents) : le check-then-set ci-dessus reste non
      // transactionnel, la contrainte UNIQUE partielle sur sites.custom_domain
      // (voir supabase/sql/domains_unique_constraints.sql) est la garantie
      // reelle -- ce code la traduit en message clair plutot qu'un 500 opaque.
      if ((dbError as any).code === '23505') {
        return NextResponse.json({ error: 'Ce domaine est deja utilise.' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Erreur base de données.' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      domain: clean,
      dns: [
        { type: 'A', name: '@', value: '76.76.21.21' },
        { type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com' },
      ],
    })
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
}
