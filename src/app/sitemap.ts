// src/app/sitemap.ts
import type { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.woorri.com'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ]

  const { data, error } = await supabase
    .from('sites')
    .select('slug, created_at')
    .eq('published', true)

  if (error || !data) {
    return staticRoutes
  }

  const siteRoutes: MetadataRoute.Sitemap = data.map((s) => ({
    url: `${SITE_URL}/sites/${s.slug}`,
    lastModified: s.created_at ? new Date(s.created_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  const { data: posts } = await supabase
    .from('blog_posts')
    .select('slug, created_at')
    .eq('published', true)

  const blogRoutes: MetadataRoute.Sitemap = (posts ?? []).map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: p.created_at ? new Date(p.created_at) : new Date(),
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  const { data: shopProducts } = await supabase
    .from('shop_products')
    .select('id, created_at, sites!inner(slug, published)')
    .eq('published', true)
    .eq('sites.published', true)
  const shopProductRoutes: MetadataRoute.Sitemap = (shopProducts ?? []).map((p: any) => ({
    url: SITE_URL + '/sites/' + p.sites.slug + '/produits/' + encodeURIComponent(p.id),
    lastModified: p.created_at ? new Date(p.created_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const { data: catalogSels } = await supabase
    .from('site_catalog_selections')
    .select('catalog_product_id, sites!inner(slug, published)')
    .eq('merchant_approved', true)
    .eq('sites.published', true)
  const catalogProductRoutes: MetadataRoute.Sitemap = (catalogSels ?? []).map((c: any) => ({
    url: SITE_URL + '/sites/' + c.sites.slug + '/produits/' + encodeURIComponent('catalog-' + c.catalog_product_id),
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  return [...staticRoutes, ...siteRoutes, ...blogRoutes, ...shopProductRoutes, ...catalogProductRoutes]
}
