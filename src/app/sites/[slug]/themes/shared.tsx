// src/app/sites/[slug]/themes/shared.tsx

import { supabase } from '@/lib/supabase'

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
'id,slug,name,slogan,type,mode,primary_color,hero_title,hero_subtitle,about,services,testimonials,gallery,products,contact,menu,team,hours,social_links,address,pages,cta,theme,hero_image,lang,faq,whyus,mission,vision,geo_lat,geo_lng,area_served,price_range,hidden_sections,section_label,sections,created_at,dropship_type,pod_designs,cj_margin_percent,cj_round_mode,shipping_flat'

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

function apply99(price: number, mode: string): number {
  const floorInt = Math.floor(price);
  const lower = floorInt - 1 + 0.99;
  const upper = floorInt + 0.99;
  if (mode === 'up') return upper;
  if (mode === 'down') return lower < 0 ? upper : lower;
  return price;
}

function calcSellPrice(costPrice: number, marginPercent: number, roundMode: string): number {
  const marked = Math.round(costPrice * (1 + marginPercent / 100) * 100) / 100;
  return apply99(marked, roundMode);
}

async function loadCatalogSelections(data: any) {
if (data.mode === 3 && (data.dropship_type === 'reseller' || data.dropship_type === 'pod_custom')) {
const { data: catSels } = await supabase
.from('site_catalog_selections')
.select('id, sell_price, custom_name, custom_description, catalog_product_id, catalog_products(name, description, price, currency, images, supplier_id, supplier_product_id, shipping_days_min, shipping_days_max)')
.eq('site_id', data.id)
.eq('merchant_approved', true)
.order('sort_order', { ascending: true })
if (catSels && catSels.length > 0) {
const margin = data.cj_margin_percent ?? 100;
const roundMode = data.cj_round_mode || 'off';
const catalogProducts = catSels.map((s: any) => {
const cp = s.catalog_products
const costPrice = cp.price ? Number(cp.price) : 0;
const pr = costPrice > 0 ? calcSellPrice(costPrice, margin, roundMode) : (s.sell_price ? Number(s.sell_price) : 0);
const cur = cp.currency || 'CAD'
return {
id: `catalog-${cp.supplier_id}-${cp.supplier_product_id}`,
name: s.custom_name || cp.name,
description: s.custom_description || cp.description || '',
price: pr > 0 ? `${pr.toFixed(2)} ${cur}` : '',
priceNumber: pr,
currency: cur,
image: Array.isArray(cp.images) && cp.images.length > 0 ? cp.images[0] : undefined,
shippingDaysMin: cp.shipping_days_min || null,
shippingDaysMax: cp.shipping_days_max || null,
supplierId: cp.supplier_id || null,
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
}
}


// ---------- POD mockups → Products ----------
export function mockupsToProducts(site: Site): Product[] {
  if (site.dropship_type !== "pod_brand" || !site.pod_designs?.length) return []
  const designs = site.pod_designs
  const products: Product[] = []
  for (const design of designs) {
    if (!design.mockups?.length) continue
    for (const m of design.mockups) {
      const selProducts = design.selected_products || {}
      const sel = selProducts[String(m.product_id)]
      const sellPrice = sel?.sellPrice ? Number(sel.sellPrice) : 0
      const pr = sellPrice > 0 ? sellPrice : (m.price ? Number(m.price) : 0)
      const cur = m.currency || "CAD"
      const variants = sel?.variants || []
      products.push({
        id: `printful-${m.product_id}-${m.variant_id}`,
        name: m.product_name?.replace(/\s*—\s*.+$/, "") || "Produit",
        description: "",
        price: pr > 0 ? `${pr.toFixed(2)} ${cur}` : "",
        priceNumber: pr,
        currency: cur,
        image: m.mockup_url,
        variants: variants.map((v: any) => ({
          variant_id: v.variant_id,
          label: v.label,
          price: sellPrice > 0 ? sellPrice : (v.price || 0),
          currency: v.currency || cur,
        })),
      })
    }
  }
  return products
}

// Carte OSM partagee par tous les themes (synchro adresse via geo_lat/geo_lng)
export function ContactMap({ lat, lng, className = '' }: { lat?: number | null; lng?: number | null; className?: string }) {
  if (lat == null || lng == null) return null
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.01}&layer=mapnik&marker=${lat},${lng}`
  return (
    <div className={`rounded-2xl overflow-hidden ${className}`}>
      <iframe
        title="Map"
        width="100%"
        height="220"
        style={{ border: 0 }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        src={src}
      />
    </div>
  )
}
