import { NextRequest, NextResponse } from 'next/server'
import { supabase as supabaseAnon } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'

const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN!
const PROJECT_ID = process.env.VERCEL_PROJECT_ID!

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
      .select('id, owner_email')
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

    const vercelRes = await fetch(
      `https://api.vercel.com/v10/projects/${PROJECT_ID}/domains`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${VERCEL_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: clean }),
      }
    )
    const vercelData = await vercelRes.json()

    if (!vercelRes.ok && vercelData?.error?.code !== 'domain_already_exists') {
      return NextResponse.json(
        { error: vercelData?.error?.message || 'Erreur Vercel.' },
        { status: 400 }
      )
    }

    const { error: dbError } = await supabaseAdmin
      .from('sites')
      .update({ custom_domain: clean })
      .eq('slug', slug)

    if (dbError) {
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
