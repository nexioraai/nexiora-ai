import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Instagram, Facebook, TikTok, WhatsApp } from './BrandIcons'
import MobileNav from './MobileNav'
import ContactForm from '../ContactForm'
import {
  type Site,
  normalizeTestimonial,
  normalizeProduct,
  ContactMap,
} from './shared'
import { getDict } from './i18n'
import Reveal from './Reveal'
import TiltCard from './TiltCard'
import ClickableProductCard from './ClickableProductCard'
import AddToCartButton from './AddToCartButton'
import ShippingEstimate from './ShippingEstimate'
import { getCartLabels } from './cartLabels'

const BG = '#17120C'
const PANEL = '#1C1610'
const LINE = 'rgba(255,255,255,0.08)'

export default function NoirTheme({ site }: { site: Site }) {
  const hidden = (name: string) => (site.hidden_sections || []).includes(name)
  const gold = '#C9A24B'
  const t = getDict(site.lang)
  const cartT = getCartLabels(site.lang)
  const sections = site.sections || []
  const testimonials = (site.testimonials || []).map(normalizeTestimonial)
  const products = (site.products || []).map(normalizeProduct)
  const gallery: string[] = (site.gallery || []).filter(
    (u: any) => typeof u === 'string' && u.length > 0 && u.startsWith('http')
  )
  const contact = site.contact || {}
  const social = site.social_links || {}
  const cta = site.cta || 'Contactez-nous'
  const mode = site.mode || 1
  const ctaHref = (products.length > 0 || mode === 3) ? '#shop' : '#contact'
  const heroTitle = site.hero_title || site.name
  const heroWords = heroTitle.trim().split(/\s+/)
  const heroLead = heroWords.slice(0, Math.max(1, heroWords.length - 2)).join(' ')
  const heroEmph = heroWords.slice(Math.max(1, heroWords.length - 2)).join(' ')

  const stats = [
    site.price_range && { k: site.price_range, v: t.nav.shop },
    testimonials.length > 0 && { k: `${testimonials.length}+`, v: t.sections.testimonialsKicker },
    products.length > 0 && { k: `${products.length}`, v: t.nav.shop },
  ].filter(Boolean) as { k: string; v: string }[]

  return (
    <div
      className="min-h-screen antialiased"
      style={{ background: `radial-gradient(1200px 700px at 75% -5%, rgba(201,162,75,0.10), transparent 55%), ${BG}`, color: '#F5F3EE', ['--brand' as any]: gold }}
    >
      {/* =================== HEADER =================== */}
      <header
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md"
        style={{ backgroundColor: 'rgba(11,11,13,0.72)', borderBottom: `1px solid ${LINE}` }}
      >
        <div className="max-w-7xl mx-auto px-6 md:px-10 h-20 flex items-center justify-between">
          <Link
            href={`/sites/${site.slug}`}
            className="text-2xl tracking-tight font-medium"
            style={{ fontFamily: 'var(--font-fraunces), serif' }}
          >
            {site.name}
          </Link>
          <nav
            className="hidden md:flex items-center gap-10 text-sm font-medium"
            style={{ color: 'rgba(245,243,238,0.72)' }}
          >
            {!hidden('Home') && <a href="#home" className="hover:text-white transition-colors">{t.nav.home}</a>}
            {!hidden('About') && <a href="#about" className="hover:text-white transition-colors">{t.nav.about}</a>}
            {!hidden('Services') && <a href="#services" className="hover:text-white transition-colors">{sections[0]?.name || t.nav.services}</a>}
            {(products.length > 0 || mode === 3) && !hidden('Shop') && (
              <a href="#shop" className="hover:text-white transition-colors">{t.nav.shop}</a>
            )}
            {!hidden('Gallery') && <a href="#gallery" className="hover:text-white transition-colors">{t.nav.gallery}</a>}
            {!hidden('Reviews') && <a href="#testimonials" className="hover:text-white transition-colors">{t.nav.reviews}</a>}
            {(site.pages || []).filter((p: any) => p && p.title).map((page: any, pi: number) => (
              <a key={`navpage-${pi}`} href={`#page-${pi}`} className="hover:text-white transition-colors">{page.title}</a>
            ))}
            {!hidden('Contact') && <a href="#contact" className="hover:text-white transition-colors">{t.nav.contact}</a>}
          </nav>
        </div>
      </header>

      <MobileNav site={site} cta={cta} ctaHref={ctaHref} />

      <main>
        {/* =================== HERO (split cinematique) =================== */}
        {!hidden('Home') && (
          <section id="home" className="relative min-h-[94vh] flex items-center pt-24 pb-16 overflow-hidden">
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(1100px 560px at 82% 18%, rgba(201,162,75,0.12), transparent 60%)' }} />
            <div className="relative max-w-7xl mx-auto px-6 md:px-10 w-full">
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
                <div className="ed-rise">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="h-px w-8" style={{ backgroundColor: gold }} />
                    <span className="text-xs font-medium tracking-[0.25em] uppercase" style={{ color: gold }}>
                      {site.slogan || t.sections.aboutKicker}
                    </span>
                  </div>
                  <h1 className="text-5xl md:text-6xl xl:text-7xl leading-[1.05] font-medium mb-8" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                    {heroLead}
                    {heroEmph && (
                      <>
                        {' '}
                        <em className="italic font-normal">{heroEmph}</em>
                      </>
                    )}
                  </h1>
                  {site.hero_subtitle && (
                    <p className="text-lg leading-relaxed mb-10 max-w-xl" style={{ color: 'rgba(245,243,238,0.7)' }}>
                      {site.hero_subtitle}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-4">
                    <a href={ctaHref} className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold transition-transform hover:scale-105" style={{ backgroundColor: gold, color: '#0B0B0D' }}>
                      {cta}
                      <ArrowRight className="w-4 h-4" />
                    </a>
                    {!hidden('About') && (
                      <a href="#about" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-medium border transition-colors hover:bg-white/5" style={{ borderColor: LINE, color: '#F5F3EE' }}>
                        {t.nav.about}
                      </a>
                    )}
                  </div>
                </div>

                <div className="relative ed-rise">
                  <div className="absolute -inset-6 rounded-[2rem] blur-3xl opacity-40 pointer-events-none" style={{ background: `radial-gradient(circle, ${gold} 0%, transparent 70%)` }} />
                  {site.hero_image ? (
                    <div className="relative aspect-[4/5] rounded-[1.75rem] overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
                      <img src={site.hero_image} alt={site.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 55%, rgba(11,11,13,0.55) 100%)' }} />
                    </div>
                  ) : (
                    <div className="relative aspect-[4/5] rounded-[1.75rem] overflow-hidden flex flex-col items-center justify-center gap-6" style={{ border: `1px solid ${LINE}`, background: 'radial-gradient(120% 90% at 50% 30%, rgba(201,162,75,0.10), transparent 60%), linear-gradient(160deg, #17171c 0%, #0c0c0f 100%)' }}>
                      <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ border: `1px solid ${gold}`, boxShadow: '0 0 40px rgba(201,162,75,0.25)' }}>
                        <span style={{ fontFamily: 'var(--font-fraunces), serif', color: gold, fontSize: '2.5rem' }}>{(site.name || 'N').charAt(0)}</span>
                      </div>
                      <div className="text-center px-6">
                        <div className="text-lg mb-2" style={{ fontFamily: 'var(--font-fraunces), serif', color: '#F5F3EE' }}>{site.name}</div>
                        <div className="mx-auto h-px w-12" style={{ backgroundColor: gold, opacity: 0.6 }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {stats.length > 0 && (
                <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgba(20,20,24,0.7)', border: `1px solid ${LINE}`, backdropFilter: 'blur(8px)' }}>
                  {stats.map((s, i) => (
                    <div key={i} className="px-8 py-6" style={i > 0 ? { borderLeft: `1px solid ${LINE}` } : {}}>
                      <div className="text-3xl font-medium mb-1" style={{ fontFamily: 'var(--font-fraunces), serif', color: gold }}>{s.k}</div>
                      <div className="text-xs uppercase tracking-wider" style={{ color: 'rgba(245,243,238,0.6)' }}>{s.v}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* =================== WHY US (rangee d'icones) =================== */}
        {Array.isArray(site.whyus) && site.whyus.length > 0 && (
          <section className="py-16 md:py-20" style={{ borderTop: `1px solid ${LINE}` }}>
            <div className="max-w-7xl mx-auto px-6 md:px-10">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10">
                {site.whyus.map((item: any, i: number) => (
                  <div key={i} className="flex gap-4">
                    <div className="shrink-0 mt-1 w-10 h-10 rounded-full flex items-center justify-center" style={{ border: `1px solid ${gold}` }}>
                      <Sparkles className="w-4 h-4" style={{ color: gold }} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold uppercase mb-2" style={{ letterSpacing: '0.08em' }}>{item.title}</h3>
                      <p className="text-sm leading-relaxed" style={{ color: 'rgba(245,243,238,0.6)' }}>{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* =================== ABOUT =================== */}
        {!hidden('About') && site.about && (
          <Reveal>
            <section id="about" className="py-28 md:py-36" style={{ borderTop: `1px solid ${LINE}` }}>
              <div className="max-w-4xl mx-auto px-6 md:px-10 text-center">
                <div className="text-xs font-medium tracking-[0.2em] uppercase mb-6" style={{ color: gold }}>
                  {t.sections.aboutKicker}
                </div>
                <h2 className="text-3xl md:text-5xl leading-tight mb-8" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                  {site.hero_title || site.name}
                </h2>
                <p className="text-lg leading-relaxed" style={{ color: 'rgba(245,243,238,0.75)' }}>
                  {site.about}
                </p>
              </div>
            </section>
          </Reveal>
        )}

        {/* =================== SECTIONS (services / menu / etc.) =================== */}
        {sections.length > 0 && !hidden('Services') && sections.map((sec: any, si: number) => (
          <section key={si} id={si === 0 ? 'services' : `section-${si}`} className="reveal py-28 md:py-36" style={{ borderTop: `1px solid ${LINE}` }}>
            <div className="max-w-7xl mx-auto px-6 md:px-10">
              <div className="text-center max-w-2xl mx-auto mb-20">
                <div className="text-xs font-medium tracking-[0.2em] uppercase mb-4" style={{ color: gold }}>
                  {t.sections.servicesKicker}
                </div>
                <h2 className="text-4xl md:text-5xl leading-tight" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                  {sec.name}
                </h2>
              </div>

              <div style={{ borderTop: `1px solid ${LINE}` }}>
                {(sec.items || []).map((s: any, i: number) => (
                  <div
                    key={i}
                    className="group grid md:grid-cols-2 gap-8 md:gap-14 items-center py-12 md:py-16"
                    style={{ borderBottom: `1px solid ${LINE}` }}
                  >
                    <div className={i % 2 === 1 ? 'md:order-2' : ''}>
                      <div className="flex items-baseline gap-5 mb-6">
                        <span className="text-5xl md:text-6xl leading-none" style={{ fontFamily: 'var(--font-fraunces), serif', color: gold }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="flex-1 h-px" style={{ backgroundColor: gold, opacity: 0.5 }} />
                        {s.price && (
                          <span className="text-sm font-semibold" style={{ color: gold }}>{s.price}</span>
                        )}
                      </div>
                      <h3 className="text-3xl md:text-4xl leading-tight mb-5" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                        {s.title}
                      </h3>
                      {s.description && (
                        <p className="text-lg leading-relaxed" style={{ color: 'rgba(245,243,238,0.65)' }}>
                          {s.description}
                        </p>
                      )}
                    </div>
                    {s.image && (
                      <div className={`relative w-full aspect-[4/3] rounded-2xl overflow-hidden ${i % 2 === 1 ? 'md:order-1' : ''}`} style={{ border: `1px solid ${LINE}` }}>
                        <img src={s.image} alt={s.title} className="noir-img w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                        <div className="noir-veil" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}

        {/* =================== SHOP =================== */}
        {(products.length > 0 || mode === 3) && !hidden('Shop') && (
          <section id="shop" className="reveal py-28 md:py-36" style={{ borderTop: `1px solid ${LINE}` }}>
            <div className="max-w-7xl mx-auto px-6 md:px-10">
              <div className="text-center max-w-2xl mx-auto mb-20">
                <div className="text-xs font-medium tracking-[0.2em] uppercase mb-4" style={{ color: gold }}>
                  {t.sections.shopKicker}
                </div>
                <h2 className="text-4xl md:text-5xl leading-tight" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                  {t.sections.shopTitle}
                </h2>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {products.map((p: any, i: number) => (
                  <ClickableProductCard key={i} product={p} primary={gold} lang={site.lang}>
                  <TiltCard className="group rounded-3xl overflow-hidden bg-[#141418] border border-white/[0.08]">
                    {p.image && (
                      <div className="relative w-full h-56 overflow-hidden">
                        <img src={p.image} alt={p.name} className="noir-img w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        <div className="noir-veil" />
                      </div>
                    )}
                    <div className="p-6">
                      <h3 className="text-lg mb-1" style={{ fontFamily: 'var(--font-fraunces), serif' }}>{p.name}</h3>
                      {p.price && <div className="text-sm font-semibold mb-4" style={{ color: gold }}>{p.price}</div>}
                      <AddToCartButton
                        id={p.id}
                        name={p.name}
                        priceNumber={p.priceNumber}
                        currency={p.currency || 'CAD'}
                        image={p.image}
                        primary={gold}
                        label={cartT.addToCart}
                      />
                      {p.cjVid && <ShippingEstimate siteId={site.id} cjVid={p.cjVid} primary={gold} deliveryLabel={t.labels.estimatedDelivery} daysLabel={t.labels.days} />}
                    </div>
                  </TiltCard>
                  </ClickableProductCard>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* =================== GALLERY =================== */}
        {gallery.length > 0 && !hidden('Gallery') && (
          <section id="gallery" className="reveal py-28 md:py-36" style={{ borderTop: `1px solid ${LINE}` }}>
            <div className="max-w-7xl mx-auto px-6 md:px-10">
              <div className="text-center max-w-2xl mx-auto mb-20">
                <div className="text-xs font-medium tracking-[0.2em] uppercase mb-4" style={{ color: gold }}>
                  {t.sections.galleryKicker}
                </div>
                <h2 className="text-4xl md:text-5xl leading-tight" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                  {t.sections.galleryTitle}
                </h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {gallery.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-2xl overflow-hidden group" style={{ border: `1px solid ${LINE}` }}>
                    <img src={url} alt="" className="noir-img w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    <div className="noir-veil" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* =================== TESTIMONIALS =================== */}
        {testimonials.length > 0 && !hidden('Reviews') && (
          <section id="testimonials" className="reveal py-28 md:py-36" style={{ borderTop: `1px solid ${LINE}` }}>
            <div className="max-w-7xl mx-auto px-6 md:px-10">
              <div className="text-center max-w-2xl mx-auto mb-20">
                <div className="text-xs font-medium tracking-[0.2em] uppercase mb-4" style={{ color: gold }}>
                  {t.sections.testimonialsKicker}
                </div>
                <h2 className="text-4xl md:text-5xl leading-tight" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                  {t.sections.testimonialsTitle}
                </h2>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {testimonials.map((r: any, i: number) => (
                  <div key={i} className="rounded-3xl p-8" style={{ backgroundColor: PANEL, border: `1px solid ${LINE}` }}>
                    <p className="leading-relaxed mb-6" style={{ color: 'rgba(245,243,238,0.8)' }}>&ldquo;{r.quote}&rdquo;</p>
                    <div className="flex items-center gap-3">
                      {r.avatar && <img src={r.avatar} alt={r.author} className="w-11 h-11 rounded-full object-cover" />}
                      <div>
                        <div className="text-sm font-semibold">{r.author}</div>
                        {r.role && <div className="text-xs" style={{ color: 'rgba(245,243,238,0.55)' }}>{r.role}</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* =================== CUSTOM PAGES =================== */}
        {(site.pages || []).filter((p: any) => p && (p.title || p.content || p.image)).map((page: any, pi: number) => (
          <section key={`page-${pi}`} id={`page-${pi}`} className="reveal py-28 md:py-36" style={{ borderTop: `1px solid ${LINE}` }}>
            <div className="max-w-4xl mx-auto px-6 md:px-10">
              <h2 className="text-3xl md:text-5xl font-semibold tracking-tight mb-10" style={{ color: gold }}>{page.title}</h2>
              {page.image && (
                <div className="relative w-full rounded-2xl overflow-hidden mb-10 aspect-[16/9]" style={{ border: `1px solid ${LINE}` }}>
                  <img src={page.image} alt={page.title || ''} className="noir-img w-full h-full object-cover" />
                </div>
              )}
              {page.content && (
                <div className="text-lg leading-relaxed whitespace-pre-line text-white/70">{page.content}</div>
              )}
            </div>
          </section>
        ))}

        {/* =================== CONTACT =================== */}
        {!hidden('Contact') && (
          <section id="contact" className="reveal py-28 md:py-36" style={{ borderTop: `1px solid ${LINE}` }}>
            <div className="max-w-3xl mx-auto px-6 md:px-10 text-center">
              <div className="text-xs font-medium tracking-[0.2em] uppercase mb-4" style={{ color: gold }}>
                {t.sections.contactKicker}
              </div>
              <h2 className="text-4xl md:text-5xl leading-tight mb-4" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                {t.sections.contactTitle}
              </h2>
              <p className="mb-12" style={{ color: 'rgba(245,243,238,0.7)' }}>{t.sections.contactSubtitle}</p>
              <ContactForm slug={site.slug} lang={site.lang} brand={gold} />
              <ContactMap lat={site.geo_lat} lng={site.geo_lng} className="mt-8 border" />
            </div>
          </section>
        )}
      </main>

      {/* =================== FOOTER =================== */}
      <footer className="py-16" style={{ borderTop: `1px solid ${LINE}`, backgroundColor: '#070709' }}>
        <div className="max-w-7xl mx-auto px-6 md:px-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-xl" style={{ fontFamily: 'var(--font-fraunces), serif' }}>{site.name}</div>
          <div className="flex items-center gap-5">
            {social.instagram && <a href={social.instagram} target="_blank" rel="noreferrer"><Instagram className="w-5 h-5" /></a>}
            {social.facebook && <a href={social.facebook} target="_blank" rel="noreferrer"><Facebook className="w-5 h-5" /></a>}
            {social.tiktok && <a href={social.tiktok} target="_blank" rel="noreferrer"><TikTok className="w-5 h-5" /></a>}
            {social.whatsapp && <a href={social.whatsapp} target="_blank" rel="noreferrer"><WhatsApp className="w-5 h-5" /></a>}
          </div>
        </div>
      </footer>
      {social.whatsapp && (
        <a
          href={`https://wa.me/${String(social.whatsapp).replace(/\D/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Contact us on WhatsApp"
          className="fixed bottom-6 right-6 z-40 flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] text-white shadow-2xl hover:scale-110 transition-transform"
        >
          <span className="absolute inset-0 rounded-full bg-[#25D366] animate-ping opacity-30" />
          <WhatsApp className="w-7 h-7 relative" />
        </a>
      )}

      <style>{`
        @keyframes ed-rise {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ed-rise { animation: ed-rise 0.9s ease-out both; }
        .noir-img { filter: saturate(0.85) brightness(0.85) contrast(1.06); }
        .noir-veil { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(120% 120% at 50% 32%, transparent 40%, rgba(11,11,13,0.75) 100%), linear-gradient(180deg, rgba(23,18,12,0.3), rgba(23,18,12,0.55)); }
      `}</style>
    </div>
  )
}
