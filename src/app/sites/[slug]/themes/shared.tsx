// src/app/sites/[slug]/themes/shared.tsx
import { createClient } from '@supabase/supabase-js'
import {
import { supabase } from '@/lib/supabase';
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
  slug: string
  name: string
  slogan?: string
  type?: string
  primary_color?: string
  hero_title?: string
  hero_subtitle?: string
  about?: string
  services?: any[]
  gallery?: string[]
  testimonials?: any[]
  products?: any[]
  contact?: { phone?: string; email?: string; address?: string }
  social_links?: {
    instagram?: string
    facebook?: string
    whatsapp?: string
    tiktok?: string
  }
  hero_image?: string
  cta?: string
  theme?: 'editorial' | 'bold' | string
}

export type Product = {
  name: string
  description: string
  price: string
  image?: string
}

export type Service = {
  title: string
  description: string
  Icon: LucideIcon
}

export type Testimonial = {
  name: string
  role: string
  content: string
  rating: number
}

// ---------- Supabase ----------

// Whitelist publique — owner_email exclu, exporte pour reutilisation
export const PUBLIC_COLS = 'slug,name,slogan,type,primary_color,hero_title,hero_subtitle,about,services,testimonials,gallery,products,contact,menu,team,hours,social_links,address,pages,cta,theme,hero_image'

export async function fetchSite(slug: string): Promise<Site | null> {
  const { data, error } = await supabase
    .from('sites')
    .select(PUBLIC_COLS)
    .eq('slug', slug)
    .single()
  if (error || !data) return null
  return data as Site
}

// ---------- Icon pool ----------
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
export function normalizeService(raw: any, index: number): Service {
  if (typeof raw === 'string') {
    return {
      title: raw,
      description: 'Service professionnel adapté à vos besoins.',
      Icon: SERVICE_ICONS[index % SERVICE_ICONS.length],
    }
  }
  return {
    title: raw?.title ?? raw?.name ?? 'Service',
    description:
      raw?.description ?? 'Service professionnel adapté à vos besoins.',
    Icon: SERVICE_ICONS[index % SERVICE_ICONS.length],
  }
}

export function normalizeTestimonial(raw: any): Testimonial {
  return {
    name: raw?.name ?? 'Client',
    role: raw?.role ?? raw?.company ?? '',
    content: raw?.content ?? raw?.text ?? raw?.message ?? '',
    rating: Number(raw?.rating ?? 5),
  }
}

export function normalizeProduct(raw: any): Product {
  return {
    name: raw?.name ?? raw?.title ?? 'Produit',
    description: raw?.description ?? '',
    price: raw?.price ?? '',
    image: raw?.image ?? raw?.image_url ?? undefined,
  }
}
