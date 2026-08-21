import { supabase } from '@/lib/supabase'
import { sitePricing, resolveDisplayPrice } from '@/lib/pricing'

export type ProductPage = {
  id: string
  name: string
  description: string
  priceNumber: number
  currency: string
  images: string[]
  inStock: boolean
  siteName: string
  siteSlug: string
  siteCustomDomain: string | null
  primary: string
  theme: string
  lang: string
  mode: number
  shippingFlat: number | null
}

export async function fetchProduct(slug: string, rawId: string): Promise<ProductPage | null> {
  // LOT 1 : sites_public (published=true AND archived_at IS NULL déjà
  // appliqué par la vue -- corrige au passage l'absence de vérification
  // archived_at qui existait ici). `published` retiré du select : toujours
  // vrai par construction de la vue, jamais lu par le reste de la fonction.
  const { data: site } = await supabase
    .from('sites_public')
    .select('id, name, slug, mode, custom_domain, dropship_type, product_families, cj_margin_percent, cj_round_mode, primary_color, theme, lang, shipping_flat')
    .eq('slug', slug)
    .maybeSingle()
  if (!site) return null

  if (rawId.startsWith('catalog-')) {
    const catalogProductId = rawId.slice('catalog-'.length)
    const { data: sel } = await supabase
      .from('site_catalog_selections')
      .select('sell_price, custom_name, custom_description, catalog_product_id, catalog_products(name, description, price, currency, images, in_stock)')
      .eq('site_id', (site as any).id)
      .eq('catalog_product_id', catalogProductId)
      .eq('merchant_approved', true)
      .maybeSingle()
    if (!sel || !(sel as any).catalog_products) return null
    const cp = (sel as any).catalog_products
    const { margin, roundMode } = sitePricing(site as any)
    const cost = cp.price ? Number(cp.price) : 0
    const pr = resolveDisplayPrice(cost, (sel as any).sell_price, margin, roundMode)
    return {
      id: rawId,
      name: (sel as any).custom_name || cp.name,
      description: (sel as any).custom_description || cp.description || '',
      priceNumber: pr,
      currency: cp.currency || 'CAD',
      images: Array.isArray(cp.images) ? cp.images : [],
      inStock: cp.in_stock !== false,
      siteName: (site as any).name,
      siteSlug: (site as any).slug,
      siteCustomDomain: (site as any).custom_domain ?? null,
      primary: (site as any).primary_color || '#111111',
      theme: (site as any).theme || 'editorial',
      lang: (site as any).lang || 'fr',
      mode: (site as any).mode,
      shippingFlat: (site as any).shipping_flat ?? null,
    }
  }

  const { data: p } = await supabase
    .from('shop_products')
    .select('id, site_id, name, description, price, currency, images, stock, published')
    .eq('id', rawId)
    .eq('site_id', (site as any).id)
    .eq('published', true)
    .maybeSingle()
  if (!p) return null
  return {
    id: (p as any).id,
    name: (p as any).name,
    description: (p as any).description || '',
    priceNumber: (p as any).price != null ? Number((p as any).price) : 0,
    currency: (p as any).currency || 'CAD',
    images: Array.isArray((p as any).images) ? (p as any).images : [],
    inStock: ((p as any).stock ?? 0) > 0,
    siteName: (site as any).name,
    siteSlug: (site as any).slug,
    siteCustomDomain: (site as any).custom_domain ?? null,
    primary: (site as any).primary_color || '#111111',
    theme: (site as any).theme || 'editorial',
    lang: (site as any).lang || 'fr',
    mode: (site as any).mode,
    shippingFlat: (site as any).shipping_flat ?? null,
  }
}
