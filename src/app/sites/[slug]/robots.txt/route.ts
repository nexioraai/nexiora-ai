// src/app/sites/[slug]/robots.txt/route.ts
//
// Route litterale (memes conventions que ../llms.txt/route.ts) — sans elle,
// /robots.txt sur un domaine personnalise (rewrite src/proxy.ts) tombe dans
// le catch-all [...rest]/page.tsx qui appelle notFound(). Generique : ne
// connait aucun site en particulier, fonctionne pour n'importe quel slug.
import { fetchSite, resolveSiteBaseUrl } from '../themes/shared'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const site = await fetchSite(slug)

  if (!site) {
    return new Response('Not found', { status: 404 })
  }

  // Meme domaine que celui reellement utilise pour servir la requete
  // (custom_domain si accede via ce domaine, sinon www.woorri.com/sites/{slug})
  // — jamais NEXT_PUBLIC_SITE_URL aveuglement.
  const base = resolveSiteBaseUrl(site, req.headers.get('host'))

  const body = ['User-agent: *', 'Allow: /', '', `Sitemap: ${base}/sitemap.xml`, ''].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
