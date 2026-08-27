// src/app/sites/[slug]/themes/VifShopSection.tsx
//
// Section Shop de VifTheme, extraite pour que le rendu Mode 1 n'importe et
// n'execute plus jamais de code panier -- ce fichier n'est monté que
// lorsque modeCapabilities.hasShop est vrai (voir VifTheme.tsx), jamais
// pour un site Mode 1.
import ClickableProductCard from './ClickableProductCard'
import AddToCartButton from './AddToCartButton'
import ShippingEstimate from './ShippingEstimate'
import TiltCard from './TiltCard'
import { getCartLabels } from './cartLabels'
import { type Site, normalizeProduct, mockupsToProducts, canAddToCart } from './shared'
import { getDict } from './i18n'
import { INK, GOLD, CREAM_DEEP } from './VifTheme'

export default function VifShopSection({ site }: { site: Site }) {
  const t = getDict(site.lang)
  const cartT = getCartLabels(site.lang)
  const products = [...(site.products || []).map(normalizeProduct), ...mockupsToProducts(site)]

  return (
    <section id="shop" className="reveal py-28 md:py-36" style={{ borderTop: '1px solid rgba(20,18,16,0.08)', backgroundColor: CREAM_DEEP }}>
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <div className="text-center max-w-2xl mx-auto mb-20">
          <div className="text-xs font-medium tracking-[0.25em] uppercase mb-4" style={{ color: GOLD }}>
            {t.sections.shopKicker}
          </div>
          <h2 className="text-4xl md:text-5xl leading-tight" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
            {t.sections.shopTitle}
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((p, i) => (
            <ClickableProductCard slug={site.slug} key={i} product={p} primary={INK} lang={site.lang}>
            <TiltCard className="group rounded-3xl overflow-hidden bg-white border border-black/[0.06]">
              {p.image && (
                <div className="relative w-full h-56 overflow-hidden">
                  <img src={p.image} alt={p.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </div>
              )}
              <div className="p-6">
                <h3 className="text-lg mb-1" style={{ fontFamily: 'var(--font-fraunces), serif' }}>{p.name}</h3>
                {p.price && <div className="text-sm font-semibold mb-4" style={{ color: GOLD }}>{p.price}</div>}
                {canAddToCart(p) ? (
                  <AddToCartButton
                    id={p.id}
                    name={p.name}
                    priceNumber={p.priceNumber}
                    currency={p.currency || 'CAD'}
                    image={p.image}
                    primary={INK}
                    label={cartT.addToCart}
                  />
                ) : (
                  <a href="#contact" className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: INK }}>
                    {t.labels.request}
                  </a>
                )}
                {p.cjVid && <ShippingEstimate siteId={site.id} cjVid={p.cjVid} primary={GOLD} deliveryLabel={t.labels.estimatedDelivery} daysLabel={t.labels.days} />}
                {!p.cjVid && p.shippingDaysMin && (
                  <p className="text-sm mt-1 flex items-center gap-1.5" style={{ color: GOLD }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                    {t.labels.estimatedDelivery} {p.shippingDaysMin}{p.shippingDaysMax && p.shippingDaysMax !== p.shippingDaysMin ? `-${p.shippingDaysMax}` : ''} {t.labels.days}
                  </p>
                )}
              </div>
            </TiltCard>
            </ClickableProductCard>
          ))}
        </div>
      </div>
    </section>
  )
}
