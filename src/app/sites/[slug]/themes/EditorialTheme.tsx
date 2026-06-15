// src/app/sites/[slug]/themes/EditorialTheme.tsx
import Image from 'next/image'
import Link from 'next/link'
import {
  Phone,
  Mail,
  MapPin,
  Star,
  Quote,
  ArrowRight,
} from 'lucide-react'
import { Instagram, Facebook, TikTok, WhatsApp } from './BrandIcons'
import MobileNav from './MobileNav'
import ContactForm from '../ContactForm'
import {
  type Site,
  normalizeService,
  normalizeTestimonial,
  normalizeProduct,
} from './shared'
import { getDict } from './i18n'

// ---------- Premium Button ----------
function PremiumButton({
  children,
  href,
  variant = 'primary',
  brand,
}: {
  children: React.ReactNode
  href: string
  variant?: 'primary' | 'ghost'
  brand: string
}) {
  const base =
    'group relative inline-flex items-center gap-2 px-7 py-4 rounded-full font-medium overflow-hidden transition-all duration-300'

  if (variant === 'ghost') {
    return (
      <a
        href={href}
        className={`${base} bg-white/10 backdrop-blur-sm border border-white/30 text-white hover:bg-white/20`}
      >
        {children}
      </a>
    )
  }
  return (
    <a
      href={href}
      className={`${base} text-white shadow-xl hover:shadow-2xl hover:-translate-y-0.5`}
      style={{ backgroundColor: brand }}
    >
      {/* Shine sweep */}
      <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <span className="relative inline-flex items-center gap-2">{children}</span>
    </a>
  )
}

// ---------- Theme ----------
export default function EditorialTheme({ site }: { site: Site }) {
  const primary = site.primary_color || '#111111'
  const t = getDict(site.lang)
  const services = (site.services || []).map(normalizeService)
  const testimonials = (site.testimonials || []).map(normalizeTestimonial)
  const products = (site.products || []).map(normalizeProduct)
  const gallery: string[] = (site.gallery || []).filter((u: any) => typeof u === 'string' && u.length > 0 && u.startsWith('http'))
  const contact = site.contact || {}
  const social = site.social_links || {}
  const cta = site.cta || 'Contactez-nous'
  const ctaHref = products.length > 0 ? '#shop' : '#contact'

  return (
    <div
      className="min-h-screen bg-white text-neutral-900 antialiased"
      style={{ ['--brand' as any]: primary }}
    >
      {/* Scroll reveal keyframes (pure CSS, no JS) */}
      <style>{`
        @keyframes ed-rise {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ed-rise { animation: ed-rise 0.9s ease-out both; }
      `}</style>

      {/* =================== HEADER =================== */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-white/70 border-b border-black/5">
        <div className="max-w-7xl mx-auto px-6 md:px-10 h-20 flex items-center justify-between">
          <Link
            href={`/sites/${site.slug}`}
            className="font-serif text-2xl tracking-tight font-medium"
            style={{ fontFamily: 'var(--font-fraunces), serif' }}
          >
            {site.name}
          </Link>
          <nav className="hidden md:flex items-center gap-10 text-sm font-medium text-neutral-700">
            <a href="#home" className="hover:text-black transition-colors">{t.nav.home}</a>
            <a href="#about" className="hover:text-black transition-colors">{t.nav.about}</a>
            <a href="#services" className="hover:text-black transition-colors">{t.nav.services}</a>
            {products.length > 0 && (
              <a href="#shop" className="hover:text-black transition-colors">{t.nav.shop}</a>
            )}
            <a href="#gallery" className="hover:text-black transition-colors">{t.nav.gallery}</a>
            <a href="#testimonials" className="hover:text-black transition-colors">{t.nav.reviews}</a>
            <a href="#contact" className="hover:text-black transition-colors">{t.nav.contact}</a>
            <a
              href={ctaHref}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-medium shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
              style={{ backgroundColor: primary }}
            >
              {cta}
              <ArrowRight className="w-4 h-4" />
            </a>
          </nav>
        </div>
      </header>

      {/* Mobile Navigation */}
      <MobileNav site={site} cta={cta} ctaHref={ctaHref} />

      {/* =================== HERO =================== */}
      <section id="home" className="relative min-h-[92vh] flex items-center pt-20 overflow-hidden">
        {site.hero_image ? (
          <>
            <Image src={site.hero_image} alt="" fill priority sizes="100vw" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/55 to-black/80" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-950" />
        )}

        <div
          className="absolute inset-0 opacity-[0.08] mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />

        <div className="relative max-w-7xl mx-auto px-6 md:px-10 w-full">
          <div className="max-w-3xl text-white ed-rise">
            {site.slogan && (
              <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-xs font-medium tracking-[0.15em] uppercase max-w-full sm:max-w-none flex-wrap">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: primary }}
                />
                {site.slogan}
              </div>
            )}
            <h1
              className="font-serif text-5xl md:text-7xl lg:text-8xl leading-[0.95] tracking-tight mb-8"
              style={{ fontFamily: 'var(--font-fraunces), serif' }}
            >
              {site.hero_title || site.name}
            </h1>
            {site.hero_subtitle && (
              <p className="text-lg md:text-xl text-white/80 max-w-xl mb-10 leading-relaxed">
                {site.hero_subtitle}
              </p>
            )}
            <div className="flex flex-wrap gap-4">
              <PremiumButton href={ctaHref} brand={primary}>
                {cta}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </PremiumButton>
              <PremiumButton href="#services" variant="ghost" brand={primary}>
                {t.hero.viewServices}
              </PremiumButton>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/60 text-xs tracking-widest uppercase animate-pulse">
          {t.hero.scroll}
        </div>
      </section>

      {/* =================== ABOUT =================== */}
      {site.about && (
        <section id="about" className="py-28 md:py-36">
          <div className="max-w-5xl mx-auto px-6 md:px-10">
            <div className="grid md:grid-cols-[1fr_2fr] gap-16 items-start">
              <div>
                <div className="text-xs font-medium tracking-[0.2em] uppercase text-neutral-500 mb-4">
                  {t.sections.aboutKicker}
                </div>
                <div className="h-px w-12" style={{ backgroundColor: primary }} />
              </div>
              <div>
                <h2
                  className="font-serif text-4xl md:text-5xl leading-tight mb-8"
                  style={{ fontFamily: 'var(--font-fraunces), serif' }}
                >
                  {t.sections.aboutTitle}
                </h2>
                <p className="text-lg md:text-xl leading-relaxed text-neutral-700">
                  {site.about}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* =================== SERVICES =================== */}
      {services.length > 0 && (
        <section id="services" className="py-28 md:py-36 bg-neutral-50">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <div className="text-center max-w-2xl mx-auto mb-20">
              <div
                className="text-xs font-medium tracking-[0.2em] uppercase mb-4"
                style={{ color: primary }}
              >
                {t.sections.servicesKicker}
              </div>
              <h2
                className="font-serif text-4xl md:text-5xl leading-tight"
                style={{ fontFamily: 'var(--font-fraunces), serif' }}
              >
                {t.sections.servicesTitle}
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {services.map((s, i) => {
                const Icon = s.Icon
                const featured = i === 0 && services.length >= 3
                return (
                  <div
                    key={i}
                    className={`group relative p-8 md:p-10 rounded-3xl transition-all duration-500 ${
                      featured
                        ? 'bg-neutral-900 text-white shadow-2xl lg:row-span-2'
                        : 'bg-white border border-neutral-200/70 hover:border-transparent hover:shadow-xl hover:-translate-y-1'
                    }`}
                  >
                    <div
                      className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-6 transition-transform duration-300 group-hover:scale-110 ${
                        featured ? 'bg-white/10' : ''
                      }`}
                      style={
                        featured
                          ? {}
                          : { backgroundColor: `color-mix(in srgb, ${primary} 10%, white)` }
                      }
                    >
                      <Icon className="w-7 h-7" style={{ color: featured ? '#fff' : primary }} />
                    </div>
                    <h3
                      className="font-serif text-2xl md:text-3xl mb-4 leading-tight"
                      style={{ fontFamily: 'var(--font-fraunces), serif' }}
                    >
                      {s.title}
                    </h3>
                    <p
                      className={`leading-relaxed ${
                        featured ? 'text-white/70' : 'text-neutral-600'
                      }`}
                    >
                      {s.description}
                    </p>
                    {featured && (
                      <a
                        href="#contact"
                        className="inline-flex items-center gap-2 mt-8 text-sm font-medium group/link"
                      >
                        {t.labels.learnMore}
                        <ArrowRight className="w-4 h-4 group-hover/link:translate-x-1 transition-transform" />
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* =================== SHOP =================== */}
      {products.length > 0 && (
        <section id="shop" className="py-28 md:py-36">
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
                <div
                  key={i}
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
                      <a
                        href="#contact"
                        className="inline-flex items-center gap-1 text-sm font-medium text-neutral-900 group/link"
                      >
                        {t.labels.request}
                        <ArrowRight className="w-4 h-4 group-hover/link:translate-x-1 transition-transform" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* =================== GALLERY =================== */}
      {gallery.length > 0 && (
        <section id="gallery" className="py-28 md:py-36">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <div className="flex items-end justify-between mb-16 flex-wrap gap-6">
              <div>
                <div
                  className="text-xs font-medium tracking-[0.2em] uppercase mb-4"
                  style={{ color: primary }}
                >
                  {t.sections.galleryKicker}
                </div>
                <h2
                  className="font-serif text-4xl md:text-5xl leading-tight"
                  style={{ fontFamily: 'var(--font-fraunces), serif' }}
                >
                  {t.sections.galleryTitle}
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
              {gallery.slice(0, 9).map((url, i) => (
                <div
                  key={i}
                  className={`relative overflow-hidden rounded-2xl bg-neutral-100 group ${
                    i === 0 ? 'md:col-span-2 md:row-span-2' : ''
                  }`}
                  style={{ aspectRatio: i === 0 ? '1 / 1' : '4 / 5' }}
                >
                  <Image src={url} alt="" fill sizes="(max-width: 768px) 50vw, 33vw" className="object-cover transition-transform duration-700 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* =================== TESTIMONIALS =================== */}
      {testimonials.length > 0 && (
        <section id="testimonials" className="py-28 md:py-36 bg-neutral-950 text-white relative overflow-hidden">
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-20 blur-3xl"
            style={{ backgroundColor: primary }}
          />
          <div className="relative max-w-7xl mx-auto px-6 md:px-10">
            <div className="text-center max-w-2xl mx-auto mb-20">
              <div
                className="text-xs font-medium tracking-[0.2em] uppercase mb-4"
                style={{ color: primary }}
              >
                {t.sections.testimonialsKicker}
              </div>
              <h2
                className="font-serif text-4xl md:text-5xl leading-tight"
                style={{ fontFamily: 'var(--font-fraunces), serif' }}
              >
                {t.sections.testimonialsTitle}
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {testimonials.slice(0, 3).map((t, i) => (
                <div
                  key={i}
                  className="relative p-8 md:p-10 rounded-3xl bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-colors"
                >
                  <Quote className="w-10 h-10 mb-6 opacity-30" style={{ color: primary }} />
                  <div className="flex gap-1 mb-5">
                    {Array.from({ length: 5 }).map((_, k) => (
                      <Star
                        key={k}
                        className="w-4 h-4"
                        fill={k < t.rating ? primary : 'transparent'}
                        style={{ color: primary }}
                      />
                    ))}
                  </div>
                  <p className="text-lg leading-relaxed mb-8 text-white/90">"{t.content}"</p>
                  <div className="flex items-center gap-4 pt-6 border-t border-white/10">
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center font-medium text-sm"
                      style={{ backgroundColor: `color-mix(in srgb, ${primary} 30%, transparent)` }}
                    >
                      {t.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium">{t.name}</div>
                      {t.role && <div className="text-sm text-white/50">{t.role}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* =================== CONTACT =================== */}
      <section id="contact" className="py-28 md:py-36">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <div className="text-center max-w-2xl mx-auto mb-20">
            <div
              className="text-xs font-medium tracking-[0.2em] uppercase mb-4"
              style={{ color: primary }}
            >
              {t.sections.contactKicker}
            </div>
            <h2
              className="font-serif text-4xl md:text-5xl leading-tight mb-4"
              style={{ fontFamily: 'var(--font-fraunces), serif' }}
            >
              {t.sections.contactTitle}
            </h2>
            <p className="text-lg text-neutral-600">
              {t.sections.contactSubtitle}
            </p>
          </div>

          <div className="grid lg:grid-cols-[1.2fr_1fr] gap-10 lg:gap-16 items-start">
            <div className="bg-white border border-neutral-200/70 rounded-3xl p-8 md:p-10 shadow-sm">
              <ContactForm slug={site.slug} brand={primary} lang={site.lang} />
            </div>

            <div className="space-y-4">
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="flex items-center gap-5 p-6 rounded-2xl bg-neutral-50 hover:bg-white hover:shadow-md border border-transparent hover:border-neutral-200 transition-all">
                  <div
                    className="flex items-center justify-center w-12 h-12 rounded-xl shrink-0"
                    style={{ backgroundColor: `color-mix(in srgb, ${primary} 12%, white)` }}
                  >
                    <Phone className="w-5 h-5" style={{ color: primary }} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wider text-neutral-500 mb-1">{t.labels.phone}</div>
                    <div className="font-medium truncate">{contact.phone}</div>
                  </div>
                </a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-5 p-6 rounded-2xl bg-neutral-50 hover:bg-white hover:shadow-md border border-transparent hover:border-neutral-200 transition-all">
                  <div
                    className="flex items-center justify-center w-12 h-12 rounded-xl shrink-0"
                    style={{ backgroundColor: `color-mix(in srgb, ${primary} 12%, white)` }}
                  >
                    <Mail className="w-5 h-5" style={{ color: primary }} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wider text-neutral-500 mb-1">{t.labels.email}</div>
                    <div className="font-medium truncate">{contact.email}</div>
                  </div>
                </a>
              )}
              {contact.address && (
                <div className="flex items-start gap-5 p-6 rounded-2xl bg-neutral-50 border border-transparent">
                  <div
                    className="flex items-center justify-center w-12 h-12 rounded-xl shrink-0"
                    style={{ backgroundColor: `color-mix(in srgb, ${primary} 12%, white)` }}
                  >
                    <MapPin className="w-5 h-5" style={{ color: primary }} />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-neutral-500 mb-1">{t.labels.address}</div>
                    <div className="font-medium leading-snug">{contact.address}</div>
                  </div>
                </div>
              )}

              {(social.instagram || social.facebook || social.whatsapp || social.tiktok) && (
                <div className="pt-4">
                  <div className="text-xs uppercase tracking-wider text-neutral-500 mb-4 px-2">
                    {t.labels.followUs}
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    {social.instagram && (
                      <a href={social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="flex items-center justify-center w-12 h-12 rounded-xl bg-neutral-100 hover:bg-neutral-900 hover:text-white hover:-translate-y-0.5 transition-all">
                        <Instagram className="w-5 h-5" />
                      </a>
                    )}
                    {social.facebook && (
                      <a href={social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="flex items-center justify-center w-12 h-12 rounded-xl bg-neutral-100 hover:bg-neutral-900 hover:text-white hover:-translate-y-0.5 transition-all">
                        <Facebook className="w-5 h-5" />
                      </a>
                    )}
                    {social.tiktok && (
                      <a href={social.tiktok} target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="flex items-center justify-center w-12 h-12 rounded-xl bg-neutral-100 hover:bg-neutral-900 hover:text-white hover:-translate-y-0.5 transition-all">
                        <TikTok className="w-5 h-5" />
                      </a>
                    )}
                    {social.whatsapp && (
                      <a href={`https://wa.me/${String(social.whatsapp).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="flex items-center justify-center w-12 h-12 rounded-xl bg-neutral-100 hover:bg-[#25D366] hover:text-white hover:-translate-y-0.5 transition-all">
                        <WhatsApp className="w-5 h-5" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* =================== FOOTER =================== */}
      <footer className="bg-neutral-950 text-white py-16">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8 mb-12">
            <div>
              <div className="font-serif text-3xl mb-2" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                {site.name}
              </div>
              {site.slogan && <div className="text-white/60 text-sm">{site.slogan}</div>}
            </div>
            <nav className="flex gap-8 text-sm text-white/70">
              <a href="#about" className="hover:text-white transition-colors">{t.nav.about}</a>
              <a href="#services" className="hover:text-white transition-colors">{t.nav.services}</a>
              <a href="#contact" className="hover:text-white transition-colors">{t.nav.contact}</a>
            </nav>
          </div>
          <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-sm text-white/40">
            <div>© {new Date().getFullYear()} {site.name}. {t.labels.rightsReserved}</div>
            <div className="flex items-center gap-2">
              <span>{t.labels.poweredBy}</span>
              <a href="https://nexiora.ca" target="_blank" rel="noopener noreferrer" className="font-medium text-white/70 hover:text-white transition-colors">
                Nexiora
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp */}
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
    </div>
  )
}
