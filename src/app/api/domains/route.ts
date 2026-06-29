import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN!
const PROJECT_ID = process.env.VERCEL_PROJECT_ID!

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
