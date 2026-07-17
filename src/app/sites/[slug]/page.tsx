// src/app/sites/[slug]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchSite } from './themes/shared'
import JsonLd from './themes/JsonLd'
import EditorialTheme from './themes/EditorialTheme'
import NoirTheme from './themes/NoirTheme'
import VifTheme from './themes/VifTheme'
import CartShell from './themes/CartShell'
import { getCartLabels } from './themes/cartLabels'
import ScrollRevealInit from './themes/ScrollRevealInit'
import CatalogSearch from './themes/CatalogSearch'
import PromoBanner from './themes/PromoBanner'

export const dynamic = 'force-dynamic'

const themes = {
  editorial: EditorialTheme,
  noir: NoirTheme,
  vif: VifTheme,
} as const

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nexiora-ai.vercel.app'

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

  const url = `${SITE_URL}/sites/${site.slug}`
  const images = site.hero_image ? [{ url: site.hero_image }] : undefined

  return {
    title,
    description,
    alternates: { canonical: url },
    other: { llms: `${url}/llms.txt` },
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

  const key = (site.theme as keyof typeof themes) || 'editorial'
  const Theme = themes[key] ?? EditorialTheme

  const primary = site.primary_color || '#111111'
  const cartLabels = getCartLabels(site.lang)

  return (
    <>
      <JsonLd site={site} />
      <PromoBanner slug={site.slug} primary={primary} />
      <CartShell primary={primary} labels={cartLabels} slug={site.slug} mode={site.mode} shippingFlat={site.shipping_flat}>
        <Theme site={site} />
        {site.mode === 3 && site.dropship_type !== 'pod_brand' && <CatalogSearch slug={site.slug} primary={primary} lang={site.lang} dropshipType={site.dropship_type || 'reseller'} />}
      </CartShell>
      <ScrollRevealInit />
    </>
  )
}
