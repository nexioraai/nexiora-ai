// src/app/sites/[slug]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchSite } from './themes/shared'
import JsonLd from './themes/JsonLd'
import EditorialTheme from './themes/EditorialTheme'
import BoldTheme from './themes/BoldTheme'
import MonochromeTheme from './themes/MonochromeTheme'

const themes = {
  editorial: EditorialTheme,
  bold: BoldTheme,
  monochrome: MonochromeTheme,
} as const

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nexiora-ai.vercel.app'

type Props = { params: Promise<{ slug: string }> }

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

export default async function SitePage({ params }: Props) {
  const { slug } = await params
  const site = await fetchSite(slug)
  if (!site) notFound()

  const key = (site.theme as keyof typeof themes) || 'editorial'
  const Theme = themes[key] ?? EditorialTheme

  return (
    <>
      <JsonLd site={site} />
      <Theme site={site} />
    </>
  )
}
