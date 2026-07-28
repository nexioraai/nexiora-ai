// src/app/sites/[slug]/llms.txt/route.ts
import { fetchSite } from '../themes/shared'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nexiora-ai.vercel.app'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const site = await fetchSite(slug)

  if (!site) {
    return new Response('Not found', { status: 404 })
  }

  const url = SITE_URL + '/sites/' + site.slug
  const lines: string[] = []

  lines.push('# ' + site.name)
  lines.push('')

  const summary = site.slogan ?? site.hero_subtitle
  if (summary) {
    lines.push('> ' + summary)
    lines.push('')
  }

  if (site.about) {
    lines.push('## À propos')
    lines.push(site.about)
    lines.push('')
  }

  if (Array.isArray(site.services) && site.services.length > 0) {
    lines.push('## Services')
    for (const s of site.services) {
      const label = s?.title ?? s?.name
      if (label) lines.push('- ' + label)
    }
    lines.push('')
  }

  if (Array.isArray(site.products) && site.products.length > 0) {
    lines.push('## Produits')
    for (const p of site.products) {
      if (p?.name) lines.push('- ' + p.name)
    }
    lines.push('')
  }

  // Mission / Vision
  if (site.mission) {
    lines.push('## Notre mission')
    lines.push(site.mission)
    lines.push('')
  }
  if (site.vision) {
    lines.push('## Notre vision')
    lines.push(site.vision)
    lines.push('')
  }

  // Pourquoi nous
  if (Array.isArray(site.whyus) && site.whyus.length > 0) {
    lines.push('## Pourquoi nous choisir')
    for (const w of site.whyus) {
      if (w?.title) {
        lines.push('### ' + w.title)
        if (w?.text) lines.push(w.text)
        lines.push('')
      }
    }
  }

  // Questions fréquentes
  if (Array.isArray(site.faq) && site.faq.length > 0) {
    lines.push('## Questions fréquentes')
    for (const f of site.faq) {
      if (f?.question) {
        lines.push('### ' + f.question)
        if (f?.answer) lines.push(f.answer)
        lines.push('')
      }
    }
  }

  // Zone desservie
  if (site.area_served) {
    lines.push('## Zone desservie')
    lines.push(site.area_served)
    lines.push('')
  }

  const phone = site.contact?.phone
  const email = site.contact?.email
  const address = site.contact?.address
  if (phone || email || address) {
    lines.push('## Contact')
    if (phone) lines.push('- Téléphone : ' + phone)
    if (email) lines.push('- Email : ' + email)
    if (address) lines.push('- Adresse : ' + address)
    lines.push('')
  }

  lines.push('## Site web')
  lines.push(url)
  lines.push('')
  lines.push('---')
  if (site.created_at) {
    lines.push('Dernière mise à jour : ' + new Date(site.created_at).toISOString().split('T')[0])
  }
  lines.push('Site généré et hébergé par Woorri — ' + SITE_URL)
  lines.push('')

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
