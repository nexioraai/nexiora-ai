// src/app/sites/[slug]/themes/AuroraTheme.tsx
import Image from 'next/image'
import Link from 'next/link'
import {
  Phone,
  Mail,
  MapPin,
  Star,
  Quote,
  ArrowRight,
  Truck,
} from 'lucide-react'
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
import { getCartLabels } from './cartLabels'
import { socialUrl } from '@/lib/social'
import StorefrontDense from './StorefrontDense'
import CatalogSearch from './CatalogSearch'

export default function AuroraTheme({ site }: { site: Site }) {
  const hidden = (name: string) => (site.hidden_sections || []).includes(name)
  const primary = site.primary_color || '#6366f1'
  const t = getDict(site.lang)
  const cartT = getCartLabels(site.lang)
  const testimonials = (site.testimonials || []).map(normalizeTestimonial)
  const products = [...(site.products || []).map(normalizeProduct), ...mockupsToProducts(site)]
  const gallery: string[] = (site.gallery || []).filter((u: any) => typeof u === 'string' && u.length > 0 && u.startsWith('http'))
  const contact = site.contact || {}
  const social = site.social_links || {}

  const whyWords: Record<string, string> = { fr: 'Pourquoi', en: 'Why', es: 'Por qué', ar: 'لماذا', pt: 'Porquê', de: 'Warum', it: 'Perché' }
  const missionWords: Record<string, string> = { fr: 'Notre mission', en: 'Our mission', es: 'Nuestra misión', ar: 'مهمتنا', pt: 'Nossa missão', de: 'Unsere Mission', it: 'La nostra missione' }
  const visionWords: Record<string, string> = { fr: 'Notre vision', en: 'Our vision', es: 'Nuestra visión', ar: 'رؤيتنا', pt: 'Nossa visão', de: 'Unsere Vision', it: 'La nostra visione' }
  const whyWord = whyWords[site.lang || 'fr'] || whyWords.en
  const missionWord = missionWords[site.lang || 'fr'] || missionWords.en
  const visionWord = visionWords[site.lang || 'fr'] || visionWords.en

  const cta = site.cta || 'Contactez-nous'
  const mode = site.mode || 1
  const isShop = mode !== 1 && (products.length > 0 || mode === 3) && !hidden('Shop')
  const ctaHref = isShop ? '#shop' : '#contact'
  const auraB = `color-mix(in srgb, ${primary} 45%, #ffffff)`

  const L = (fr: string, en: string, es: string, ar: string, pt: string, de: string, it: string) =>
    site.lang === 'en' ? en : site.lang === 'es' ? es : site.lang === 'ar' ? ar : site.lang === 'pt' ? pt : site.lang === 'de' ? de : site.lang === 'it' ? it : fr

  const deliveryTag = L('Livraison suivie', 'Tracked delivery', 'Envío con seguimiento', 'شحن متتبع', 'Entrega rastreada', 'Verfolgte Lieferung', 'Spedizione tracciata')

  const showCatalogSearch = isShop && site.dropship_type !== 'pod_brand'

  return (
    <div
      className="min-h-screen bg-[#fafafa] text-neutral-900 antialiased overflow-x-hidden"
      style={{ ['--brand' as any]: primary }}
    >
      <style>{`
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--brand, #888); border-radius: 3px; }
        html { scrollbar-width: thin; scrollbar-color: var(--brand, #888) transparent; }

        @keyframes au-rise { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: translateY(0); } }
        .au-rise { animation: au-rise 0.9s cubic-bezier(0.16,1,0.3,1) both; }

        @keyframes au-float { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-16px) rotate(1.5deg); } }
        .au-float { animation: au-float 7s ease-in-out infinite; }

        @keyframes au-drift { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(30px,-20px) scale(1.08); } 66% { transform: translate(-20px,25px) scale(0.96); } }
        .au-blob { animation: au-drift 18s ease-in-out infinite; }
      `}</style>

      {/* HEADER (delivery tag integrated, no full-width top bar) */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 border-b border-black/5">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link href="#home" className="text-xl md:text-2xl font-semibold tracking-tight shrink-0">
              {site.name}
            </Link>
            {isShop && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${primary} 10%, white)`, color: primary }}>
                <Truck className="w-3.5 h-3.5" />
                {deliveryTag}
              </span>
            )}
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-neutral-600">
            {!hidden('Home') && <a href="#home" className="hover:text-neutral-900 transition-colors">{t.nav.home}</a>}
            {!hidden('About') && <a href="#about" className="hover:text-neutral-900 transition-colors">{t.nav.about}</a>}
            {isShop && <a href="#grid" className="hover:text-neutral-900 transition-colors">{t.nav.shop}</a>}
            {testimonials.length > 0 && !hidden('Reviews') && <a href="#testimonials" className="hover:text-neutral-900 transition-colors">{t.nav.reviews}</a>}
            {!hidden('Contact') && <a href="#contact" className="hover:text-neutral-900 transition-colors">{t.nav.contact}</a>}
          </nav>
          <a
            href={ctaHref}
            className="hidden md:inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-white shrink-0 transition hover:-translate-y-0.5"
            style={{ backgroundColor: primary }}
          >
            {isShop ? t.nav.shop : cta}
          </a>
        </div>
      </header>

      <MobileNav site={site} cta={cta} ctaHref={ctaHref} />

      <main id="home">
        {isShop ? (
          <StorefrontDense
          slug={site.slug}
            products={products}
            primary={primary}
            siteId={site.id}
            siteName={site.name}
            lang={site.lang}
            heroTitle={site.hero_title}
            heroSubtitle={site.hero_subtitle}
            heroImage={site.hero_image}
            slogan={site.slogan}
            searchSlot={showCatalogSearch ? (
              <CatalogSearch slug={site.slug} primary={primary} lang={site.lang} dropshipType={site.dropship_type || 'reseller'} />
            ) : undefined}
            labels={{
              all: L('Tout', 'All', 'Todo', 'الكل', 'Tudo', 'Alle', 'Tutti'),
              onQuote: t.labels.onQuote,
              request: t.labels.request,
              addToCart: cartT.addToCart,
              estimatedDelivery: t.labels.estimatedDelivery,
              days: t.labels.days,
              securePayment: L('Paiement sécurisé', 'Secure payment', 'Pago seguro', 'دفع آمن', 'Pagamento seguro', 'Sichere Zahlung', 'Pagamento sicuro'),
              freeDelivery: L('Livraison suivie', 'Tracked delivery', 'Envío con seguimiento', 'شحن متتبع', 'Entrega rastreada', 'Verfolgte Lieferung', 'Spedizione tracciata'),
              easyReturns: L('Retours simples', 'Easy returns', 'Devoluciones fáciles', 'إرجاع سهل', 'Devoluções fáceis', 'Einfache Rückgabe', 'Resi facili'),
              support: L('Support dédié', 'Dedicated support', 'Soporte dedicado', 'دعم مخصص', 'Suporte dedicado', 'Engagierter Support', 'Supporto dedicato'),
              newArrivals: L('Nouveautés', 'New arrivals', 'Novedades', 'وصل حديثا', 'Novidades', 'Neuheiten', 'Novità'),
              browse: L('Notre sélection', 'Our selection', 'Nuestra selección', 'مختاراتنا', 'Nossa seleção', 'Unsere Auswahl', 'La nostra selezione'),
            }}
          />
        ) : (
          <section className="relative min-h-[70vh] flex items-center pt-16 overflow-hidden">
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white via-[#f6f7fb] to-[#eef0f7]" />
            <div className="au-blob absolute -top-32 -left-24 w-[46rem] h-[46rem] rounded-full blur-3xl opacity-40 pointer-events-none" style={{ background: `radial-gradient(circle at 30% 30%, ${primary}, transparent 60%)` }} />
            <div className="relative max-w-5xl mx-auto px-6 md:px-10 text-center au-rise">
              {site.slogan && <div className="text-xs font-medium tracking-[0.2em] uppercase text-neutral-500 mb-4">{site.slogan}</div>}
              <h1 className="text-5xl md:text-6xl font-semibold leading-tight tracking-tight mb-6">{site.hero_title || site.name}</h1>
              {site.hero_subtitle && <p className="text-lg text-neutral-600 max-w-2xl mx-auto mb-8">{site.hero_subtitle}</p>}
              <a href="#contact" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-white font-medium transition hover:-translate-y-0.5" style={{ backgroundColor: primary }}>
                {cta}
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </section>
        )}

        {/* ABOUT */}
        {site.about && !hidden('About') && (
          <section id="about" className="py-20 md:py-28">
            <div className="max-w-5xl mx-auto px-6 md:px-10">
              <div className="grid md:grid-cols-[1fr_2fr] gap-12 items-start">
                <div>
                  <div className="text-xs font-medium tracking-[0.2em] uppercase text-neutral-500 mb-4">{t.sections.aboutKicker}</div>
                  <div className="h-px w-12" style={{ backgroundColor: primary }} />
                  {Array.isArray(site.whyus) && site.whyus.length > 0 && (
                    <div className="mt-10">
                      <h3 className="text-2xl font-semibold mb-8">{whyWord} {site.name} ?</h3>
                      <div className="space-y-8">
                        {site.whyus.map((item, i) => (
                          <div key={i}>
                            <div className="text-xs font-medium tracking-[0.2em] mb-2" style={{ color: primary }}>{String(i + 1).padStart(2, '0')}</div>
                            <h4 className="font-medium text-neutral-900 mb-1">{item.title}</h4>
                            <p className="text-sm leading-relaxed text-neutral-600">{item.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(site.mission || site.vision) && (
                    <div className="mt-10 space-y-8">
                      {site.mission && (
                        <div>
                          <div className="text-xs font-medium tracking-[0.2em] mb-2" style={{ color: primary }}>{missionWord}</div>
                          <p className="text-sm leading-relaxed text-neutral-600">{site.mission}</p>
                        </div>
                      )}
                      {site.vision && (
                        <div>
                          <div className="text-xs font-medium tracking-[0.2em] mb-2" style={{ color: primary }}>{visionWord}</div>
                          <p className="text-sm leading-relaxed text-neutral-600">{site.vision}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <h2 className="text-4xl md:text-5xl font-semibold leading-tight mb-8">{t.sections.aboutTitle}</h2>
                  <p className="text-lg md:text-xl leading-relaxed text-neutral-700">{site.about}</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* GALLERY */}
        {gallery.length > 0 && !hidden('Gallery') && (
          <section id="gallery" className="py-20 md:py-28">
            <div className="max-w-7xl mx-auto px-6 md:px-10">
              <div className="mb-12">
                <div className="text-xs font-medium tracking-[0.2em] uppercase mb-4" style={{ color: primary }}>{t.sections.galleryKicker}</div>
                <h2 className="text-4xl md:text-5xl font-semibold leading-tight">{t.sections.galleryTitle}</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                {gallery.slice(0, 9).map((url, i) => (
                  <div key={i} className={`relative overflow-hidden rounded-3xl bg-neutral-100 group ${i === 0 ? 'md:col-span-2 md:row-span-2' : ''}`} style={{ aspectRatio: i === 0 ? '1 / 1' : '4 / 5' }}>
                    <Image src={url} alt="" fill sizes="(max-width: 768px) 50vw, 33vw" className="object-cover transition-transform duration-700 group-hover:scale-105" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* TESTIMONIALS */}
        {testimonials.length > 0 && !hidden('Reviews') && (
          <section id="testimonials" className="py-20 md:py-28 relative overflow-hidden">
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#f6f7fb] to-white" />
            <div className="au-blob absolute top-0 left-1/2 -translate-x-1/2 w-[40rem] h-[40rem] rounded-full opacity-20 blur-3xl pointer-events-none" style={{ background: `radial-gradient(circle, ${primary}, transparent 60%)` }} />
            <div className="relative max-w-7xl mx-auto px-6 md:px-10">
              <div className="text-center max-w-2xl mx-auto mb-14">
                <div className="text-xs font-medium tracking-[0.2em] uppercase mb-4" style={{ color: primary }}>{t.sections.testimonialsKicker}</div>
                <h2 className="text-4xl md:text-5xl font-semibold leading-tight">{t.sections.testimonialsTitle}</h2>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {testimonials.map((r: any, i: number) => (
                  <div key={i} className="relative p-8 rounded-3xl border border-black/5 bg-white/80 backdrop-blur-xl shadow-sm">
                    <Quote className="w-8 h-8 mb-4 opacity-20" style={{ color: primary }} />
                    <p className="text-neutral-700 leading-relaxed mb-6">{r.content}</p>
                    <div className="flex items-center gap-1 mb-3">
                      {Array.from({ length: 5 }).map((_, s) => (
                        <Star key={s} className="w-4 h-4" style={{ color: s < (r.rating || 5) ? primary : '#e5e5e5', fill: s < (r.rating || 5) ? primary : '#e5e5e5' }} />
                      ))}
                    </div>
                    <div className="font-semibold text-neutral-900">{r.name}</div>
                    {r.role && <div className="text-sm text-neutral-500">{r.role}</div>}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* CUSTOM PAGES */}
        {(site.pages || []).filter((p: any) => p && p.title).map((page: any, pi: number) => (
          <section key={`page-${pi}`} id={`page-${pi}`} className="py-20 md:py-28">
            <div className="max-w-4xl mx-auto px-6 md:px-10">
              <h2 className="text-4xl md:text-5xl font-semibold leading-tight mb-8">{page.title}</h2>
              <div className="text-lg leading-relaxed text-neutral-700 whitespace-pre-line">{page.content}</div>
            </div>
          </section>
        ))}

        {/* CONTACT */}
        {!hidden('Contact') && (
          <section id="contact" className="py-20 md:py-28 relative overflow-hidden">
            <div className="au-blob absolute bottom-0 right-0 w-[36rem] h-[36rem] rounded-full opacity-20 blur-3xl pointer-events-none" style={{ background: `radial-gradient(circle, ${auraB}, transparent 60%)` }} />
            <div className="relative max-w-7xl mx-auto px-6 md:px-10">
              <div className="grid lg:grid-cols-2 gap-14">
                <div>
                  <div className="text-xs font-medium tracking-[0.2em] uppercase mb-4" style={{ color: primary }}>{t.sections.contactKicker}</div>
                  <h2 className="text-4xl md:text-5xl font-semibold leading-tight mb-8">{t.sections.contactTitle}</h2>
                  <div className="space-y-5 mb-8">
                    {contact.phone && (
                      <a href={`tel:${contact.phone}`} className="flex items-center gap-3 text-neutral-700 hover:text-neutral-900 transition">
                        <span className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `color-mix(in srgb, ${primary} 12%, white)`, color: primary }}><Phone className="w-4 h-4" /></span>
                        {contact.phone}
                      </a>
                    )}
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="flex items-center gap-3 text-neutral-700 hover:text-neutral-900 transition">
                        <span className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `color-mix(in srgb, ${primary} 12%, white)`, color: primary }}><Mail className="w-4 h-4" /></span>
                        {contact.email}
                      </a>
                    )}
                    {contact.address && (
                      <div className="flex items-center gap-3 text-neutral-700">
                        <span className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `color-mix(in srgb, ${primary} 12%, white)`, color: primary }}><MapPin className="w-4 h-4" /></span>
                        {contact.address}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {social.instagram && <a href={socialUrl('instagram', social.instagram)!} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-2xl border border-black/10 flex items-center justify-center hover:-translate-y-0.5 transition" style={{ color: primary }}><Instagram /></a>}
                    {social.facebook && <a href={socialUrl('facebook', social.facebook)!} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-2xl border border-black/10 flex items-center justify-center hover:-translate-y-0.5 transition" style={{ color: primary }}><Facebook /></a>}
                    {social.tiktok && <a href={socialUrl('tiktok', social.tiktok)!} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-2xl border border-black/10 flex items-center justify-center hover:-translate-y-0.5 transition" style={{ color: primary }}><TikTok /></a>}
                    {social.whatsapp && <a href={socialUrl('whatsapp', social.whatsapp)!} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-2xl border border-black/10 flex items-center justify-center hover:-translate-y-0.5 transition" style={{ color: primary }}><WhatsApp /></a>}
                  </div>
                  {typeof site.geo_lat === 'number' && typeof site.geo_lng === 'number' && (
                    <div className="mt-8 rounded-3xl overflow-hidden border border-black/5">
                      <ContactMap lat={site.geo_lat} lng={site.geo_lng} />
                    </div>
                  )}
                </div>
                <div className="rounded-3xl border border-black/5 bg-white/80 backdrop-blur-xl p-8 shadow-sm">
                  <ContactForm slug={site.slug} brand={primary} lang={site.lang} />
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-black/5 py-12">
        <div className="max-w-7xl mx-auto px-6 md:px-10 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-neutral-500">
          <div className="font-semibold text-neutral-900">{site.name}</div>
          <div>© {new Date().getFullYear()} {site.name}. {t.labels.rightsReserved}</div>
        </div>
      </footer>
    </div>
  )
}
