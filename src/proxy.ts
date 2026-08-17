import { NextRequest, NextResponse } from 'next/server'
import { fetchSiteByDomain } from './app/sites/[slug]/themes/shared'

const INTERNAL_HOSTS = ['nexiora.ca', 'www.nexiora.ca', 'woorri.com', 'www.woorri.com', 'deribfy.com', 'www.deribfy.com', 'localhost']

// Sitemap par site : reecrit vers une route interne hors de
// src/app/sites/[slug]/ (voir api/internal/site-sitemap pour le pourquoi
// — un dossier "sitemap.xml" imbrique sous [slug] avec un catch-all frere
// provoquait un 404/500 specifique a la production Vercel).
const PLATFORM_SITE_SITEMAP = /^\/sites\/([^/]+)\/sitemap\.xml$/

export async function proxy(req: NextRequest) {
  const host = (req.headers.get('host') || '').split(':')[0].toLowerCase()
  const pathname = req.nextUrl.pathname

  // Domaines internes ou Vercel → comportement normal, sauf le sitemap
  // d'un site precis (ex. www.deribfy.com/sites/{slug}/sitemap.xml)
  if (
    INTERNAL_HOSTS.includes(host) ||
    host.endsWith('.vercel.app') ||
    host.endsWith('.nexiora.ca') ||
    host.endsWith('.woorri.com') ||
    host.endsWith('.deribfy.com')
  ) {
    const platformMatch = pathname.match(PLATFORM_SITE_SITEMAP)
    if (platformMatch) {
      const url = req.nextUrl.clone()
      url.pathname = `/api/internal/site-sitemap/${platformMatch[1]}`
      return NextResponse.rewrite(url)
    }
    return NextResponse.next()
  }

  // Domaine perso d'un client → on cherche le site lié
  const slug = await fetchSiteByDomain(host)
  if (!slug) return NextResponse.next()

  // Sitemap du domaine personnalise (ex. mondomaine.com/sitemap.xml)
  if (pathname === '/sitemap.xml') {
    const url = req.nextUrl.clone()
    url.pathname = `/api/internal/site-sitemap/${slug}`
    return NextResponse.rewrite(url)
  }

  // Réécriture interne : le visiteur garde son domaine, on sert /sites/{slug}
  const url = req.nextUrl.clone()
  if (url.pathname === '/') {
    url.pathname = `/sites/${slug}`
    return NextResponse.rewrite(url)
  }
  url.pathname = `/sites/${slug}${url.pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
