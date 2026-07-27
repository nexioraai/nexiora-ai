import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchProduct } from './fetchProduct'
import ProductPageView from './ProductPageView'
import CartShell from '../../themes/CartShell'
import { getCartLabels } from '../../themes/cartLabels'

export const revalidate = 60

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nexiora-ai.vercel.app'

type Props = { params: Promise<{ slug: string; id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, id } = await params
  const product = await fetchProduct(slug, decodeURIComponent(id))
  if (!product) return { title: 'Produit introuvable' }

  const title = `${product.name} — ${product.siteName}`
  const rawDesc = product.description || product.name
  const description =
    rawDesc.length > 160 ? rawDesc.slice(0, 157).trimEnd() + '…' : rawDesc
  const url = `${SITE_URL}/sites/${product.siteSlug}/produits/${encodeURIComponent(product.id)}`
  const images = product.images.length > 0 ? [{ url: product.images[0] }] : undefined

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: product.siteName,
      images,
      type: 'website',
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title,
      description,
      images: product.images.length > 0 ? [product.images[0]] : undefined,
    },
  }
}

export default async function ProductPage({ params }: Props) {
  const { slug, id } = await params
  const product = await fetchProduct(slug, decodeURIComponent(id))
  if (!product) notFound()

  const url = `${SITE_URL}/sites/${product.siteSlug}/produits/${encodeURIComponent(product.id)}`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || product.name,
    image: product.images.length > 0 ? product.images : undefined,
    url,
    offers: {
      '@type': 'Offer',
      price: product.priceNumber > 0 ? product.priceNumber.toFixed(2) : undefined,
      priceCurrency: product.currency,
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url,
    },
  }

  const labels = getCartLabels(product.lang)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CartShell
        primary={product.primary}
        labels={labels}
        slug={product.siteSlug}
        mode={product.mode}
        shippingFlat={product.shippingFlat ?? undefined}
      >
        <ProductPageView product={product} />
      </CartShell>
    </>
  )
}
