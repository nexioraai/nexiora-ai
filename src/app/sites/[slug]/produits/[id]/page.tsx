import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { fetchProduct } from './fetchProduct'
import ProductPageView from './ProductPageView'
import CartShell from '../../themes/CartShell'
import { getCartLabels } from '../../themes/cartLabels'
import { resolveSiteBaseUrl } from '../../themes/shared'
import JsonLdScript from '../../themes/JsonLdScript'

// M1-08 : `revalidate` retire, il etait TROMPEUR. Cette page appelle
// `headers()` (resolution du domaine perso pour le canonical), ce qui la
// bascule en rendu dynamique : la revalidation ne s'appliquait jamais. La
// declarer laissait croire a une strategie de cache qui n'existait pas.
//
// Le rendu dynamique est CONSERVE volontairement : il garantit qu'aucune page
// d'un marchand ne peut etre servie depuis un cache partage avec un autre --
// la performance ne doit pas s'acheter au prix d'un risque inter-locataire.

type Props = { params: Promise<{ slug: string; id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, id } = await params
  const product = await fetchProduct(slug, decodeURIComponent(id))
  if (!product) return { title: 'Produit introuvable' }

  const title = `${product.name} — ${product.siteName}`
  const rawDesc = product.description || product.name
  const description =
    rawDesc.length > 160 ? rawDesc.slice(0, 157).trimEnd() + '…' : rawDesc
  const host = (await headers()).get('host')
  const base = resolveSiteBaseUrl(
    { slug: product.siteSlug, custom_domain: product.siteCustomDomain },
    host,
  )
  const url = `${base}/produits/${encodeURIComponent(product.id)}`
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

  const host = (await headers()).get('host')
  const base = resolveSiteBaseUrl(
    { slug: product.siteSlug, custom_domain: product.siteCustomDomain },
    host,
  )
  const url = `${base}/produits/${encodeURIComponent(product.id)}`
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
      {/* M1-01 : serialisation echappee, point d'entree unique. */}
      <JsonLdScript data={jsonLd} />
      {/* ============================================================
          M2-01 -- `products` MANQUAIT, ET LA PAGE LEVAIT UNE EXCEPTION.
          Ce montage etait le seul des trois a ne pas transmettre `products`.
          `CartShell` calcule sa propre verite par `getModeCapabilities`, et
          pour un Mode 2 sans `products` la reponse est `hasShop = false` :
          `CartProvider` n'etait donc pas monte, et `AddToCartButton` --
          rendu des que `forSale` -- appelait `useCart()`, qui LEVE. La fiche
          produit d'une boutique Mode 2 renvoyait 500, sur un chemin atteint
          par chaque carte produit de la vitrine ET annonce par les deux
          sitemaps.
          Le Mode 3 y echappait par `CATALOG_BEFORE_OWN_PRODUCTS` (hasShop
          vrai sans produit) et le Mode 1 n'a pas de fiche produit : le trou
          etait exactement, et seulement, celui du Mode 2.

          POURQUOI `[product]` EST LA VALEUR JUSTE, et non un contournement.
          `hasShop` demande « ce site a-t-il au moins un produit ? ».
          `fetchProduct` filtre par `site_id` sur ses deux branches : rendre
          cette page PROUVE que le site en possede un -- celui qu'on affiche,
          et qu'on s'apprete a rendre achetable. Aucune frontiere n'est
          deplacee : `canTransact` reste seul juge de l'admission, et un Mode 1
          n'atteint jamais cette page (404 de `fetchProduct`).
          ============================================================ */}
      <CartShell
        primary={product.primary}
        labels={labels}
        slug={product.siteSlug}
        mode={product.mode}
        products={[product]}
        shippingFlat={product.shippingFlat ?? undefined}
        variant={product.theme === 'noir' ? 'dark' : 'light'}
      >
        <ProductPageView product={product} />
      </CartShell>
    </>
  )
}
