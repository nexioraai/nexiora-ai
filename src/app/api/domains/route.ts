import { NextRequest, NextResponse } from 'next/server'
import { supabase as supabaseAnon } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { addDomainToVercel } from '@/lib/domains/vercel'

function isValidDomain(d: string) {
  return /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(d)
}

export async function POST(req: NextRequest) {
  try {
    // Sans authentification, n'importe qui pouvait rattacher n'importe quel
    // domaine a n'importe quel site.
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non authentifie.' }, { status: 401 })
    const { data: { user }, error: authErr } = await supabaseAnon.auth.getUser(token)
    if (authErr || !user?.email) {
      return NextResponse.json({ error: 'Non authentifie.' }, { status: 401 })
    }

    const { slug, domain } = await req.json()
    const clean = String(domain || '').trim().toLowerCase()

    if (!slug || !isValidDomain(clean)) {
      return NextResponse.json({ error: 'Domaine ou site invalide.' }, { status: 400 })
    }

    // Le site doit appartenir a l'utilisateur authentifie.
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id, owner_email, custom_domain')
      .eq('slug', slug)
      .maybeSingle()
    if (!site || site.owner_email !== user.email) {
      return NextResponse.json({ error: 'Site introuvable.' }, { status: 403 })
    }

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
