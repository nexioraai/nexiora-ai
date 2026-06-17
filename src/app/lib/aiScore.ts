import type { Site } from '@/app/sites/[slug]/themes/shared'

export type AiScoreResult = {
  score: number
  missing: string[]
}

// Secteurs reconnus = @type precis dans le JSON-LD (pas le fallback LocalBusiness)
function hasRecognizedType(type?: string): boolean {
  const t = (type ?? '').toLowerCase()
  const keys = [
    'saas', 'logiciel', 'e-commerce', 'ecommerce', 'import', 'export',
    'agence', 'livraison', 'logistique', 'flotte', 'distributeur', 'agricole',
    'café', 'cafe', 'coffee', 'restaurant', 'food', 'burger', 'dining',
    'pharmaci', 'boulangerie', 'bakery', 'station', 'auto', 'pièces', 'pieces',
    'dealership', 'boutique', 'magasin', 'clothing', 'store', 'détail', 'detail',
    'électronique', 'electronique', 'متجر',
  ]
  return keys.some((k) => t.includes(k))
}

export function computeAiScore(site: Site): AiScoreResult {
  let score = 0
  const missing: string[] = []

  // @type secteur reconnu (15)
  if (hasRecognizedType(site.type)) score += 15
  else missing.push('Précise ton secteur d\u2019activité')

  // Geolocalisation reelle (15)
  if (typeof site.geo_lat === 'number' && typeof site.geo_lng === 'number')
    score += 15
  else missing.push('Ajoute une adresse valide (géolocalisation)')

  // FAQ >= 3 (15)
  if (Array.isArray(site.faq) && site.faq.length >= 3) score += 15
  else missing.push('Ajoute une FAQ (au moins 3 questions)')

  // Telephone (10)
  if (site.contact?.phone) score += 10
  else missing.push('Ajoute un numéro de téléphone')

  // Email (10)
  if (site.contact?.email) score += 10
  else missing.push('Ajoute un courriel de contact')

  // Reseaux sociaux >= 1 (10)
  const socials = site.social_links
    ? Object.values(site.social_links).filter(
        (v) => typeof v === 'string' && v.length > 0
      )
    : []
  if (socials.length >= 1) score += 10
  else missing.push('Relie au moins un réseau social')

  // Mission + Vision (10)
  if (site.mission && site.vision) score += 10
  else missing.push('Complète ta mission et ta vision')

  // Pourquoi nous >= 3 (5)
  if (Array.isArray(site.whyus) && site.whyus.length >= 3) score += 5
  else missing.push('Ajoute la section « Pourquoi nous »')

  // Zone desservie (5)
  if (site.area_served) score += 5
  else missing.push('Précise ta zone desservie')

  // Gamme de prix (5)
  if (site.price_range) score += 5
  else missing.push('Indique ta gamme de prix')

  return { score, missing }
}
