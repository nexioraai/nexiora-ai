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
'id,slug,name,slogan,type,mode,primary_color,hero_title,hero_subtitle,about,services,testimonials,gallery,products,contact,menu,team,hours,social_links,address,pages,cta,theme,hero_image,lang,faq,whyus,mission,vision,geo_lat,geo_lng,area_served,price_range,hidden_sections,section_label,sections,created_at,dropship_type,pod_designs'

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

return data as Site
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
