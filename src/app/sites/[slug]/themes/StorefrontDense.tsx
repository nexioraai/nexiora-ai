'use client'

import { useState, useMemo, type ReactNode } from 'react'
import Image from 'next/image'
import { ArrowRight, Truck, Grid3x3, Sparkles, ShieldCheck, RefreshCw, Headphones } from 'lucide-react'
import type { Product } from './shared'
import ClickableProductCard from './ClickableProductCard'
import AddToCartButton from './AddToCartButton'
import ShippingEstimate from './ShippingEstimate'

type Labels = {
  all: string
  onQuote: string
  request: string
  addToCart: string
  estimatedDelivery: string
  days: string
  securePayment: string
  freeDelivery: string
  easyReturns: string
  support: string
  newArrivals: string
  browse: string
}

export default function StorefrontDense({
  products,
  primary,
  siteId,
  slug,
  siteName,
  lang,
  heroTitle,
  heroSubtitle,
  heroImage,
  slogan,
  labels,
  searchSlot,
}: {
  products: Product[]
  primary: string
  siteId: string
  slug: string
  siteName: string
  lang?: string
  heroTitle?: string
  heroSubtitle?: string
  heroImage?: string
  slogan?: string
  labels: Labels
  searchSlot?: ReactNode
}) {
  const families = useMemo(() => {
    const seen: string[] = []
    for (const p of products) if (p.family && !seen.includes(p.family)) seen.push(p.family)
    return seen
  }, [products])

  const [active, setActive] = useState<string | null>(null)
  const shown = useMemo(
    () => (active ? products.filter((p) => p.family === active) : products),
    [products, active]
  )
  const heroProduct = products.find((p) => p.image)

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-6 lg:px-8 pt-8 pb-16">
      {/* ============ HERO (full-bleed premium) ============ */}
      <div className="relative overflow-hidden rounded-[2rem] mb-8 min-h-[520px] md:min-h-[600px] flex items-end">
        {(heroImage || heroProduct?.image) ? (
          <>
            <Image src={(heroImage || heroProduct?.image) as string} alt="" fill priority sizes="100vw" className="object-cover object-top" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.25) 100%)' }} />
            <div className="absolute inset-0" style={{ background: `linear-gradient(105deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 40%, transparent 65%)` }} />
          </>
        ) : (
          <div className="absolute inset-0" style={{ background: `linear-gradient(130deg, color-mix(in srgb, ${primary} 60%, #111), color-mix(in srgb, ${primary} 20%, #000))` }} />
        )}
        <div className="au-blob absolute -top-20 -right-16 w-[28rem] h-[28rem] rounded-full blur-3xl opacity-30 pointer-events-none" style={{ background: `radial-gradient(circle, ${primary}, transparent 62%)` }} />
        <div className="relative w-full p-8 md:p-16 au-rise">
          {slogan && (
            <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-5 rounded-full bg-black/30 backdrop-blur-md border border-white/25 text-xs font-medium tracking-[0.15em] uppercase text-white">
              <Sparkles className="w-3.5 h-3.5" />
              {slogan}
            </div>
          )}
          <h1 className="text-4xl md:text-7xl font-semibold leading-[1.02] tracking-tight mb-5 text-white max-w-3xl drop-shadow-sm">{heroTitle || siteName}</h1>
          {heroSubtitle && (<p className="text-base md:text-xl text-white/80 max-w-xl mb-8 leading-relaxed">{heroSubtitle}</p>)}
          <div className="flex items-center gap-4 flex-wrap">
            <a href="#grid" className="group inline-flex items-center gap-2 px-8 py-4 rounded-full text-white font-medium transition hover:-translate-y-0.5 shadow-xl" style={{ backgroundColor: primary }}>
              {labels.newArrivals}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>

          </div>
        </div>
      </div>
      {/* ============ SEARCH SLOT (real CatalogSearch) ============ */}
      {searchSlot}

      <div className="flex gap-6 lg:gap-8">
        {/* ============ SIDEBAR ============ */}
        <aside className="hidden lg:flex flex-col w-60 shrink-0 gap-6">
          {families.length >= 2 && (
            <div className="rounded-3xl border border-black/5 bg-white/70 backdrop-blur-xl p-3 shadow-sm au-rise">
              <button
                onClick={() => setActive(null)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition"
                style={{
                  backgroundColor: active === null ? `color-mix(in srgb, ${primary} 12%, white)` : 'transparent',
                  color: active === null ? primary : '#404040',
                }}
              >
                <Grid3x3 className="w-4 h-4" />
                {labels.all}
              </button>
              {families.map((fam) => {
                const on = active === fam
                return (
                  <button
                    key={fam}
                    onClick={() => setActive(fam)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition text-left"
                    style={{
                      backgroundColor: on ? `color-mix(in srgb, ${primary} 12%, white)` : 'transparent',
                      color: on ? primary : '#404040',
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: on ? primary : '#d4d4d4' }} />
                    <span className="line-clamp-1">{fam}</span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="rounded-3xl border border-black/5 bg-white/70 backdrop-blur-xl p-4 shadow-sm space-y-4 au-rise" style={{ animationDelay: '0.1s' }}>
            {[
              { Icon: ShieldCheck, t: labels.securePayment },
              { Icon: Truck, t: labels.freeDelivery },
              { Icon: RefreshCw, t: labels.easyReturns },
              { Icon: Headphones, t: labels.support },
            ].map(({ Icon, t }, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `color-mix(in srgb, ${primary} 12%, white)`, color: primary }}>
                  <Icon className="w-4 h-4" />
                </span>
                <span className="text-xs font-medium text-neutral-700">{t}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* ============ MAIN ============ */}
        <div className="flex-1 min-w-0">
          {/* Family chips (mobile) */}
          {families.length >= 2 && (
            <div className="lg:hidden flex gap-2 overflow-x-auto pb-3 mb-4 -mx-4 px-4">
              <button
                onClick={() => setActive(null)}
                className="shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition"
                style={{
                  borderColor: active === null ? primary : 'rgba(0,0,0,0.1)',
                  backgroundColor: active === null ? `color-mix(in srgb, ${primary} 12%, white)` : 'white',
                  color: active === null ? primary : '#525252',
                }}
              >
                {labels.all}
              </button>
              {families.map((fam) => (
                <button
                  key={fam}
                  onClick={() => setActive(fam)}
                  className="shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition whitespace-nowrap"
                  style={{
                    borderColor: active === fam ? primary : 'rgba(0,0,0,0.1)',
                    backgroundColor: active === fam ? `color-mix(in srgb, ${primary} 12%, white)` : 'white',
                    color: active === fam ? primary : '#525252',
                  }}
                >
                  {fam}
                </button>
              ))}
            </div>
          )}

          <div id="shop" className="flex items-center justify-between mb-5">
            <h2 className="text-xl md:text-2xl font-semibold">{active || labels.browse}</h2>
            <span className="text-sm text-neutral-400">{shown.length}</span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
            {shown.map((p, i) => (
              <ClickableProductCard slug={slug}
                key={`${p.id ?? p.name}-${i}`}
                product={p}
                primary={primary}
                lang={lang}
                className="group relative bg-white rounded-2xl overflow-hidden border border-black/5 hover:shadow-[0_16px_40px_-16px_rgba(0,0,0,0.22)] hover:-translate-y-1 transition-all duration-300 flex flex-col"
              >
                <div className="aspect-square relative overflow-hidden bg-neutral-50">
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{ background: `radial-gradient(circle at 50% 60%, color-mix(in srgb, ${primary} 16%, transparent), transparent 70%)` }}
                  />
                  {p.image ? (
                    <Image
                      src={p.image}
                      alt={p.name}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl font-semibold opacity-15" style={{ color: primary }}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="p-3.5 flex flex-col flex-1">
                  <h3 className="text-sm font-semibold leading-snug mb-2 line-clamp-2 min-h-[2.5rem]">{p.name}</h3>
                  <div className="mt-auto">
                    {p.price ? (
                      <div className="text-lg font-semibold mb-2.5" style={{ color: primary }}>{p.price}</div>
                    ) : (
                      <div className="text-sm text-neutral-400 mb-2.5">{labels.onQuote}</div>
                    )}
                    {p.id && p.priceNumber != null ? (
                      <div
                        className="w-full flex items-center justify-center py-2.5 rounded-xl text-white transition hover:opacity-90 [&_button]:text-white"
                        style={{ backgroundColor: primary }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <AddToCartButton
                          id={p.id}
                          name={p.name}
                          priceNumber={p.priceNumber}
                          currency={p.currency || 'CAD'}
                          image={p.image}
                          primary="#ffffff"
                          label={labels.addToCart}
                        />
                      </div>
                    ) : (
                      <a href="#contact" className="w-full inline-flex items-center justify-center gap-1 py-2.5 rounded-xl text-sm font-medium border border-neutral-200 text-neutral-700">
                        {labels.request}
                      </a>
                    )}
                    {p.cjVid && <div className="mt-2"><ShippingEstimate siteId={siteId} cjVid={p.cjVid} primary={primary} deliveryLabel={labels.estimatedDelivery} daysLabel={labels.days} /></div>}
                    {!p.cjVid && p.shippingDaysMin && (
                      <p className="text-xs mt-2 flex items-center gap-1.5" style={{ color: primary }}>
                        <Truck className="w-3 h-3" />
                        {p.shippingDaysMin}{p.shippingDaysMax && p.shippingDaysMax !== p.shippingDaysMin ? `-${p.shippingDaysMax}` : ''} {labels.days}
                      </p>
                    )}
                  </div>
                </div>
              </ClickableProductCard>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
