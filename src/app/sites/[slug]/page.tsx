// src/app/sites/[slug]/page.tsx
import { notFound } from 'next/navigation'
import { fetchSite } from './themes/shared'
import EditorialTheme from './themes/EditorialTheme'
import BoldTheme from './themes/BoldTheme'
import MonochromeTheme from './themes/MonochromeTheme'

const themes = {
  editorial: EditorialTheme,
  bold: BoldTheme,
  monochrome: MonochromeTheme,
} as const

type Props = { params: Promise<{ slug: string }> }

export default async function SitePage({ params }: Props) {
  const { slug } = await params
  const site = await fetchSite(slug)
  if (!site) notFound()

  const key = (site.theme as keyof typeof themes) || 'editorial'
  const Theme = themes[key] ?? EditorialTheme

  return <Theme site={site} />
}
