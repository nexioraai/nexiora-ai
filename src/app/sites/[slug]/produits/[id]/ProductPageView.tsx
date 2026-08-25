'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ProductPage } from './fetchProduct'
import AddToCartButton from '../../themes/AddToCartButton'
import { THEME_TOKENS, ThemeKey } from '../../themes/CatalogSearch'

const CART_LABELS: Record<string, string> = {
  fr: 'Ajouter au panier',
  en: 'Add to cart',
  ar: 'أضف إلى السلة',
  es: 'Añadir al carrito',
}

// DETTE 6c — meme forme que CART_LABELS ci-dessus : ce fichier porte deja ses
// libelles en local, en inventer un autre mecanisme ici serait gratuit.
const NOT_FOR_SALE_LABELS: Record<string, string> = {
  fr: 'Ce produit n’est pas en vente',
  en: 'This product is not for sale',
  ar: 'هذا المنتج غير معروض للبيع',
  es: 'Este producto no está a la venta',
}

export default function ProductPageView({ product }: { product: ProductPage }) {
  const [imgIndex, setImgIndex] = useState(0)
  const imgs = product.images.length > 0 ? product.images : []
  const tokens = THEME_TOKENS[(product.theme as ThemeKey)] || THEME_TOKENS.editorial
  const priceLabel =
    product.priceNumber > 0
      ? product.priceNumber.toFixed(2) + ' ' + product.currency
      : ''
  const addLabel = CART_LABELS[product.lang] || CART_LABELS.en
  const notForSaleLabel = NOT_FOR_SALE_LABELS[product.lang] || NOT_FOR_SALE_LABELS.en

  return (
    <div style={{ background: tokens.modalBg, color: tokens.modalText, minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px' }}>
        <Link
          href={'/sites/' + product.siteSlug}
          style={{ fontSize: 14, opacity: 0.7, textDecoration: 'none', color: 'inherit' }}
        >
          ← {product.siteName}
        </Link>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 40,
            marginTop: 24,
            alignItems: 'start',
          }}
        >
          <div>
            {imgs.length > 0 ? (
              <>
                <img
                  src={imgs[imgIndex]}
                  alt={product.name}
                  style={{ width: '100%', borderRadius: 16, objectFit: 'cover', aspectRatio: '1 / 1' }}
                />
                {imgs.length > 1 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    {imgs.map((src, i) => (
                      <button
                        key={i}
                        onClick={() => setImgIndex(i)}
                        style={{
                          border: i === imgIndex ? '2px solid ' + product.primary : '1px solid rgba(128,128,128,0.4)',
                          borderRadius: 8,
                          padding: 0,
                          cursor: 'pointer',
                          background: 'none',
                          lineHeight: 0,
                        }}
                      >
                        <img src={src} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6 }} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ width: '100%', aspectRatio: '1 / 1', background: 'rgba(128,128,128,0.15)', borderRadius: 16 }} />
            )}
          </div>

          <div>
            <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{product.name}</h1>
            {priceLabel && (
              <div style={{ fontSize: 24, fontWeight: 600, marginTop: 16 }}>{priceLabel}</div>
            )}
            {!product.inStock && (
              <div style={{ marginTop: 8, color: '#e05b5b', fontSize: 14 }}>Rupture de stock</div>
            )}
            {product.description && (
              <p style={{ marginTop: 24, lineHeight: 1.6, whiteSpace: 'pre-wrap', opacity: 0.9 }}>{product.description}</p>
            )}
            {/* DETTE 6c — la fiche produit applique la MEME regle que la
                vitrine : un produit retire de la vente reste entierement
                consultable (titre, images, prix, description), il n'a
                simplement plus de chemin d'achat. Le bouton n'est pas
                seulement desactive, il n'est pas rendu : un bouton grise
                invite a reessayer, et le checkout refuserait de toute
                facon (409). `inStock` garde son comportement propre --
                epuise et non-vendable sont deux etats differents. */}
            <div style={{ marginTop: 28 }}>
              {product.forSale ? (
                <AddToCartButton
                  id={product.id}
                  name={product.name}
                  priceNumber={product.priceNumber}
                  currency={product.currency}
                  image={imgs[0]}
                  primary={product.primary}
                  label={addLabel}
                  disabled={!product.inStock}
                />
              ) : (
                <div style={{ fontSize: 14, opacity: 0.7 }}>{notForSaleLabel}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
