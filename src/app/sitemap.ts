// src/app/sitemap.ts
import type { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.deribfy.com'

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

  // LOT 1 : sites_public (published=true AND archived_at IS NULL déjà
  // appliqué par la vue -- corrige au passage l'absence de vérification
  // archived_at qui existait ici : un site archivé restait dans le sitemap).
  // `id` inclus en plus de `slug`/`created_at` : réutilisé plus bas pour
  // résoudre shop_products/site_catalog_selections sans dépendre d'un embed
  // PostgREST `sites!inner(...)` (voir commentaire plus bas).
  const { data, error } = await supabase
    .from('sites_public')
    .select('id, slug, created_at')

  if (error || !data) {
    return staticRoutes
  }

  const siteRoutes: MetadataRoute.Sitemap = data.map((s) => ({
    url: `${SITE_URL}/sites/${s.slug}`,
    lastModified: s.created_at ? new Date(s.created_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))
  const idToSlug = new Map(data.map((s: any) => [s.id, s.slug]))

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

  // LOT 1 : ces deux requêtes utilisaient un embed PostgREST
  // `sites!inner(slug, published)`, qui va chercher `sites` (la table de
  // base) en arrière-plan -- une fois la RLS resserrée (SELECT réservé au
  // propriétaire), cet embed échouerait silencieusement pour tout visiteur
  // anon/authenticated non-propriétaire : `!inner` exclut la ligne entière
  // dès que la jointure ne trouve rien de visible, faisant disparaître ces
  // routes du sitemap sans aucune erreur. Remplacé par une résolution via
  // `idToSlug` (déjà construit ci-dessus depuis sites_public), sans
  // dépendre du comportement d'embedding de PostgREST au travers d'une vue.
  const { data: shopProducts } = await supabase
    .from('shop_products')
    .select('id, created_at, site_id')
    .eq('published', true)
  const shopProductRoutes: MetadataRoute.Sitemap = (shopProducts ?? [])
    .filter((p: any) => idToSlug.has(p.site_id))
    .map((p: any) => ({
      url: SITE_URL + '/sites/' + idToSlug.get(p.site_id) + '/produits/' + encodeURIComponent(p.id),
      lastModified: p.created_at ? new Date(p.created_at) : new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    }))

  const { data: catalogSels } = await supabase
    .from('site_catalog_selections')
    .select('catalog_product_id, site_id')
    .eq('merchant_approved', true)
  const catalogProductRoutes: MetadataRoute.Sitemap = (catalogSels ?? [])
    .filter((c: any) => idToSlug.has(c.site_id))
    .map((c: any) => ({
      url: SITE_URL + '/sites/' + idToSlug.get(c.site_id) + '/produits/' + encodeURIComponent('catalog-' + c.catalog_product_id),
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    }))

  return [...staticRoutes, ...siteRoutes, ...blogRoutes, ...shopProductRoutes, ...catalogProductRoutes]
}
