// src/app/sites/[slug]/themes/JsonLd.tsx
import type { Site } from './shared'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nexiora-ai.vercel.app'

function resolveSchemaType(rawType?: string): {
  schemaType: string
  isPhysical: boolean
} {
  const t = (rawType ?? '').toLowerCase()

  // Activités en ligne (pas de lieu physique)
  if (
    t.includes('saas') ||
    t.includes('logiciel') ||
    t.includes('e-commerce') ||
    t.includes('ecommerce') ||
    t.includes('import') ||
    t.includes('export') ||
    t.includes('agence') ||
    t.includes('livraison') ||
    t.includes('logistique') ||
    t.includes('flotte') ||
    t.includes('distributeur') ||
    t.includes('agricole')
  ) {
    return { schemaType: 'Organization', isPhysical: false }
  }

  // Commerces physiques (sous-types précis)
  if (t.includes('café') || t.includes('cafe') || t.includes('coffee'))
    return { schemaType: 'CafeOrCoffeeShop', isPhysical: true }
  if (
    t.includes('restaurant') ||
    t.includes('food') ||
    t.includes('burger') ||
    t.includes('dining')
  )
    return { schemaType: 'Restaurant', isPhysical: true }
  if (t.includes('pharmaci'))
    return { schemaType: 'Pharmacy', isPhysical: true }
  if (t.includes('boulangerie') || t.includes('bakery'))
    return { schemaType: 'Bakery', isPhysical: true }
  if (t.includes('station'))
    return { schemaType: 'GasStation', isPhysical: true }
  if (
    t.includes('auto') ||
    t.includes('pièces') ||
    t.includes('pieces') ||
    t.includes('dealership')
  )
    return { schemaType: 'AutoPartsStore', isPhysical: true }
  if (
    t.includes('boutique') ||
    t.includes('magasin') ||
    t.includes('clothing') ||
    t.includes('store') ||
    t.includes('détail') ||
    t.includes('detail') ||
    t.includes('électronique') ||
    t.includes('electronique') ||
    t.includes('متجر')
  )
    return { schemaType: 'Store', isPhysical: true }

  // Repli sûr
  return { schemaType: 'LocalBusiness', isPhysical: true }
}

export default function JsonLd({ site }: { site: Site }) {
  const { schemaType, isPhysical } = resolveSchemaType(site.type)
  const url = `${SITE_URL}/sites/${site.slug}`

  const sameAs = site.social_links
    ? Object.values(site.social_links).filter(
        (v): v is string => typeof v === 'string' && v.startsWith('http')
      )
    : []

  const address =
    site.contact?.address ??
    (typeof (site as any).address === 'string'
      ? (site as any).address
      : undefined)

  const data: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: site.name,
    url,
  }

  const description = site.slogan ?? site.hero_subtitle ?? site.about
  if (description) data.description = description
  if (site.hero_image) data.image = site.hero_image
  if (site.contact?.phone) data.telephone = site.contact.phone
  if (site.contact?.email) data.email = site.contact.email
  if (sameAs.length > 0) data.sameAs = sameAs

  if (isPhysical && address) {
    data.address = {
      '@type': 'PostalAddress',
      streetAddress: address,
    }
  }

  // Identite stable pour les IA
  data['@id'] = url

  // Coordonnees reelles (Nominatim)
  if (typeof site.geo_lat === 'number' && typeof site.geo_lng === 'number') {
    data.geo = {
      '@type': 'GeoCoordinates',
      latitude: site.geo_lat,
      longitude: site.geo_lng,
    }
  }

  // Zone desservie
  if (site.area_served) data.areaServed = site.area_served

  // Niveau de prix
  if (site.price_range) data.priceRange = site.price_range

  // Fraicheur du contenu
  if (site.created_at) data.dateModified = site.created_at

  const faqData =
    site.faq && site.faq.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: site.faq.map((f) => ({
            '@type': 'Question',
            name: f.question,
            acceptedAnswer: { '@type': 'Answer', text: f.answer },
          })),
        }
      : null

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
      />
      {faqData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqData) }}
        />
      )}
    </>
  )
}
