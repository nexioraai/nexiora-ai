// src/app/sites/[slug]/sitemap.xml/route.ts
//
// Route litterale (memes conventions que ../llms.txt/route.ts et
// ../robots.txt/route.ts) — sans elle, /sitemap.xml sur un domaine
// personnalise (rewrite src/proxy.ts) tombe dans le catch-all
// [...rest]/page.tsx qui appelle notFound(). Generique : ne connait aucun
// site en particulier, fonctionne pour n'importe quel slug.
//
// fetchSite() ne renvoie que des produits deja filtres (shop_products
// published=true, site_catalog_selections merchant_approved=true — voir
// themes/shared.tsx) : rien de prive, rien de supprime, rien qui 404 n'est
// jamais inclus ici. Le site n'a qu'une seule page publique routable (les
// sections de "site.pages" sont des ancres sur la meme page, pas des URLs
// distinctes) — seuls les produits ont leur propre route.
import { fetchSite, resolveSiteBaseUrl } from '../themes/shared'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
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

  // Meme domaine que celui reellement utilise pour servir la requete —
  // jamais NEXT_PUBLIC_SITE_URL aveuglement (voir resolveSiteBaseUrl).
  const base = resolveSiteBaseUrl(site, req.headers.get('host'))
  const lastmod = site.created_at ? new Date(site.created_at).toISOString() : new Date().toISOString()

  const urls: { loc: string; lastmod: string; changefreq: string; priority: string }[] = [
    { loc: base, lastmod, changefreq: 'daily', priority: '1.0' },
  ]

  for (const product of site.products ?? []) {
    if (!product.id) continue
    urls.push({
      loc: `${base}/produits/${encodeURIComponent(product.id)}`,
      lastmod,
      changefreq: 'weekly',
      priority: '0.7',
    })
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map(
        (u) =>
          `<url><loc>${escapeXml(u.loc)}</loc><lastmod>${u.lastmod}</lastmod>` +
          `<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
      )
      .join('\n') +
    '\n</urlset>'

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
