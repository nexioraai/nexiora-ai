// src/app/sites/[slug]/themes/shared.tsx

import { supabase } from '@/lib/supabase'
import { calcSellPrice, sitePricing, resolveDisplayPrice } from '@/lib/pricing'

import {
Wrench,
ShieldCheck,
Truck,
Headphones,
Sparkles,
Clock,
Award,
Zap,
Heart,
Package,
type LucideIcon,
} from 'lucide-react'

// ---------- Types ----------

export type Site = {
id: string
slug: string
name: string
slogan?: string
type?: string
mode?: number
custom_domain?: string | null
dropship_type?: string
primary_color?: string
hero_title?: string
hero_subtitle?: string
about?: string
services?: any[]
sections?: any[]
gallery?: string[]
testimonials?: any[]
products?: any[]
contact?: {
phone?: string
email?: string
address?: string
}
social_links?: {
instagram?: string
facebook?: string
whatsapp?: string
tiktok?: string
}
hero_image?: string
cta?: string
theme?: 'editorial' | 'noir' | 'vif' | string
lang?: string
faq?: { question: string; answer: string }[]
  whyus?: { title: string; text: string }[]
  mission?: string
  vision?: string
  geo_lat?: number
  geo_lng?: number
  area_served?: string
  price_range?: string
  pages?: { title: string; content: string }[]
  hidden_sections?: string[]
  section_label?: string
  created_at?: string
  pod_designs?: any[]
  product_families?: Record<string, string>
  cj_margin_percent?: number
  cj_round_mode?: string
  shipping_flat?: number
}

export type Product = {
id?: string
name: string
description: string
price: string
priceNumber?: number
currency?: string
image?: string
cjVid?: string | null
variants?: { variant_id: string; label: string; price: number; currency: string }[]
shippingDaysMin?: number | null
shippingDaysMax?: number | null
supplierId?: string | null
supplierProductId?: string | null
family?: string
}

export type Service = {
title: string
description: string
Icon: LucideIcon
image?: string
}

export type Testimonial = {
name: string
role: string
content: string
rating: number
}

// ---------- Supabase ----------

export const PUBLIC_COLS =
'id,slug,name,slogan,type,mode,custom_domain,primary_color,hero_title,hero_subtitle,about,services,testimonials,gallery,products,contact,menu,team,hours,social_links,address,pages,cta,theme,hero_image,lang,faq,whyus,mission,vision,geo_lat,geo_lng,area_served,price_range,hidden_sections,section_label,sections,created_at,dropship_type,pod_designs,product_families,cj_margin_percent,cj_round_mode,shipping_flat'

// ---------- Resolution d'URL multi-domaines ----------
//
// Domaine canonique de Woorri elle-meme (jamais celui d'un site client) —
// utilise uniquement comme repli quand un site n'a pas (ou n'est pas
// accede via) son propre custom_domain. Meme convention que
// src/app/sitemap.ts / robots.ts.
export const WOORRI_SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.woorri.com'

/**
 * Determine l'URL de base a utiliser pour le canonical/OG/JSON-LD/sitemap
 * d'un site genere, a partir du Host reel de la requete courante — jamais
 * de NEXT_PUBLIC_SITE_URL utilisee aveuglement pour un site client.
 *
 * - Si le Host de la requete correspond exactement au custom_domain du
 *   site (meme comparaison que fetchSiteByDomain/proxy.ts : host normalise
 *   en minuscules, sans port), la page est reellement servie sur ce
 *   domaine perso -> l'URL de base est ce domaine.
 * - Sinon (acces via www.woorri.com/sites/{slug}, ou site sans
 *   custom_domain) -> l'URL de base reste le chemin interne Woorri.
 *
 * Generique : ne connait ni YIA ni aucun site en particulier, uniquement
 * le champ custom_domain deja porte par n'importe quel site.
 */
export function resolveSiteBaseUrl(
  site: { slug: string; custom_domain?: string | null },
  host: string | null | undefined,
): string {
  const normalizedHost = (host || '').split(':')[0].toLowerCase()
  if (site.custom_domain && normalizedHost === site.custom_domain.toLowerCase()) {
    return `https://${site.custom_domain}`
  }
  return `${WOORRI_SITE_URL}/sites/${site.slug}`
}

export async function fetchSite(
slug: string,
allowUnpublished = false
): Promise<Site | null> {
let query = supabase
.from('sites')
.select(PUBLIC_COLS)
.eq('slug', slug)
if (!allowUnpublished) query = query.eq('published', true)
const { data, error } = await query.single()

if (error || !data) {
console.error(error)
return null
}

const { data: shopProducts } = await supabase
.from('shop_products')
.select('id,name,description,price,currency,images,cj_vid')
.eq('site_id', (data as any).id)
.eq('published', true)
.order('position', { ascending: true })

if (shopProducts && shopProducts.length > 0) {
;(data as any).products = shopProducts.map((p: any) => ({
id: p.id,
name: p.name,
description: p.description ?? '',
price: p.price != null ? `${Number(p.price).toFixed(2)} ${p.currency}` : '',
priceNumber: p.price != null ? Number(p.price) : undefined,
currency: p.currency,
image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : undefined,
cjVid: p.cj_vid || null,
}))
}

await loadCatalogSelections(data as any)

return data as Site
}





async function loadCatalogSelections(data: any) {
if (data.mode === 3 && (data.dropship_type === 'reseller' || data.dropship_type === 'pod_custom')) {
const { data: catSels } = await supabase
.from('site_catalog_selections')
.select('id, sell_price, custom_name, custom_description, catalog_product_id, catalog_products(name, description, price, currency, images, supplier_id, supplier_product_id, shipping_days_min, shipping_days_max, in_stock, category)')
.eq('site_id', data.id)
.eq('merchant_approved', true)
.order('sort_order', { ascending: true })
if (catSels && catSels.length > 0) {
const { margin, roundMode } = sitePricing(data);
const catalogProducts = catSels
// Meme regle que la recherche : un produit epuise chez le fournisseur
// n'est pas affiche. supplier-watch tient in_stock a jour.
.filter((s: any) => s.catalog_products && s.catalog_products.in_stock !== false)
.map((s: any) => {
const cp = s.catalog_products
const costPrice = cp.price ? Number(cp.price) : 0;
const pr = resolveDisplayPrice(costPrice, s.sell_price, margin, roundMode);
const cur = cp.currency || 'CAD'
return {
id: `catalog-${s.catalog_product_id}`,
name: s.custom_name || cp.name,
description: s.custom_description || cp.description || '',
price: pr > 0 ? `${pr.toFixed(2)} ${cur}` : '',
priceNumber: pr,
currency: cur,
image: Array.isArray(cp.images) && cp.images.length > 0 ? cp.images[0] : undefined,
shippingDaysMin: cp.shipping_days_min || null,
shippingDaysMax: cp.shipping_days_max || null,
supplierId: cp.supplier_id || null,
supplierProductId: cp.supplier_product_id || null,
family: ((data.product_families || {}) as Record<string,string>)[cp.category] || undefined,
}
})
const existing = data.products || []
data.products = [...catalogProducts, ...existing]
}
}
}

export async function fetchSiteByDomain(
domain: string
): Promise<string | null> {
const { data, error } = await supabase
.from('sites')
.select('slug')
.eq('custom_domain', domain)
.eq('published', true)
.single()
if (error || !data) return null
return (data as any).slug as string
}

export type SiteBrand = {
  slug: string
  name: string
  primaryColor: string | null
  theme: string | null
  lang: string | null
}

/**
 * Recupere le strict minimum pour brander une page d'erreur.
 * Ne renvoie jamais d'info sensible (pas d'email, pas d'id).
 */
export async function fetchSiteBrandByDomain(
  domain: string
): Promise<SiteBrand | null> {
  const { data, error } = await supabase
    .from('sites')
    .select('slug,name,primary_color,theme,lang')
    .eq('custom_domain', domain)
    .eq('published', true)
    .maybeSingle()
  if (error || !data) return null
  const d = data as any
  return {
    slug: d.slug,
    name: d.name,
    primaryColor: d.primary_color || null,
    theme: d.theme || null,
    lang: d.lang || null,
  }
}

export async function fetchSitePreview(
slug: string,
ownerEmail: string
): Promise<Site | null> {
const { data, error } = await supabase
.from('sites')
.select(PUBLIC_COLS + ',owner_email')
.eq('slug', slug)
.eq('owner_email', ownerEmail)
.maybeSingle()
if (error || !data) {
return null
}
const { data: shopProducts } = await supabase
.from('shop_products')
.select('id,name,description,price,currency,images,cj_vid')
.eq('site_id', (data as any).id)
.eq('published', true)
.order('position', { ascending: true })
if (shopProducts && shopProducts.length > 0) {
;(data as any).products = shopProducts.map((p: any) => ({
id: p.id,
name: p.name,
description: p.description ?? '',
price: p.price != null ? `${Number(p.price).toFixed(2)} ${p.currency}` : '',
priceNumber: p.price != null ? Number(p.price) : undefined,
currency: p.currency,
image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : undefined,
cjVid: p.cj_vid || null,
}))
}
await loadCatalogSelections(data as any)

return data as unknown as Site
}

// ---------- Icons ----------

export const SERVICE_ICONS: LucideIcon[] = [
Wrench,
ShieldCheck,
Truck,
Headphones,
Sparkles,
Clock,
Award,
Zap,
Heart,
Package,
]

// ---------- Normalizers ----------

export function normalizeService(
raw: any,
index: number
): Service {
if (typeof raw === 'string') {
return {
title: raw,
description:
'Service professionnel adapté à vos besoins.',
Icon:
SERVICE_ICONS[
index % SERVICE_ICONS.length
],
}
}

return {
title:
raw?.title ??
raw?.name ??
'Service',

description:
raw?.description ??
'Service professionnel adapté à vos besoins.',

Icon:
SERVICE_ICONS[
index % SERVICE_ICONS.length
],
}
}

export function normalizeTestimonial(
raw: any
): Testimonial {
return {
name: raw?.name ?? 'Client',

role:
raw?.role ??
raw?.company ??
'',

content:
raw?.content ??
raw?.text ??
raw?.message ??
'',

rating: Number(
raw?.rating ?? 5
),
}
}

export function normalizeProduct(
raw: any
): Product {
return {
id: raw?.id,
priceNumber: raw?.priceNumber ?? (typeof raw?.price === 'string' ? parseFloat(raw.price.replace(/[^0-9.]/g, '')) || 0 : raw?.price ?? 0),
currency: raw?.currency,
name:
raw?.name ??
raw?.title ??
'Produit',

description:
raw?.description ?? '',

price:
raw?.price ?? '',

image:
raw?.image ??
raw?.image_url ??
undefined,
cjVid: raw?.cjVid || null,
shippingDaysMin: raw?.shippingDaysMin || null,
shippingDaysMax: raw?.shippingDaysMax || null,
supplierId: raw?.supplierId || null,
supplierProductId: raw?.supplierProductId || null,
family: raw?.family || undefined,
}
}


// ---------- POD mockups → Products ----------
export function mockupsToProducts(site: Site): Product[] {
  if (site.dropship_type !== "pod_brand" || !site.pod_designs?.length) return []
  const designs = site.pod_designs
  const products: Product[] = []
  // Prix unifie : le cout Printful (m.price / v.price) passe par la meme formule
  // marge que le catalogue reseller. Le marchand fixe son %, le prix se calcule.
  const { margin, roundMode } = sitePricing(site)
  for (const design of designs) {
    if (!design.mockups?.length) continue
    for (const m of design.mockups) {
      if (m.design_url && design.url && m.design_url !== design.url) continue
      const selProducts = design.selected_products || {}
      const sel = selProducts[String(m.product_id)]
      const cost = m.price ? Number(m.price) : 0
      const pr = resolveDisplayPrice(cost, undefined, margin, roundMode)
      const cur = m.currency || "CAD"
      const variants = sel?.variants || []
      products.push({
        id: `catalog-${m.catalog_product_id}::${m.variant_id}`,
        name: m.product_name?.replace(/\s*—\s*.+$/, "") || "Produit",
        description: "",
        price: pr > 0 ? `${pr.toFixed(2)} ${cur}` : "",
        priceNumber: pr,
        currency: cur,
        image: m.mockup_url,
        shippingDaysMin: m.shipping_days_min || null,
        shippingDaysMax: m.shipping_days_max || null,
        variants: variants.map((v: any) => ({
          variant_id: v.variant_id,
          label: v.label,
          price: resolveDisplayPrice(v.price ? Number(v.price) : cost, undefined, margin, roundMode),
          currency: v.currency || cur,
        })),
      })
    }
  }
  return products
}

// Carte OSM partagee par tous les themes (synchro adresse via geo_lat/geo_lng)
export function ContactMap({
  lat,
  lng,
  className = '',
  accent = '#6366f1',
}: {
  lat?: number | null
  lng?: number | null
  className?: string
  accent?: string
  dark?: boolean
}) {
  if (lat == null || lng == null) return null
  const D = 0.0035
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - D},${lat - D},${lng + D},${lat + D}&layer=mapnik&marker=${lat},${lng}`
  return (
    <div
      className={`rounded-2xl overflow-hidden ${className}`}
      style={{ border: `1px solid ${accent}33` }}
    >
      <iframe
        title="Map"
        width="100%"
        height="260"
        style={{ border: 0, display: 'block' }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        src={src}
      />
    </div>
  )
}
