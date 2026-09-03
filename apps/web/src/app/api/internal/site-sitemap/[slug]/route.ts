// src/app/api/internal/site-sitemap/[slug]/route.ts
//
// Genere le sitemap XML d'un site marchand. Deliberement place hors de
// l'arborescence src/app/sites/[slug]/ (qui contient un catch-all
// [...rest]/page.tsx) et loin de tout nom reserve par les conventions de
// metadonnees de Next.js (sitemap.ts / sitemap.xml / robots.txt) : un
// dossier "sitemap.xml" imbrique sous un segment dynamique avec un
// catch-all frere provoquait un 404/500 en production Vercel (jamais
// reproduit en local avec next start, code identique) — comportement
// documente comme un probleme connu du pipeline de routage des fichiers
// de metadonnees de Next.js 15/16 sur Vercel, pas un bug de la logique
// applicative elle-meme (verifiee correcte dans les deux cas).
//
// L'URL publique /sitemap.xml (chemin plateforme ou domaine personnalise)
// est reecrite vers cette route par src/proxy.ts — jamais exposee
// directement sous ce chemin interne.
//
// fetchSite() ne renvoie que des produits deja filtres (shop_products
// published=true, site_catalog_selections merchant_approved=true — voir
// ../../../../sites/[slug]/themes/shared.tsx) : rien de prive, rien de
// supprime, rien qui 404 n'est jamais inclus ici. Le site n'a qu'une
// seule page publique routable (les sections de "site.pages" sont des
// ancres sur la meme page, pas des URLs distinctes) — seuls les produits
// ont leur propre route.
import { fetchSite, resolveSiteBaseUrl } from '@/app/sites/[slug]/themes/shared'
import { resolveSiteFreshness } from '@/app/sites/[slug]/themes/siteFreshness'
import { fetchBlogEntries } from '@/app/sites/[slug]/blog/fetchPosts'
import { logAnomaly } from '@/lib/anomaly'

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

// DETTE 3 -- `logAnomaly` est appele ICI, jamais dans `shared.tsx`.
// Ce dernier est bi-environnement (quatre composants 'use client'
// l'importent) et `anomaly.ts -> supabase-admin.ts -> server-only` fait
// echouer le build s'il y entre -- mesure, pas suppose. Le signal remonte
// donc par un tableau `diagnostics`, et seuls les appelants SERVEUR
// journalisent.
  const diagnostics: string[] = []
  const site = await fetchSite(slug, false, diagnostics)

  if (!site) {
    return new Response('Not found', { status: 404 })
  }
  if (diagnostics.length > 0) {
    await logAnomaly({
      type: 'storefront_query_failed',
      severity: 'warning',
      siteId: (site as { id?: string }).id ?? null,
      slug,
      details: { surface: 'site-sitemap', failures: diagnostics },
    })
  }

  // Meme domaine que celui reellement utilise pour servir la requete —
  // jamais NEXT_PUBLIC_SITE_URL aveuglement (voir resolveSiteBaseUrl).
  // Le Host original est preserve par NextResponse.rewrite() dans
  // proxy.ts, meme si le chemin interne a change.
  const base = resolveSiteBaseUrl(site, req.headers.get('host'))
  // DEBT-034 -- `<lastmod>` suivait `created_at`, ce qui contredisait
  // frontalement le `changefreq: daily` annonce juste en dessous.
  const fraicheur = resolveSiteFreshness(site)
  const lastmod = fraicheur ? new Date(fraicheur).toISOString() : new Date().toISOString()

  const urls: { loc: string; lastmod: string; changefreq: string; priority: string }[] = [
    { loc: base, lastmod, changefreq: 'daily', priority: '1.0' },
  ]

  // ============================================================
  // LOT BLOG 8 -- LE BLOG ENTRE DANS LE SITEMAP DU SITE.
  //
  // MEME SOURCE QUE LA PAGE PUBLIQUE : la vue `site_blog_posts_public`. Le
  // sitemap ne peut donc pas annoncer une URL que la page refuserait de
  // servir -- un brouillon, un article d'un site archive. C'est le defaut
  // ferme au LOT 2 du chantier catalogue (« le sitemap publiait ce que la
  // vitrine refuse d'afficher »), qu'on ne rouvre pas ici.
  //
  // `<lastmod>` SUIT `updated_at`, jamais `created_at` : c'est la lecon
  // DEBT-034, ou un lastmod fige contredisait le `changefreq` annonce.
  //
  // L'INDEX N'EST ANNONCE QUE S'IL A DU CONTENU. Une page de blog vide
  // declaree aux moteurs est une promesse que le site ne tient pas.
  const articles = await fetchBlogEntries((site as { id: string }).id)
  if (articles.length > 0) {
    urls.push({ loc: `${base}/blog`, lastmod, changefreq: 'weekly', priority: '0.6' })
    for (const a of articles) {
      urls.push({
        loc: `${base}/blog/${encodeURIComponent(a.slug)}`,
        lastmod: a.updated_at ? new Date(a.updated_at).toISOString() : lastmod,
        changefreq: 'monthly',
        priority: '0.6',
      })
    }
  }

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
