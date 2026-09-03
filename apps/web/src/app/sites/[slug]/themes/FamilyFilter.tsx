'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import { ArrowRight, Truck } from 'lucide-react'
import type { Product } from './shared'
// DETTE 6c — garde d'ajout au panier : point de decision unique (shared.tsx).
import { canAddToCart } from './shared'
import ClickableProductCard from './ClickableProductCard'
import AddToCartButton from './AddToCartButton'
import ShippingEstimate from './ShippingEstimate'

type Labels = {
  shopKicker: string
  shopTitle: string
  all: string
  onQuote: string
  request: string
  addToCart: string
  estimatedDelivery: string
  days: string
}

export default function FamilyFilter({
  products,
  primary,
  siteId,
  slug,
  lang,
  labels,
}: {
  products: Product[]
  primary: string
  siteId: string
  slug: string
  lang?: string
  labels: Labels
}) {
  // Familles présentes (ordre d'apparition), en ignorant les produits sans famille
  const families = useMemo(() => {
    const seen: string[] = []
    for (const p of products) {
      if (p.family && !seen.includes(p.family)) seen.push(p.family)
    }
    return seen
  }, [products])

  const [active, setActive] = useState<string | null>(null) // null = "Tout"

  const shown = useMemo(
    () => (active ? products.filter((p) => p.family === active) : products),
    [products, active]
  )

  // Un produit représentatif (avec image) par famille, pour l'image du cercle
  const familyImage = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of products) {
      if (p.family && p.image && !map[p.family]) map[p.family] = p.image
    }
    return map
  }, [products])

  const hasFamilies = families.length >= 2

  return (
    <section id="shop" className="reveal py-20 md:py-28">
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-xs font-medium tracking-[0.2em] uppercase mb-4" style={{ color: primary }}>
            {labels.shopKicker}
          </div>
          <h2 className="text-4xl md:text-5xl font-semibold leading-tight">{labels.shopTitle}</h2>
        </div>

        {/* Family circles */}
        {hasFamilies && (
          <div className="flex gap-6 md:gap-10 overflow-x-auto pb-4 mb-12 -mx-6 px-6 md:mx-0 md:px-0 md:justify-center">
            {/* "Tout" pill */}
            <button
              onClick={() => setActive(null)}
              className="group shrink-0 flex flex-col items-center gap-3 focus:outline-none"
            >
              <div className="relative">
                <div
                  className="absolute -inset-1.5 rounded-full blur-md transition-opacity duration-500"
                  style={{
                    background: `radial-gradient(circle, ${primary}, transparent 70%)`,
                    opacity: active === null ? 0.55 : 0,
                  }}
                />
                <div
                  className="relative w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center border transition-all duration-300 group-hover:-translate-y-1"
                  style={{
                    borderColor: active === null ? primary : 'rgba(0,0,0,0.08)',
                    backgroundColor: active === null ? `color-mix(in srgb, ${primary} 12%, white)` : 'white',
                    boxShadow: active === null ? `0 10px 30px -10px ${primary}` : 'none',
                  }}
                >
                  <span
                    className="text-sm font-semibold"
                    style={{ color: active === null ? primary : '#525252' }}
                  >
                    {labels.all}
                  </span>
                </div>
              </div>
              <span
                className="text-xs md:text-sm font-medium text-center max-w-[6rem]"
                style={{ color: active === null ? primary : '#404040' }}
              >
                {labels.all}
              </span>
            </button>

            {families.map((fam) => {
              const isActive = active === fam
              const img = familyImage[fam]
              return (
                <button
                  key={fam}
                  onClick={() => setActive(fam)}
                  className="group shrink-0 flex flex-col items-center gap-3 focus:outline-none"
                >
                  <div className="relative">
                    <div
                      className="absolute -inset-1.5 rounded-full blur-md transition-opacity duration-500"
                      style={{
                        background: `radial-gradient(circle, ${primary}, transparent 70%)`,
                        opacity: isActive ? 0.55 : 0,
                      }}
                    />
                    <div
                      className="relative w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden border bg-neutral-50 transition-all duration-300 group-hover:-translate-y-1"
                      style={{
                        borderColor: isActive ? primary : 'rgba(0,0,0,0.08)',
                        boxShadow: isActive ? `0 10px 30px -10px ${primary}` : 'none',
                      }}
                    >
                      {img ? (
                        <Image
                          src={img}
                          alt={fam}
                          fill
                          sizes="96px"
                          className="object-cover transition-transform duration-700 group-hover:scale-110"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl font-semibold opacity-20" style={{ color: primary }}>
                          {fam.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  </div>
                  <span
                    className="text-xs md:text-sm font-medium text-center max-w-[6rem] line-clamp-1"
                    style={{ color: isActive ? primary : '#404040' }}
                  >
                    {fam}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Product grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {shown.map((p, i) => (
            <ClickableProductCard slug={slug}
              key={`${p.id ?? p.name}-${i}`}
              product={p}
              primary={primary}
              lang={lang}
              className="group relative bg-white rounded-3xl overflow-hidden border border-black/5 hover:shadow-[0_20px_50px_-20px_rgba(0,0,0,0.25)] hover:-translate-y-1 transition-all duration-500 flex flex-col"
            >
              <div className="aspect-square relative overflow-hidden bg-neutral-50">
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ background: `radial-gradient(circle at 50% 60%, color-mix(in srgb, ${primary} 18%, transparent), transparent 70%)` }}
                />
                {p.image ? (
                  <Image
                    src={p.image}
                    alt={p.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-5xl font-semibold opacity-15" style={{ color: primary }}>
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="p-5 flex flex-col flex-1">
                <h3 className="text-base font-semibold leading-snug mb-1.5 line-clamp-1">{p.name}</h3>
                {p.description && (
                  <p className="text-sm text-neutral-500 mb-4 line-clamp-2 flex-1">{p.description}</p>
                )}
                <div className="flex items-center justify-between pt-4 border-t border-neutral-100 mt-auto">
                  {p.price ? (
                    <span className="text-xl font-semibold" style={{ color: primary }}>{p.price}</span>
                  ) : (
                    <span className="text-sm text-neutral-400">{labels.onQuote}</span>
                  )}
                  {canAddToCart(p) ? (
                    <AddToCartButton
                      id={p.id}
                      name={p.name}
                      priceNumber={p.priceNumber}
                      currency={p.currency || 'CAD'}
                      image={p.image}
                      primary={primary}
                      label={labels.addToCart}
                    />
                  ) : (
                    <a href="#contact" className="inline-flex items-center gap-1 text-sm font-medium text-neutral-900 group/link">
                      {labels.request}
                      <ArrowRight className="w-4 h-4 group-hover/link:translate-x-1 transition-transform" />
                    </a>
                  )}
                </div>
                {p.cjVid && <ShippingEstimate siteId={siteId} cjVid={p.cjVid} primary={primary} deliveryLabel={labels.estimatedDelivery} daysLabel={labels.days} />}
                {!p.cjVid && p.shippingDaysMin && (
                  <p className="text-sm mt-1 flex items-center gap-1.5" style={{ color: primary }}>
                    <Truck className="w-3.5 h-3.5" />
                    {labels.estimatedDelivery} {p.shippingDaysMin}{p.shippingDaysMax && p.shippingDaysMax !== p.shippingDaysMin ? `-${p.shippingDaysMax}` : ''} {labels.days}
                  </p>
                )}
              </div>
            </ClickableProductCard>
          ))}
        </div>
      </div>
    </section>
  )
}
