import { NextRequest, NextResponse } from 'next/server'
import { fetchSiteByDomain } from './app/sites/[slug]/themes/shared'

const INTERNAL_HOSTS = ['nexiora.ca', 'www.nexiora.ca', 'woorri.com', 'www.woorri.com', 'deribfy.com', 'www.deribfy.com', 'localhost']

export async function proxy(req: NextRequest) {
  const host = (req.headers.get('host') || '').split(':')[0].toLowerCase()

  // Domaines internes ou Vercel → comportement normal
  if (
    INTERNAL_HOSTS.includes(host) ||
    host.endsWith('.vercel.app') ||
    host.endsWith('.nexiora.ca') ||
    host.endsWith('.woorri.com') ||
    host.endsWith('.deribfy.com')
  ) {
    return NextResponse.next()
  }

  // Domaine perso d'un client → on cherche le site lié
  const slug = await fetchSiteByDomain(host)
  if (!slug) return NextResponse.next()

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
