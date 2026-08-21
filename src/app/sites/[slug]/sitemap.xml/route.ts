// src/app/sites/[slug]/sitemap.xml/route.ts
//
// Canari SEO -- audit correction routage : cette route n'existait pas du
// tout (seuls llms.txt et robots.txt avaient une route litterale sous
// /sites/[slug]/, jamais sitemap.xml -- cause racine du 404 sur
// /sites/{slug}/sitemap.xml, INDEPENDANTE du bug plus large affectant
// fetchSite() -- voir robots.txt/route.ts pour la meme convention).
//
// N'expose que des URLs (homepage + fiches produit publiees) -- aucune
// donnee sensible, memes garanties que fetchSite() (sites_public : deja
// filtre published=true AND archived_at IS NULL, colonnes limitees).
import { fetchSite, resolveSiteBaseUrl } from '../themes/shared'

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      default: return '&apos;'
    }
  })
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const site = await fetchSite(slug)

  if (!site) {
    return new Response('Not found', { status: 404 })
  }

  const base = resolveSiteBaseUrl(site, req.headers.get('host'))
  const now = new Date().toISOString()

  const urls: { loc: string; changefreq: string; priority: string }[] = [
    { loc: base, changefreq: 'weekly', priority: '0.8' },
  ]
  const products = Array.isArray((site as any).products) ? (site as any).products : []
  for (const p of products) {
    if (!p?.id) continue
    urls.push({
      loc: `${base}/produits/${encodeURIComponent(p.id)}`,
      changefreq: 'weekly',
      priority: '0.7',
    })
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (u) =>
        `  <url><loc>${escapeXml(u.loc)}</loc><lastmod>${now}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
    ),
    '</urlset>',
    '',
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
