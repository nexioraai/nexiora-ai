// src/app/sites/[slug]/themes/EditorialShopSection.tsx
//
// Section Shop d'EditorialTheme, extraite pour que le rendu Mode 1 (Hero,
// About, Services, Contact...) n'importe et n'execute plus jamais de code
// panier -- ce fichier n'est monté que lorsque
// modeCapabilities.hasShop est vrai (voir EditorialTheme.tsx), jamais pour
// un site Mode 1.
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import ClickableProductCard from './ClickableProductCard'
import AddToCartButton from './AddToCartButton'
import ShippingEstimate from './ShippingEstimate'
import { getCartLabels } from './cartLabels'
import { type Site, normalizeProduct, mockupsToProducts, canAddToCart } from './shared'
import { getDict } from './i18n'

export default function EditorialShopSection({ site, primary }: { site: Site; primary: string }) {
  const t = getDict(site.lang)
  const cartT = getCartLabels(site.lang)
  const products = [...(site.products || []).map(normalizeProduct), ...mockupsToProducts(site)]

  return (
    <section id="shop" className="reveal py-28 md:py-36">
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <div className="text-center max-w-2xl mx-auto mb-20">
          <div
            className="text-xs font-medium tracking-[0.2em] uppercase mb-4"
            style={{ color: primary }}
          >
            {t.sections.shopKicker}
          </div>
          <h2
            className="font-serif text-4xl md:text-5xl leading-tight"
            style={{ fontFamily: 'var(--font-fraunces), serif' }}
          >
            {t.sections.shopTitle}
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.map((p, i) => (
            <ClickableProductCard slug={site.slug}
              key={i}
              product={p}
              primary={primary}
              lang={site.lang}
              className="group bg-white border border-neutral-200/70 rounded-3xl overflow-hidden hover:shadow-xl hover:-translate-y-1 hover:border-transparent transition-all duration-500 flex flex-col"
            >
              <div className="aspect-square relative overflow-hidden bg-neutral-100">
                {p.image ? (
                  <Image
                    src={p.image}
                    alt={p.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-5xl font-serif opacity-20"
                    style={{ fontFamily: 'var(--font-fraunces), serif', color: primary }}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="p-6 flex flex-col flex-1">
                <h3
                  className="font-serif text-xl leading-snug mb-2"
                  style={{ fontFamily: 'var(--font-fraunces), serif' }}
                >
                  {p.name}
                </h3>
                {p.description && (
                  <p className="text-sm text-neutral-600 mb-4 line-clamp-2 flex-1">
                    {p.description}
                  </p>
                )}
                <div className="flex items-center justify-between pt-4 border-t border-neutral-100 mt-auto">
                  {p.price ? (
                    <span
                      className="text-2xl font-medium"
                      style={{ color: primary }}
                    >
                      {p.price}
                    </span>
                  ) : (
                    <span className="text-sm text-neutral-400">{t.labels.onQuote}</span>
                  )}
                  {canAddToCart(p) ? (
                    <AddToCartButton
                      id={p.id}
                      name={p.name}
                      priceNumber={p.priceNumber}
                      currency={p.currency || 'CAD'}
                      image={p.image}
                      primary={primary}
                      label={cartT.addToCart}
                    />
                  ) : (
                    <a
                      href="#contact"
                      className="inline-flex items-center gap-1 text-sm font-medium text-neutral-900 group/link"
                    >
                      {t.labels.request}
                      <ArrowRight className="w-4 h-4 group-hover/link:translate-x-1 transition-transform" />
                    </a>
                  )}
                </div>
                {p.cjVid && <ShippingEstimate siteId={site.id} cjVid={p.cjVid} primary={primary} deliveryLabel={t.labels.estimatedDelivery} daysLabel={t.labels.days} />}
                {!p.cjVid && p.shippingDaysMin && (
                  <p className="text-sm mt-1 flex items-center gap-1.5" style={{ color: primary }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                    {t.labels.estimatedDelivery} {p.shippingDaysMin}{p.shippingDaysMax && p.shippingDaysMax !== p.shippingDaysMin ? `-${p.shippingDaysMax}` : ''} {t.labels.days}
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
