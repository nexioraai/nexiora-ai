// src/app/sites/[slug]/page.tsx
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { fetchSite, resolveSiteBaseUrl } from './themes/shared'
import JsonLd from './themes/JsonLd'
import HtmlLang from './themes/HtmlLang'
import EditorialTheme from './themes/EditorialTheme'
import NoirTheme from './themes/NoirTheme'
import VifTheme from './themes/VifTheme'
import AuroraTheme from './themes/AuroraTheme'
import CartShell from './themes/CartShell'
import { getCartLabels } from './themes/cartLabels'
import ScrollRevealInit from './themes/ScrollRevealInit'
import CatalogSearch, { type ThemeKey } from './themes/CatalogSearch'
import PromoBanner from './themes/PromoBanner'

export const revalidate = 60

const themes = {
  editorial: EditorialTheme,
  noir: NoirTheme,
  vif: VifTheme,
  aurora: AuroraTheme,
} as const

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ [key: string]: string | undefined }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const site = await fetchSite(slug)

  if (!site) {
    return { title: 'Site introuvable' }
  }

  const title = site.slogan ? `${site.name} — ${site.slogan}` : site.name

  const rawDesc =
    site.hero_subtitle ?? site.about ?? site.slogan ?? `${site.name} — site officiel`
  const description =
    rawDesc.length > 160 ? rawDesc.slice(0, 157).trimEnd() + '…' : rawDesc

  const host = (await headers()).get('host')
  const url = resolveSiteBaseUrl(site, host)
  const images = site.hero_image ? [{ url: site.hero_image }] : undefined

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: site.name,
      images,
      type: 'website',
      locale: 'fr_FR',
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title,
      description,
      images: site.hero_image ? [site.hero_image] : undefined,
    },
  }
}

export default async function SitePage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams
  const site = await fetchSite(slug, sp.paid === '1')
  if (!site) notFound()

  const host = (await headers()).get('host')
  const url = resolveSiteBaseUrl(site, host)

  const key = (site.theme as keyof typeof themes) || 'editorial'
  const Theme = themes[key] ?? EditorialTheme

  const primary = site.primary_color || '#111111'
  const cartLabels = getCartLabels(site.lang)

  return (
    <>
      <HtmlLang lang={site.lang} />
      <JsonLd site={site} url={url} />
      <PromoBanner slug={site.slug} primary={primary} />
      <CartShell primary={primary} labels={cartLabels} slug={site.slug} mode={site.mode} products={site.products} shippingFlat={site.shipping_flat} variant={key === 'noir' ? 'dark' : 'light'}>
        <Theme site={site} />
        {site.mode === 3 && site.dropship_type !== 'pod_brand' && site.theme !== 'aurora' && <CatalogSearch slug={site.slug} primary={primary} lang={site.lang} theme={key as ThemeKey} dropshipType={site.dropship_type || 'reseller'} />}
      </CartShell>
      <ScrollRevealInit />
    </>
  )
}
