// src/app/sites/[slug]/themes/MonochromeTheme.tsx
import Image from 'next/image'
import Link from 'next/link'
import { Phone, Mail, MapPin, Star, Quote, ArrowRight } from 'lucide-react'
import { Instagram, Facebook, TikTok, WhatsApp } from './BrandIcons'
import MobileNav from './MobileNav'
import ContactForm from '../ContactForm'
import {
  type Site,
  normalizeService,
  normalizeTestimonial,
  normalizeProduct,
} from './shared'

export default function MonochromeTheme({ site }: { site: Site }) {
  const services = (site.services || []).map(normalizeService)
  const testimonials = (site.testimonials || []).map(normalizeTestimonial)
  const products = (site.products || []).map(normalizeProduct)
  const gallery: string[] = (site.gallery || []).filter(
    (u: any) => typeof u === 'string' && u.length > 0 && u.startsWith('http')
  )
  const contact = site.contact || {}
  const social = site.social_links || {}
  const cta = site.cta || 'Contact'
  const ctaHref = products.length > 0 ? '#shop' : '#contact'

  return (
    <div className="min-h-screen bg-white text-black antialiased">
      <style>{`
        @keyframes mono-fade {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .mono-fade { animation: mono-fade 0.7s ease-out both; }
      `}</style>

      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-black/10">
        <div className="max-w-7xl mx-auto px-6 md:px-10 h-20 flex items-center justify-between">
          <Link href={`/sites/${site.slug}`} className="text-xl font-black tracking-tighter uppercase">
            {site.name}
          </Link>
          <nav className="hidden md:flex items-center gap-10 text-sm font-medium">
            <a href="#home" className="hover:opacity-60 transition-opacity">Home</a>
            <a href="#about" className="hover:opacity-60 transition-opacity">About</a>
            <a href="#services" className="hover:opacity-60 transition-opacity">Services</a>
            {products.length > 0 && <a href="#shop" className="hover:opacity-60 transition-opacity">Shop</a>}
            <a href="#gallery" className="hover:opacity-60 transition-opacity">Gallery</a>
            <a href="#contact" className="hover:opacity-60 transition-opacity">Contact</a>
            <a href={ctaHref} className="inline-flex items-center gap-2 px-5 py-2.5 bg-black text-white text-sm font-medium hover:bg-white hover:text-black border border-black transition-colors">
              {cta} <ArrowRight className="w-4 h-4" />
            </a>
          </nav>
        </div>
      </header>

      {/* Mobile Navigation */}
      <MobileNav site={site} cta={cta} ctaHref={ctaHref} />

      {/* HERO */}
      <section id="home" className="relative min-h-screen flex items-center pt-20 pb-20">
        <div className="max-w-7xl mx-auto px-6 md:px-10 w-full mono-fade">
          {site.slogan && (
            <div className="inline-block text-xs font-semibold tracking-[0.2em] uppercase mb-8 border-b border-black pb-1">
              {site.slogan}
            </div>
          )}
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black leading-[0.9] tracking-tighter mb-10 uppercase">
            {site.hero_title || site.name}
          </h1>
          {site.hero_subtitle && (
            <p className="text-lg md:text-2xl text-black/70 max-w-2xl mb-12 leading-relaxed">
              {site.hero_subtitle}
            </p>
          )}
          <div className="flex flex-wrap gap-4">
            <a href={ctaHref} className="group inline-flex items-center gap-3 px-8 py-4 bg-black text-white font-medium hover:gap-5 transition-all">
              {cta} <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </a>
            <a href="#services" className="inline-flex items-center gap-2 px-8 py-4 border border-black hover:bg-black hover:text-white transition-colors">
              View services
            </a>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      {site.about && (
        <section id="about" className="py-28 md:py-36 border-t border-black">
          <div className="max-w-5xl mx-auto px-6 md:px-10">
            <div className="grid md:grid-cols-[1fr_2fr] gap-16 items-start">
              <div className="text-xs font-medium tracking-[0.2em] uppercase">01 — About</div>
              <div>
                <h2 className="text-4xl md:text-5xl font-bold leading-tight mb-8 uppercase tracking-tighter">Our story</h2>
                <p className="text-lg md:text-xl leading-relaxed text-black/70">{site.about}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SERVICES */}
      {services.length > 0 && (
        <section id="services" className="py-28 md:py-36 bg-black text-white">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <div className="grid md:grid-cols-[1fr_2fr] gap-16 mb-20">
              <div className="text-xs font-medium tracking-[0.2em] uppercase opacity-60">02 — Services</div>
              <h2 className="text-4xl md:text-5xl font-bold leading-tight uppercase tracking-tighter">What we do</h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10">
              {services.map((s, i) => {
                const Icon = s.Icon
                return (
                  <div key={i} className="p-8 md:p-10 bg-black hover:bg-white hover:text-black transition-colors group">
                    <Icon className="w-7 h-7 mb-6" strokeWidth={1.5} />
                    <h3 className="text-xl md:text-2xl font-bold mb-4 uppercase tracking-tight">{s.title}</h3>
                    <p className="leading-relaxed opacity-70 group-hover:opacity-100">{s.description}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* SHOP */}
      {products.length > 0 && (
        <section id="shop" className="py-28 md:py-36 border-t border-black">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <div className="grid md:grid-cols-[1fr_2fr] gap-16 mb-20">
              <div className="text-xs font-medium tracking-[0.2em] uppercase">03 — Shop</div>
              <h2 className="text-4xl md:text-5xl font-bold leading-tight uppercase tracking-tighter">Products</h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map((p, i) => (
                <div key={i} className="group">
                  <div className="aspect-square relative overflow-hidden bg-black/5 mb-4">
                    {p.image ? (
                      <Image src={p.image} alt={p.name} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw" className="object-cover group-hover:scale-105 transition-transform duration-500 grayscale" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-5xl font-black">{p.name.charAt(0).toUpperCase()}</div>
                    )}
                  </div>
                  <h3 className="text-lg font-bold uppercase tracking-tight mb-1">{p.name}</h3>
                  {p.description && <p className="text-sm text-black/60 mb-2 line-clamp-2">{p.description}</p>}
                  <div className="flex items-center justify-between border-t border-black/10 pt-3">
                    {p.price ? <span className="text-lg font-bold">{p.price}</span> : <span className="text-sm text-black/40">On request</span>}
                    <a href="#contact" className="text-sm font-medium underline underline-offset-4">Inquire</a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* GALLERY */}
      {gallery.length > 0 && (
        <section id="gallery" className="py-28 md:py-36 border-t border-black">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <div className="grid md:grid-cols-[1fr_2fr] gap-16 mb-20">
              <div className="text-xs font-medium tracking-[0.2em] uppercase">04 — Work</div>
              <h2 className="text-4xl md:text-5xl font-bold leading-tight uppercase tracking-tighter">Gallery</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {gallery.slice(0, 9).map((url, i) => (
                <div key={i} className={`relative overflow-hidden bg-black/5 group ${i === 0 ? 'md:col-span-2 md:row-span-2' : ''}`} style={{ aspectRatio: i === 0 ? '1 / 1' : '4 / 5' }}>
                  <Image src={url} alt="" fill sizes="(max-width: 768px) 50vw, 33vw" className="object-cover grayscale group-hover:grayscale-0 transition-all duration-700" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* TESTIMONIALS */}
      {testimonials.length > 0 && (
        <section id="testimonials" className="py-28 md:py-36 bg-black text-white">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <div className="grid md:grid-cols-[1fr_2fr] gap-16 mb-20">
              <div className="text-xs font-medium tracking-[0.2em] uppercase opacity-60">05 — Reviews</div>
              <h2 className="text-4xl md:text-5xl font-bold leading-tight uppercase tracking-tighter">Clients</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-px bg-white/10">
              {testimonials.slice(0, 3).map((t, i) => (
                <div key={i} className="bg-black p-8 md:p-10">
                  <Quote className="w-8 h-8 mb-6 opacity-40" strokeWidth={1.5} />
                  <div className="flex gap-1 mb-6">
                    {Array.from({ length: 5 }).map((_, k) => (
                      <Star key={k} className="w-4 h-4" fill={k < t.rating ? 'white' : 'transparent'} strokeWidth={1} />
                    ))}
                  </div>
                  <p className="text-lg leading-relaxed mb-8">"{t.content}"</p>
                  <div className="pt-6 border-t border-white/10">
                    <div className="font-bold uppercase tracking-tight">{t.name}</div>
                    {t.role && <div className="text-sm text-white/50 mt-1">{t.role}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CONTACT */}
      <section id="contact" className="py-28 md:py-36 border-t border-black">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <div className="grid md:grid-cols-[1fr_2fr] gap-16 mb-20">
            <div className="text-xs font-medium tracking-[0.2em] uppercase">06 — Contact</div>
            <div>
              <h2 className="text-4xl md:text-5xl font-bold leading-tight mb-4 uppercase tracking-tighter">Let's talk</h2>
              <p className="text-lg text-black/60">A question? We respond within 24h.</p>
            </div>
          </div>
          <div className="grid lg:grid-cols-[1.2fr_1fr] gap-10 lg:gap-16 items-start">
            <div className="border border-black p-8 md:p-10">
              <ContactForm slug={site.slug} brand="#000000" lang={site.lang} />
            </div>
            <div className="space-y-px bg-black/10">
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="flex items-center gap-5 p-6 bg-white hover:bg-black hover:text-white transition-colors">
                  <Phone className="w-5 h-5 shrink-0" strokeWidth={1.5} />
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wider opacity-60 mb-1">Phone</div>
                    <div className="font-medium truncate">{contact.phone}</div>
                  </div>
                </a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-5 p-6 bg-white hover:bg-black hover:text-white transition-colors">
                  <Mail className="w-5 h-5 shrink-0" strokeWidth={1.5} />
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wider opacity-60 mb-1">Email</div>
                    <div className="font-medium truncate">{contact.email}</div>
                  </div>
                </a>
              )}
              {contact.address && (
                <div className="flex items-start gap-5 p-6 bg-white">
                  <MapPin className="w-5 h-5 shrink-0" strokeWidth={1.5} />
                  <div>
                    <div className="text-xs uppercase tracking-wider opacity-60 mb-1">Address</div>
                    <div className="font-medium leading-snug">{contact.address}</div>
                  </div>
                </div>
              )}
              {(social.instagram || social.facebook || social.whatsapp || social.tiktok) && (
                <div className="bg-white p-6">
                  <div className="text-xs uppercase tracking-wider opacity-60 mb-4">Follow</div>
                  <div className="flex gap-2 flex-wrap">
                    {social.instagram && (
                      <a href={social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="flex items-center justify-center w-11 h-11 border border-black hover:bg-black hover:text-white transition-colors">
                        <Instagram className="w-4 h-4" />
                      </a>
                    )}
                    {social.facebook && (
                      <a href={social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="flex items-center justify-center w-11 h-11 border border-black hover:bg-black hover:text-white transition-colors">
                        <Facebook className="w-4 h-4" />
                      </a>
                    )}
                    {social.tiktok && (
                      <a href={social.tiktok} target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="flex items-center justify-center w-11 h-11 border border-black hover:bg-black hover:text-white transition-colors">
                        <TikTok className="w-4 h-4" />
                      </a>
                    )}
                    {social.whatsapp && (
                      <a href={`https://wa.me/${String(social.whatsapp).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="flex items-center justify-center w-11 h-11 border border-black hover:bg-black hover:text-white transition-colors">
                        <WhatsApp className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-black text-white py-16">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8 mb-12">
            <div>
              <div className="text-3xl font-black uppercase tracking-tighter mb-2">{site.name}</div>
              {site.slogan && <div className="text-white/60 text-sm">{site.slogan}</div>}
            </div>
            <nav className="flex gap-8 text-sm text-white/70">
              <a href="#home" className="hover:text-white transition-colors">Home</a>
            <a href="#about" className="hover:text-white transition-colors">About</a>
              <a href="#services" className="hover:text-white transition-colors">Services</a>
              <a href="#contact" className="hover:text-white transition-colors">Contact</a>
            </nav>
          </div>
          <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-sm text-white/40">
            <div>© {new Date().getFullYear()} {site.name}. All rights reserved.</div>
            <div className="flex items-center gap-2">
              <span>Powered by</span>
              <a href="https://nexiora.ca" target="_blank" rel="noopener noreferrer" className="font-medium text-white/70 hover:text-white transition-colors">Nexiora</a>
            </div>
          </div>
        </div>
      </footer>

      {social.whatsapp && (
        <a href={`https://wa.me/${String(social.whatsapp).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" aria-label="Contact us on WhatsApp" className="fixed bottom-6 right-6 z-40 flex items-center justify-center w-14 h-14 bg-black text-white shadow-2xl hover:scale-110 transition-transform">
          <WhatsApp className="w-7 h-7" />
        </a>
      )}
    </div>
  )
}
