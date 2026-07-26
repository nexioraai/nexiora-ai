'use client'

import Link from 'next/link'
import { ArrowRight, Sparkles, Phone, Mail, MapPin } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Instagram, Facebook, TikTok, WhatsApp } from './BrandIcons'
import MobileNav from './MobileNav'
import ContactForm from '../ContactForm'
import {
  type Site,
  normalizeTestimonial,
  normalizeProduct,
  mockupsToProducts,
  ContactMap,
} from './shared'
import { getDict } from './i18n'
import Reveal from './Reveal'
import TiltCard from './TiltCard'
import ClickableProductCard from './ClickableProductCard'
import AddToCartButton from './AddToCartButton'
import ShippingEstimate from './ShippingEstimate'
import { getCartLabels } from './cartLabels'
import { socialUrl } from '@/lib/social'

// Palette Gusto clair-editorial (fixe, signature du theme)
const CREAM = '#EFE6D4'
const CREAM_DEEP = '#EFE6D4'
const INK = '#B08847'
const GOLD = '#B08847'

export default function VifTheme({ site }: { site: Site }) {
  const hidden = (name: string) => (site.hidden_sections || []).includes(name)
  const t = getDict(site.lang)
  const cartT = getCartLabels(site.lang)
  const sections = site.sections || []
  const testimonials = (site.testimonials || []).map(normalizeTestimonial)
  const products = [...(site.products || []).map(normalizeProduct), ...mockupsToProducts(site)]
  const gallery: string[] = (site.gallery || []).filter(
    (u: any) => typeof u === 'string' && u.length > 0 && u.startsWith('http')
  )
  const contact = site.contact || {}
  const social = site.social_links || {}
  const cta = site.cta || 'Contactez-nous'
  const mode = site.mode || 1
  const ctaHref = (mode !== 1 && (products.length > 0 || mode === 3)) ? '#shop' : '#contact'

  const heroTitle = site.hero_title || site.name
  const heroWords = heroTitle.trim().split(/\s+/)
  const heroLead = heroWords.slice(0, Math.max(1, heroWords.length - 2)).join(' ')
  const heroEmph = heroWords.slice(Math.max(1, heroWords.length - 2)).join(' ')

  // Parallax leger sur le curseur (Mouse-reactive movement Gusto)
  const heroRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = heroRef.current
    if (!el) return
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5
      const y = (e.clientY - r.top) / r.height - 0.5
      el.style.setProperty('--px', `${x * 12}px`)
      el.style.setProperty('--py', `${y * 12}px`)
    }
    el.addEventListener('mousemove', onMove)
    return () => el.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <div
      className="min-h-screen antialiased"
      style={{
        background: `radial-gradient(1100px 500px at 90% -10%, rgba(176,136,71,0.10), transparent 60%), ${CREAM}`,
        color: INK,
        ['--brand' as any]: GOLD,
      }}
    >
      {/* =================== HEADER =================== */}
      <header
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md"
        style={{ backgroundColor: 'rgba(246,241,231,0.78)', borderBottom: `1px solid rgba(20,18,16,0.08)` }}
      >
        <div className="max-w-7xl mx-auto px-6 md:px-10 h-20 flex items-center justify-between">
          <Link
            href="#home"
            className="text-2xl tracking-tight font-medium"
            style={{ fontFamily: 'var(--font-fraunces), serif' }}
          >
            {site.name}
          </Link>
          <nav className="hidden md:flex items-center gap-10 text-sm font-medium" style={{ color: 'rgba(20,18,16,0.7)' }}>
            {!hidden('Home') && <a href="#home" className="hover:opacity-100 transition-opacity">{t.nav.home}</a>}
            {!hidden('About') && <a href="#about" className="hover:opacity-100 transition-opacity">{t.nav.about}</a>}
            {!hidden('Services') && <a href="#services" className="hover:opacity-100 transition-opacity">{sections[0]?.name || t.nav.services}</a>}
            {mode !== 1 && (products.length > 0 || mode === 3) && !hidden('Shop') && (
              <a href="#shop" className="hover:opacity-100 transition-opacity">{t.nav.shop}</a>
            )}
            {!hidden('Gallery') && <a href="#gallery" className="hover:opacity-100 transition-opacity">{t.nav.gallery}</a>}
            {!hidden('Reviews') && <a href="#testimonials" className="hover:opacity-100 transition-opacity">{t.nav.reviews}</a>}
            {(site.pages || []).filter((p: any) => p && p.title).map((page: any, pi: number) => (
              <a key={`navpage-${pi}`} href={`#page-${pi}`} className="hover:opacity-100 transition-opacity">{page.title}</a>
            ))}
            {!hidden('Contact') && <a href="#contact" className="hover:opacity-100 transition-opacity">{t.nav.contact}</a>}
          </nav>
        </div>
      </header>

      <MobileNav site={site} cta={cta} ctaHref={ctaHref} />

      <main>
        {/* =================== HERO (Gusto scroll-driven) =================== */}
        {!hidden('Home') && (
          <section id="home" ref={heroRef} className="relative min-h-[100vh] flex items-center px-4 md:px-8 py-24">
              <div className="relative w-full max-w-[1400px] mx-auto rounded-[2rem] overflow-hidden py-16 md:py-20" style={{ background: `linear-gradient(180deg, #F1E9D6 0%, #EADFC4 100%)`, boxShadow: `0 30px 80px -30px rgba(20,18,16,0.25)`, border: `1px solid rgba(20,18,16,0.05)` }}>
            {/* Badge scene (Gusto) */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-1.5rem)] sm:w-auto px-4 sm:px-6 py-2.5 rounded-full flex items-center justify-center gap-2 text-[10px] sm:text-xs font-semibold tracking-[0.08em] sm:tracking-[0.3em] uppercase shadow-lg text-center leading-snug" style={{ backgroundColor: INK, color: CREAM }}>
              <Sparkles className="w-3.5 h-3.5" style={{ color: GOLD }} />
              {site.slogan || t.sections.aboutKicker}
            </div>

            <div className="relative max-w-7xl mx-auto px-6 md:px-10 w-full grid lg:grid-cols-2 gap-10 items-center pt-16">
              <div className="ed-rise order-2 lg:order-1">
                <h1
                  className="text-5xl md:text-6xl xl:text-7xl leading-[1.05] font-medium mb-8"
                  style={{ fontFamily: 'var(--font-fraunces), serif' }}
                >
                  {heroLead}
                  {heroEmph && (
                    <>
                      {' '}
                      <em className="italic font-normal" style={{ color: GOLD }}>{heroEmph}</em>
                    </>
                  )}
                </h1>
                {site.hero_subtitle && (
                  <p className="text-lg leading-relaxed mb-10 max-w-xl" style={{ color: 'rgba(20,18,16,0.7)' }}>
                    {site.hero_subtitle}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-4">
                  <a
                    href={ctaHref}
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold transition-transform hover:scale-105"
                    style={{ backgroundColor: INK, color: CREAM }}
                  >
                    {cta}
                    <ArrowRight className="w-4 h-4" />
                  </a>
                  {!hidden('About') && (
                    <a
                      href="#about"
                      className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-medium border transition-colors"
                      style={{ borderColor: 'rgba(20,18,16,0.15)', color: INK }}
                    >
                      {t.nav.about}
                    </a>
                  )}
                </div>
              </div>

              {/* Hero visuel + effet parallax curseur + petales flottants */}
              <div className="relative flex items-center justify-center min-h-[420px] order-1 lg:order-2">
                {/* Ingredients flottants premier plan (Gusto) */}
                {/* Tomates cerises */}
                <svg className="absolute z-20 -top-6 left-16 w-14 h-14 float-a drop-shadow-lg" viewBox="0 0 100 100"><defs><radialGradient id="tom1" cx="35%" cy="35%"><stop offset="0%" stopColor="#FF7B6B"/><stop offset="100%" stopColor="#C0332A"/></radialGradient></defs><circle cx="50" cy="55" r="34" fill="url(#tom1)"/><path d="M50 20 L 45 8 M50 20 L 55 10 M50 20 L 50 5" stroke="#4A7A3A" strokeWidth="3" strokeLinecap="round" fill="none"/></svg>
                <svg className="absolute z-20 top-1/2 -right-4 w-16 h-16 float-b drop-shadow-lg" viewBox="0 0 100 100"><defs><radialGradient id="tom2" cx="35%" cy="35%"><stop offset="0%" stopColor="#FF8878"/><stop offset="100%" stopColor="#B12E24"/></radialGradient></defs><circle cx="50" cy="55" r="36" fill="url(#tom2)"/><path d="M50 20 L 44 8 M50 20 L 56 10" stroke="#4A7A3A" strokeWidth="3" strokeLinecap="round" fill="none"/></svg>

                {/* Feuilles basilic */}
                <svg className="absolute z-20 top-4 right-24 w-20 h-20 float-c drop-shadow-md" viewBox="0 0 100 100"><path d="M50 15 C 78 28, 82 60, 52 85 C 22 60, 22 28, 50 15 Z" fill="#5C8B3E"/><path d="M50 15 L 50 85" stroke="#3D6027" strokeWidth="1.5" opacity="0.7"/></svg>
                <svg className="absolute z-20 bottom-4 -left-4 w-16 h-16 float-a drop-shadow-md" style={{animationDelay:'1.2s'}} viewBox="0 0 100 100"><path d="M50 15 C 78 28, 82 60, 52 85 C 22 60, 22 28, 50 15 Z" fill="#7BA84D"/><path d="M50 15 L 50 85" stroke="#3D6027" strokeWidth="1.5" opacity="0.7"/></svg>
                <svg className="absolute z-20 top-24 -left-6 w-12 h-12 float-b drop-shadow-md" style={{animationDelay:'0.7s'}} viewBox="0 0 100 100"><path d="M50 15 C 78 28, 82 60, 52 85 C 22 60, 22 28, 50 15 Z" fill="#6C9743"/></svg>

                {/* Eclats de parmesan */}
                <svg className="absolute z-20 bottom-16 right-8 w-14 h-10 float-c drop-shadow-md" style={{animationDelay:'0.4s'}} viewBox="0 0 100 60"><path d="M10 30 L 30 10 L 70 15 L 90 40 L 60 55 L 20 50 Z" fill="#F0D68C" stroke="#C5A55A" strokeWidth="1.5"/></svg>
                <svg className="absolute z-20 -bottom-2 right-1/3 w-10 h-8 float-a drop-shadow-md" style={{animationDelay:'1.8s'}} viewBox="0 0 100 60"><path d="M15 25 L 40 10 L 85 20 L 75 50 L 25 45 Z" fill="#EFCE7C" stroke="#B99648" strokeWidth="1.5"/></svg>

                {/* Image detouree "flottante" facon Gusto (pas de disque plein) */}
                <div className="relative w-[160%] max-w-none sm:w-full sm:max-w-[560px] aspect-square flex items-center justify-center" style={{ transform: 'translate(var(--px,0), var(--py,0))', transition: 'transform 0.2s ease-out' }}>
                  {/* ombre douce sous l'image */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[70%] h-8 rounded-full blur-2xl opacity-40" style={{ backgroundColor: 'rgba(20,18,16,0.35)' }} />
                  {site.hero_image ? (
                    <img
                      src={site.hero_image}
                      alt={site.name}
                      className="relative w-full h-full object-contain drop-shadow-2xl hero-float"
                      style={{ filter: 'drop-shadow(0 30px 40px rgba(20,18,16,0.25))' }}
                    />
                  ) : (
                    <div className="relative w-[70%] h-[70%] flex items-center justify-center rounded-full" style={{ backgroundColor: CREAM_DEEP, boxShadow: '0 30px 60px -20px rgba(20,18,16,0.25)' }}>
                      <span style={{ fontFamily: 'var(--font-fraunces), serif', color: GOLD, fontSize: '6rem', opacity: 0.55 }}>
                        {(site.name || 'N').charAt(0)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Sceau circulaire (tampon rond facon Gusto) */}
                <div className="flex absolute top-4 right-0 md:top-16 md:right-8 z-30 w-16 h-16 md:w-24 md:h-24 items-center justify-center pointer-events-none">
                  <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full animate-spin-slow">
                    <defs>
                      <path id="seal-curve" d="M 50,50 m -38,0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0" />
                    </defs>
                    <text fontSize="8" fontWeight="600" letterSpacing="2" fill={GOLD} style={{ fontFamily: 'var(--font-fraunces), serif', textTransform: 'uppercase' }}>
                      <textPath href="#seal-curve" startOffset="0">
                        {`${(site.name || 'Brand').slice(0, 18)} · Premium · `}
                      </textPath>
                    </text>
                    <circle cx="50" cy="50" r="30" fill="none" stroke={GOLD} strokeWidth="0.5" opacity="0.4" />
                  </svg>
                  <span className="text-2xl" style={{ fontFamily: 'var(--font-fraunces), serif', color: INK }}>
                    {(site.name || 'N').charAt(0)}
                  </span>
                </div>

                {/* Timeline verticale 01/02/03 (Gusto) */}
                {Array.isArray(site.whyus) && site.whyus.length > 0 && (
                  <div className="flex absolute -right-3 xl:right-6 top-1/2 -translate-y-1/2 flex-col gap-3 xl:gap-6 z-20 w-[32%] xl:w-auto xl:max-w-[200px]">
                    {site.whyus.slice(0, 3).map((w: any, i: number) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="flex flex-col items-center pt-1">
                          <span className="text-[10px] xl:text-lg font-medium" style={{ color: GOLD, fontFamily: 'var(--font-fraunces), serif' }}>
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          {i < Math.min(2, (site.whyus?.length ?? 0) - 1) && (
                            <span className="mt-2 h-10 w-px" style={{ backgroundColor: 'rgba(20,18,16,0.25)' }} />
                          )}
                        </div>
                        <div className="max-w-[85px] xl:max-w-[140px]">
                          <div className="w-1.5 h-1.5 rounded-full mt-2 mb-2" style={{ backgroundColor: GOLD }} />
                          <div className="text-[7px] xl:text-xs font-semibold uppercase leading-tight" style={{ letterSpacing: '0.05em', color: GOLD }}>{w.title}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-xs tracking-[0.3em] uppercase" style={{ color: 'rgba(20,18,16,0.5)' }}>
              Scroll ↓
            </div>
              </div>
          </section>
        )}

        {/* =================== ABOUT =================== */}
        {!hidden('About') && site.about && (
          <Reveal>
            <section id="about" className="py-28 md:py-36" style={{ borderTop: '1px solid rgba(20,18,16,0.08)' }}>
              <div className="max-w-4xl mx-auto px-6 md:px-10 text-center">
                <div className="text-xs font-medium tracking-[0.25em] uppercase mb-6" style={{ color: GOLD }}>
                  {t.sections.aboutKicker}
                </div>
                <h2 className="text-3xl md:text-5xl leading-tight mb-8" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                  {site.hero_title || site.name}
                </h2>
                <p className="text-lg leading-relaxed" style={{ color: 'rgba(20,18,16,0.72)' }}>
                  {site.about}
                </p>
              </div>
            </section>
          </Reveal>
        )}

        {/* =================== WHY US (rangee d'icones cerclees, Gusto) =================== */}
        {Array.isArray(site.whyus) && site.whyus.length > 0 && (
          <section className="py-20" style={{ borderTop: '1px solid rgba(20,18,16,0.08)', backgroundColor: CREAM_DEEP }}>
            <div className="max-w-6xl mx-auto px-6 md:px-10">
              <div className="grid sm:grid-cols-3 gap-8 md:gap-12">
                {site.whyus.slice(0, 3).map((item: any, i: number) => (
                  <div key={i} className="flex items-start gap-4">
                    <div className="shrink-0 w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: CREAM, border: `1px solid rgba(20,18,16,0.1)` }}>
                      <Sparkles className="w-5 h-5" style={{ color: GOLD }} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold uppercase mb-2" style={{ letterSpacing: '0.1em' }}>{item.title}</h3>
                      <p className="text-sm leading-relaxed" style={{ color: 'rgba(20,18,16,0.65)' }}>{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* =================== SECTIONS =================== */}
        {sections.length > 0 && !hidden('Services') && sections.map((sec: any, si: number) => (
          <section key={si} id={si === 0 ? 'services' : `section-${si}`} className="reveal py-28 md:py-36" style={{ borderTop: '1px solid rgba(20,18,16,0.08)' }}>
            <div className="max-w-7xl mx-auto px-6 md:px-10">
              <div className="text-center max-w-2xl mx-auto mb-20">
                <div className="text-xs font-medium tracking-[0.25em] uppercase mb-4" style={{ color: GOLD }}>
                  {t.sections.servicesKicker}
                </div>
                <h2 className="text-4xl md:text-5xl leading-tight" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                  {sec.name}
                </h2>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {(sec.items || []).map((s: any, i: number) => (
                  <TiltCard
                    key={i}
                    className="group relative rounded-3xl overflow-hidden transition-all duration-500 hover:-translate-y-1 bg-white border border-black/[0.06] hover:shadow-xl"
                  >
                    {s.image && (
                      <div className="relative w-full h-48 overflow-hidden">
                        <img src={s.image} alt={s.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      </div>
                    )}
                    <div className="p-7">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <h3 className="text-xl md:text-2xl leading-tight" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                          {s.title}
                        </h3>
                        {s.price && (
                          <span className="shrink-0 text-sm font-semibold px-3 py-1 rounded-full" style={{ color: GOLD, backgroundColor: CREAM_DEEP }}>
                            {s.price}
                          </span>
                        )}
                      </div>
                      {s.description && (
                        <p className="leading-relaxed text-sm" style={{ color: 'rgba(20,18,16,0.65)' }}>
                          {s.description}
                        </p>
                      )}
                    </div>
                  </TiltCard>
                ))}
              </div>
            </div>
          </section>
        ))}

        {/* =================== SHOP =================== */}
        {mode !== 1 && (products.length > 0 || mode === 3) && !hidden('Shop') && (
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
                {products.map((p: any, i: number) => (
                  <ClickableProductCard key={i} product={p} primary={INK} lang={site.lang}>
                  <TiltCard className="group rounded-3xl overflow-hidden bg-white border border-black/[0.06]">
                    {p.image && (
                      <div className="relative w-full h-56 overflow-hidden">
                        <img src={p.image} alt={p.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      </div>
                    )}
                    <div className="p-6">
                      <h3 className="text-lg mb-1" style={{ fontFamily: 'var(--font-fraunces), serif' }}>{p.name}</h3>
                      {p.price && <div className="text-sm font-semibold mb-4" style={{ color: GOLD }}>{p.price}</div>}
                      <AddToCartButton
                        id={p.id}
                        name={p.name}
                        priceNumber={p.priceNumber}
                        currency={p.currency || 'CAD'}
                        image={p.image}
                        primary={INK}
                        label={cartT.addToCart}
                      />
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
        )}

        {/* =================== GALLERY =================== */}
        {gallery.length > 0 && !hidden('Gallery') && (
          <section id="gallery" className="reveal py-28 md:py-36" style={{ borderTop: '1px solid rgba(20,18,16,0.08)' }}>
            <div className="max-w-7xl mx-auto px-6 md:px-10">
              <div className="text-center max-w-2xl mx-auto mb-20">
                <div className="text-xs font-medium tracking-[0.25em] uppercase mb-4" style={{ color: GOLD }}>
                  {t.sections.galleryKicker}
                </div>
                <h2 className="text-4xl md:text-5xl leading-tight" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                  {t.sections.galleryTitle}
                </h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {gallery.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-2xl overflow-hidden group">
                    <img src={url} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* =================== TESTIMONIALS =================== */}
        {testimonials.length > 0 && !hidden('Reviews') && (
          <section id="testimonials" className="reveal py-28 md:py-36" style={{ borderTop: '1px solid rgba(20,18,16,0.08)', backgroundColor: CREAM_DEEP }}>
            <div className="max-w-7xl mx-auto px-6 md:px-10">
              <div className="text-center max-w-2xl mx-auto mb-20">
                <div className="text-xs font-medium tracking-[0.25em] uppercase mb-4" style={{ color: GOLD }}>
                  {t.sections.testimonialsKicker}
                </div>
                <h2 className="text-4xl md:text-5xl leading-tight" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                  {t.sections.testimonialsTitle}
                </h2>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {testimonials.map((r: any, i: number) => (
                  <div key={i} className="rounded-3xl p-8 bg-white border border-black/[0.06]">
                    <p className="leading-relaxed mb-6" style={{ color: 'rgba(20,18,16,0.8)' }}>&ldquo;{r.quote}&rdquo;</p>
                    <div className="flex items-center gap-3">
                      {r.avatar && <img src={r.avatar} alt={r.author} className="w-11 h-11 rounded-full object-cover" />}
                      <div>
                        <div className="text-sm font-semibold">{r.author}</div>
                        {r.role && <div className="text-xs" style={{ color: 'rgba(20,18,16,0.55)' }}>{r.role}</div>}
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
          <section key={`page-${pi}`} id={`page-${pi}`} className="reveal py-28 md:py-36" style={{ borderTop: '1px solid rgba(20,18,16,0.08)' }}>
            <div className="max-w-4xl mx-auto px-6 md:px-10">
              <h2 className="text-3xl md:text-5xl font-semibold tracking-tight mb-10" style={{ color: GOLD }}>{page.title}</h2>
              {page.image && (
                <div className="relative w-full rounded-2xl overflow-hidden mb-10 aspect-[16/9]" style={{ border: '1px solid rgba(20,18,16,0.10)' }}>
                  <img src={page.image} alt={page.title || ''} className="w-full h-full object-cover" />
                </div>
              )}
              {page.content && (
                <div className="text-lg leading-relaxed whitespace-pre-line" style={{ color: 'rgba(20,18,16,0.72)' }}>{page.content}</div>
              )}
            </div>
          </section>
        ))}

        {/* =================== CONTACT =================== */}
        {!hidden('Contact') && (
          <section id="contact" className="reveal py-28 md:py-36" style={{ borderTop: '1px solid rgba(20,18,16,0.08)' }}>
            <div className="max-w-3xl mx-auto px-6 md:px-10 text-center">
              <div className="text-xs font-medium tracking-[0.25em] uppercase mb-4" style={{ color: GOLD }}>
                {t.sections.contactKicker}
              </div>
              <h2 className="text-4xl md:text-5xl leading-tight mb-4" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                {t.sections.contactTitle}
              </h2>
              <p className="mb-12" style={{ color: 'rgba(20,18,16,0.65)' }}>{t.sections.contactSubtitle}</p>
              <ContactForm slug={site.slug} lang={site.lang} brand={INK} />

              <div className="grid sm:grid-cols-3 gap-4 mt-10 text-left">
                {contact.phone && (
                  <a href={`tel:${contact.phone}`} className="flex items-center gap-4 p-5 rounded-2xl border transition-all" style={{ borderColor: 'rgba(20,18,16,0.1)', backgroundColor: 'rgba(20,18,16,0.02)' }}>
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0" style={{ backgroundColor: `${GOLD}20` }}>
                      <Phone className="w-4 h-4" style={{ color: GOLD }} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.15em] mb-0.5" style={{ color: 'rgba(20,18,16,0.45)' }}>{t.labels.phone}</div>
                      <div className="text-sm font-medium truncate" style={{ color: INK }}>{contact.phone}</div>
                    </div>
                  </a>
                )}
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="flex items-center gap-4 p-5 rounded-2xl border transition-all" style={{ borderColor: 'rgba(20,18,16,0.1)', backgroundColor: 'rgba(20,18,16,0.02)' }}>
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0" style={{ backgroundColor: `${GOLD}20` }}>
                      <Mail className="w-4 h-4" style={{ color: GOLD }} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.15em] mb-0.5" style={{ color: 'rgba(20,18,16,0.45)' }}>{t.labels.email}</div>
                      <div className="text-sm font-medium truncate" style={{ color: INK }}>{contact.email}</div>
                    </div>
                  </a>
                )}
                {contact.address && (
                  <div className="flex items-center gap-4 p-5 rounded-2xl border" style={{ borderColor: 'rgba(20,18,16,0.1)', backgroundColor: 'rgba(20,18,16,0.02)' }}>
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0" style={{ backgroundColor: `${GOLD}20` }}>
                      <MapPin className="w-4 h-4" style={{ color: GOLD }} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.15em] mb-0.5" style={{ color: 'rgba(20,18,16,0.45)' }}>{t.labels.address}</div>
                      <div className="text-sm font-medium leading-snug" style={{ color: INK }}>{contact.address}</div>
                    </div>
                  </div>
                )}
              </div>

              <ContactMap lat={site.geo_lat} lng={site.geo_lng} accent={GOLD} dark={false} className="mt-8" />
            </div>
          </section>
        )}
      </main>

      {/* =================== FOOTER =================== */}
      <footer className="py-16" style={{ borderTop: '1px solid rgba(20,18,16,0.08)', backgroundColor: CREAM_DEEP }}>
        <div className="max-w-7xl mx-auto px-6 md:px-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-xl" style={{ fontFamily: 'var(--font-fraunces), serif' }}>{site.name}</div>
          <div className="flex items-center gap-5" style={{ color: INK }}>
            {socialUrl('instagram', social.instagram) && <a href={socialUrl('instagram', social.instagram)!} target="_blank" rel="noreferrer"><Instagram className="w-5 h-5" /></a>}
            {socialUrl('facebook', social.facebook) && <a href={socialUrl('facebook', social.facebook)!} target="_blank" rel="noreferrer"><Facebook className="w-5 h-5" /></a>}
            {socialUrl('tiktok', social.tiktok) && <a href={socialUrl('tiktok', social.tiktok)!} target="_blank" rel="noreferrer"><TikTok className="w-5 h-5" /></a>}
            {socialUrl('whatsapp', social.whatsapp) && <a href={socialUrl('whatsapp', social.whatsapp)!} target="_blank" rel="noreferrer"><WhatsApp className="w-5 h-5" /></a>}
          </div>
        </div>
      </footer>
      {social.whatsapp && (
        <a
          href={socialUrl('whatsapp', social.whatsapp)!}
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
        /* Scrollbar styling */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--brand, #888); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { opacity: 0.8; }
        html { scrollbar-width: thin; scrollbar-color: var(--brand, #888) transparent; }
        @keyframes ed-rise {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ed-rise { animation: ed-rise 0.9s ease-out both; }
        @keyframes float-a { 0%,100% { transform: translateY(0) rotate(-8deg); } 50% { transform: translateY(-14px) rotate(4deg); } }
        @keyframes float-b { 0%,100% { transform: translateY(0) rotate(6deg); } 50% { transform: translateY(-10px) rotate(-6deg); } }
        @keyframes float-c { 0%,100% { transform: translateY(0) rotate(-4deg); } 50% { transform: translateY(-16px) rotate(8deg); } }
        .float-a { animation: float-a 6s ease-in-out infinite; }
        .float-b { animation: float-b 7s ease-in-out infinite 0.5s; }
        .float-c { animation: float-c 8s ease-in-out infinite 1s; }
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 24s linear infinite; }
      `}</style>
    </div>
  )
}
