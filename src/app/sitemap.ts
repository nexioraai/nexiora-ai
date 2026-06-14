// src/app/sitemap.ts
import type { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nexiora-ai.vercel.app'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
  ]

  const { data, error } = await supabase
    .from('sites')
    .select('slug, created_at')

  if (error || !data) {
    return staticRoutes
  }

  const siteRoutes: MetadataRoute.Sitemap = data.map((s) => ({
    url: `${SITE_URL}/sites/${s.slug}`,
    lastModified: s.created_at ? new Date(s.created_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  return [...staticRoutes, ...siteRoutes]
}
