'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ProductPage } from './fetchProduct'

export default function ProductPageView({ product }: { product: ProductPage }) {
  const [imgIndex, setImgIndex] = useState(0)
  const imgs = product.images.length > 0 ? product.images : []
  const priceLabel =
    product.priceNumber > 0
      ? `${product.priceNumber.toFixed(2)} ${product.currency}`
      : ''

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px' }}>
      <Link
        href={`/sites/${product.siteSlug}`}
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
                        border: i === imgIndex ? '2px solid #111' : '1px solid #ddd',
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
            <div style={{ width: '100%', aspectRatio: '1 / 1', background: '#f2f2f2', borderRadius: 16 }} />
          )}
        </div>

        <div>
          <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{product.name}</h1>
          {priceLabel && (
            <div style={{ fontSize: 24, fontWeight: 600, marginTop: 16 }}>{priceLabel}</div>
          )}
          {!product.inStock && (
            <div style={{ marginTop: 8, color: '#b00', fontSize: 14 }}>Rupture de stock</div>
          )}
          {product.description && (
            <p style={{ marginTop: 24, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{product.description}</p>
          )}
        </div>
      </div>
    </div>
  )
}
