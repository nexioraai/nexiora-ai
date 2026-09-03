'use client'

import { useRef, useEffect } from 'react'
import Link from 'next/link'
import { ArrowRight, Phone, Mail, MapPin, ShoppingBag } from 'lucide-react'
import { motion, useReducedMotion, useScroll, useTransform, useMotionTemplate, type MotionValue } from 'framer-motion'
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
import { socialUrl } from '@/lib/social'
import { getModeCapabilities } from './modeCapabilities'
import NoirShopSection from './NoirShopSection'
import SectionKicker from './SectionKicker'
import { useSpotlightXY, SpotlightGlow, SpotlightSheen } from './NoirSpotlight'

// ============================================================
// Systeme de tons -- Noir comme clair-obscur, pas comme "site sombre".
// ============================================================
export const VOID = '#0A0806'
export const STAGE = '#150F0A'
export const PANEL = '#1F1810'
export const SURFACE = '#2A2015'
export const LINE = 'rgba(245,230,200,0.10)'
export const gold = '#C9A24B'
export const goldBright = '#E8C468'

// CTA du hero : lien minimal souligne, pas un bouton pilule -- reserve aux
// autres sections (voir plus bas, remplace par un lien equivalent aussi
// dans le hero pour eviter le vocabulaire "bouton SaaS").
function NoirHeroLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="group inline-flex items-center gap-3 text-sm font-medium tracking-wide" style={{ color: '#F5F3EE' }}>
      <span className="relative pb-1">
        {children}
        <span className="absolute left-0 bottom-0 h-px w-full origin-left transition-transform duration-500 group-hover:scale-x-110" style={{ backgroundColor: gold }} />
      </span>
      <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1.5" style={{ color: gold }} />
    </a>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="group relative py-1">
      <span className="transition-colors group-hover:text-white">{children}</span>
      <span className="absolute left-0 -bottom-0.5 h-px w-full origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100" style={{ backgroundColor: gold }} />
    </a>
  )
}

// Photo produit CJ reelle -- ce theme met en scene le produit choisi par
// le marchand, il ne le recolore pas. Version precedente : grayscale(0.92)
// + calque or en mix-blend-mode:color -- techniquement un "etalonnage
// coherent", mais desature 92% de la teinte reelle puis impose une teinte
// or/brune artificielle basee uniquement sur la luminosite. Verifie sur
// le catalogue reel Cosmopo (bijoux, cosmetiques, cuisine...) : la couleur
// vraie du produit disparaissait systematiquement au profit de noir /
// blanc / beige / or, quelle que soit la couleur reelle de l'article --
// le visiteur ne voit plus "le produit que le marchand a choisi".
// Corrige : plus aucun filtre qui change la teinte. Seule une legere
// vignette radiale (assombrit les bords, laisse le centre intact) ajoute
// de la profondeur sans mentir sur la couleur -- c'est un eclairage de
// scene, pas un retouchage de produit.
export function GradedImage({
  src,
  alt,
  cropBottomPct = 0,
  imgClassName = '',
  vignette = true,
}: {
  src: string
  alt: string
  cropBottomPct?: number
  imgClassName?: string
  vignette?: boolean
}) {
  return (
    <div className="absolute inset-0">
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover ${imgClassName}`}
        style={{
          clipPath: cropBottomPct > 0 ? `inset(0% 0% ${cropBottomPct}% 0%)` : undefined,
          filter: 'contrast(1.05) saturate(1.03)',
        }}
      />
      {vignette && (
        <div
          className="absolute inset-0 pointer-events-none mix-blend-multiply"
          style={{ background: `radial-gradient(130% 110% at 50% 35%, transparent 58%, ${VOID}70 100%)` }}
        />
      )}
    </div>
  )
}

// La piece heros du hero : object-contain (jamais object-cover), pour que
// le vrai cadrage de la photo CJ se lise en entier au lieu d'un rectangle
// recadre au hasard.
//
// Le masque radial teste en premier lieu s'est revele trop faible pour
// produire un vrai decoupage : sur une photo CJ au fond blanc plein cadre,
// un fondu radial de bord ne fait que grignoter quelques pixels au
// perimetre -- invisible a l'ecran, verifie par capture reelle. Remplace
// par une technique plus honnete : le panneau reste un rectangle assume
// (comme un grand aplat editorial, pas une vignette produit), mais se
// dissout reellement dans la matiere du hero sur les bords qui le
// rattachent a la scene (gauche, cote texte ; haut, cote entete) via un
// degrade vers la couleur de fond -- pas une ombre portee decorative,
// une vraie continuite de matiere.
//
// La mise en scene (echelle, debordement, degrade, lumiere) reste
// artistique -- la couleur du produit, non : grayscale + calque or ont ete
// retires (meme correction que GradedImage) pour que la piece exposee en
// hero reste le vrai produit choisi par le marchand, pas une reinterpretation
// coloree.
function HeroObject({
  heroImage,
  alt,
  cropBottomPct,
  spotX,
  spotReduceMotion,
  heightClass,
}: {
  heroImage: string
  alt: string
  cropBottomPct: number
  spotX: MotionValue<number>
  spotReduceMotion: boolean | null
  heightClass: string
}) {
  return (
    <div className={`relative ${heightClass} flex items-center justify-end`}>
      <div className="relative h-full w-auto inline-block">
        <img
          src={heroImage}
          alt={alt}
          className="relative block h-full w-auto max-w-none object-contain"
          style={{
            clipPath: cropBottomPct > 0 ? `inset(0% 0% ${cropBottomPct}% 0%)` : undefined,
            filter: 'contrast(1.08) saturate(1.04)',
          }}
        />
        {/* Dissolution reelle dans la matiere du hero -- pas une bordure. */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(90deg, ${STAGE} 0%, transparent 30%)` }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(180deg, ${STAGE} 0%, transparent 16%, transparent 82%, ${STAGE}CC 100%)` }} />
        <SpotlightSheen x={spotX} reduceMotion={spotReduceMotion} />
      </div>
    </div>
  )
}

export default function NoirTheme({ site }: { site: Site }) {
  const hidden = (name: string) => (site.hidden_sections || []).includes(name)
  const t = getDict(site.lang)
  const sections = site.sections || []
  const testimonials = (site.testimonials || []).map(normalizeTestimonial)
  const products = [...(site.products || []).map(normalizeProduct), ...mockupsToProducts(site)]
  const gallery: string[] = (site.gallery || []).filter(
    (u: any) => typeof u === 'string' && u.length > 0 && u.startsWith('http')
  )
  const contact = site.contact || {}
  const social = site.social_links || {}
  const cta = site.cta || t.labels.contactCta
  const { hasShop } = getModeCapabilities(site)
  const ctaHref = hasShop ? '#shop' : '#contact'
  const heroTitle = site.hero_title || site.name
  const heroWords = heroTitle.trim().split(/\s+/)
  const heroLead = heroWords.slice(0, Math.max(1, heroWords.length - 2)).join(' ')
  const heroEmph = heroWords.slice(Math.max(1, heroWords.length - 2)).join(' ')
  const reduceMotion = useReducedMotion()
  const heroProducts = products.slice(0, 5)
  const featured = heroProducts[0]
  const filmstrip = heroProducts.slice(1, 5)
  const heroImage = hasShop ? featured?.image : site.hero_image

  const stats = [
    site.price_range && { k: site.price_range, v: t.nav.shop },
    testimonials.length > 0 && { k: `${testimonials.length}+`, v: t.sections.testimonialsKicker },
    products.length > 0 && { k: `${products.length}`, v: t.nav.shop },
  ].filter(Boolean) as { k: string; v: string }[]

  // Lumiere ambiante du hero -- doit suivre le curseur partout dans la scene
  // (titre, prix, CTA, espace vide, ET le header fixe qui chevauche visuellement
  // le haut du hero), pas seulement au-dessus du produit. Bug reel identifie a
  // l'inspection : `onMouseMove` etait pose sur la <section> elle-meme, qui ne
  // recoit jamais les evenements survenant sur le header (position:fixed,
  // rendu comme frere de <main>, pas comme descendant de la section -- donc
  // jamais atteint par la propagation React). Ecouteur remonte au niveau
  // window pour capter le curseur quel que soit l'element survole, la
  // position restant calculee relativement au rect de la section (donc le
  // survol du header, visuellement au-dessus du haut du hero, produit une
  // position proche du haut -- coherent). Seul `x` etait par ailleurs
  // conserve : `y` etait extrait de useSpotlightXY() mais jamais lu, et
  // SpotlightGlow (le halo ambiant 2D reel) n'etait ni importe ni rendu --
  // seul SpotlightSheen (un reflet directionnel 1D, x seulement) survivait,
  // imbrique dans HeroObject et donc visible seulement sur la zone produit.
  const spotlightContainerRef = useRef<HTMLDivElement>(null)
  const { x: spotX, y: spotY, reduceMotion: spotReduceMotion } = useSpotlightXY()

  useEffect(() => {
    if (spotReduceMotion) return
    function handleWindowMove(e: MouseEvent) {
      const rect = spotlightContainerRef.current?.getBoundingClientRect()
      if (!rect) return
      spotX.set(((e.clientX - rect.left) / rect.width) * 100)
      spotY.set(((e.clientY - rect.top) / rect.height) * 100)
    }
    window.addEventListener('mousemove', handleWindowMove)
    return () => window.removeEventListener('mousemove', handleWindowMove)
  }, [spotReduceMotion, spotX, spotY])

  // Expose le theme actif sur <html> -- pure presentation, aucune logique
  // metier. Seul consommateur actuel : CookieConsent.tsx (composant plateforme
  // globalement monte, hors arbre de ce theme) pour adapter sa palette sans
  // faire transiter les donnees du site jusqu'au layout racine. Nettoye au
  // demontage pour qu'un retour sur une page non-storefront (dashboard,
  // marketing) ne garde pas un theme perime.
  useEffect(() => {
    document.documentElement.setAttribute('data-storefront-theme', 'noir')
    return () => { document.documentElement.removeAttribute('data-storefront-theme') }
  }, [])

  const heroStagger = { hidden: {}, show: { transition: { staggerChildren: reduceMotion ? 0 : 0.09 } } }
  const heroItem = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 22 },
    show: { opacity: 1, y: 0, transition: { duration: reduceMotion ? 0.01 : 0.7, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
  }

  // Header fusionne avec le hero : transparent au chargement, se solidifie
  // au scroll -- remplace le bandeau opaque generique.
  const { scrollY } = useScroll()
  const headerOpacity = useTransform(scrollY, [0, 140], [0, 1])
  const headerBg = useMotionTemplate`rgba(10,8,6,${headerOpacity})`
  const headerBorderOpacity = useTransform(scrollY, [0, 140], [0, 0.1])
  const headerBorder = useMotionTemplate`rgba(245,230,200,${headerBorderOpacity})`

  return (
    <div className="min-h-screen antialiased" style={{ backgroundColor: STAGE, color: '#F5F3EE', ['--brand' as any]: gold }}>
      {/* =================== HEADER — fusionne avec le hero, se solidifie au scroll =================== */}
      <motion.header
        className="fixed top-0 left-0 right-0 z-50"
        style={{ backgroundColor: headerBg, borderBottom: `1px solid`, borderBottomColor: headerBorder, backdropFilter: 'blur(10px)' }}
      >
        <div className="max-w-7xl mx-auto px-6 md:px-10 h-20 flex items-center justify-between">
          <Link href="#home" className="text-2xl tracking-tight font-medium" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
            {site.name}
          </Link>
          <nav className="hidden md:flex items-center gap-10 text-sm font-medium" style={{ color: 'rgba(245,243,238,0.72)' }}>
            {!hidden('Home') && <NavLink href="#home">{t.nav.home}</NavLink>}
            {!hidden('About') && <NavLink href="#about">{t.nav.about}</NavLink>}
            {!hidden('Services') && <NavLink href="#services">{sections[0]?.name || t.nav.services}</NavLink>}
            {hasShop && !hidden('Shop') && <NavLink href="#shop">{t.nav.shop}</NavLink>}
            {!hidden('Gallery') && <NavLink href="#gallery">{t.nav.gallery}</NavLink>}
            {!hidden('Reviews') && <NavLink href="#testimonials">{t.nav.reviews}</NavLink>}
            {(site.pages || []).filter((p: any) => p && p.title).map((page: any, pi: number) => (
              <NavLink key={`navpage-${pi}`} href={`#page-${pi}`}>{page.title}</NavLink>
            ))}
            {site.faq && site.faq.length > 0 && !hidden('FAQ') && <NavLink href="#faq">{t.nav.faq}</NavLink>}
            {!hidden('Contact') && <NavLink href="#contact">{t.nav.contact}</NavLink>}
          </nav>
        </div>
      </motion.header>

      <MobileNav site={site} cta={cta} ctaHref={ctaHref} variant="dark" />

      <main>
        {/* =================== HERO — l'objet qui deborde =================== */}
        {!hidden('Home') && (
          <section
            id="home"
            ref={spotlightContainerRef}
            className="relative min-h-screen overflow-hidden pt-20"
          >
            {/* Plan 1 — fond / matiere */}
            <div className="absolute inset-0" style={{ backgroundColor: STAGE }} />
            <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(200deg, rgba(201,162,75,0.14) 0%, transparent 45%)` }} />
            <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(900px 600px at 15% 105%, rgba(201,162,75,0.07), transparent 60%)` }} />
            {/* Lumiere ambiante reelle -- suit le curseur dans toute la scene,
                pas seulement au-dessus du produit (voir note plus haut). */}
            <SpotlightGlow x={spotX} y={spotY} reduceMotion={spotReduceMotion} size={680} opacity={0.16} />
            <div
              className="absolute inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
              }}
            />

            {/* Plan 2 — typographie fantome, tres grande, derriere le texte (pas derriere
                l'image : totalement invisible la, verifie a l'ecran -- repositionnee pour
                exister reellement comme plan intermediaire). */}
            <div
              aria-hidden
              className="hidden md:block absolute select-none pointer-events-none leading-none z-0 left-[2%] lg:left-[6%] -top-[6%]"
              style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: 'clamp(14rem, 34vw, 30rem)', WebkitTextStroke: '1px rgba(245,230,200,0.09)', color: 'transparent' }}
            >
              {(site.name || 'N').charAt(0)}
            </div>

            {/* Mobile : produit en tete, pleine largeur, avant le texte */}
            {heroImage && (
              <div className="relative z-10 lg:hidden px-6 pt-4">
                <HeroObject heroImage={heroImage} alt={hasShop ? featured?.name || site.name : site.name} cropBottomPct={hasShop ? 9 : 0} spotX={spotX} spotReduceMotion={spotReduceMotion} heightClass="h-[42vh]" />
              </div>
            )}

            <div className="relative z-20 max-w-7xl mx-auto px-6 md:px-10 w-full lg:min-h-[calc(100vh-5rem)] flex flex-col justify-center py-16 lg:py-0">
              <div className="relative lg:max-w-[62%]">
                <motion.div variants={heroStagger} initial="hidden" animate="show">
                  {hasShop ? (
                    <motion.a
                      href="#shop"
                      variants={heroItem}
                      className="group flex items-center gap-2 mb-5 text-[11px] font-medium tracking-[0.28em] uppercase"
                      style={{ color: gold }}
                    >
                      <ShoppingBag className="w-3 h-3 transition-transform duration-300 group-hover:translate-x-0.5" />
                      <span className="relative pb-0.5">
                        {t.sections.shopKicker}
                        <span className="absolute left-0 -bottom-0.5 h-px w-full origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100" style={{ backgroundColor: gold }} />
                      </span>
                    </motion.a>
                  ) : (
                    site.slogan && (
                      <motion.div variants={heroItem} className="flex items-center gap-3 mb-5">
                        <span className="h-px w-8" style={{ backgroundColor: gold }} />
                        <span className="text-xs font-medium tracking-[0.28em] uppercase" style={{ color: gold }}>{site.slogan}</span>
                      </motion.div>
                    )
                  )}

                  <motion.h1 variants={heroItem} className="leading-[0.9] mb-8">
                    <span className="block text-5xl md:text-7xl xl:text-8xl font-light" style={{ fontFamily: 'var(--font-fraunces), serif' }}>{heroLead}</span>
                    {heroEmph && (
                      <span className="block text-6xl md:text-8xl xl:text-9xl italic font-medium" style={{ fontFamily: 'var(--font-fraunces), serif', color: gold }}>{heroEmph}</span>
                    )}
                  </motion.h1>

                  {!hasShop && site.hero_subtitle && (
                    <motion.p variants={heroItem} className="text-lg leading-relaxed mb-8 max-w-md" style={{ color: 'rgba(245,243,238,0.72)' }}>
                      {site.hero_subtitle}
                    </motion.p>
                  )}

                  <motion.div variants={heroItem}>
                    <NoirHeroLink href={hasShop ? '#shop' : ctaHref}>{hasShop ? t.nav.shop : cta}</NoirHeroLink>
                  </motion.div>

                  {stats.length > 0 && !hasShop && (
                    <motion.div variants={heroItem} className="flex flex-wrap gap-x-10 gap-y-4 mt-14">
                      {stats.map((s, i) => (
                        <div key={i}>
                          <div className="text-2xl font-medium" style={{ fontFamily: 'var(--font-fraunces), serif', color: gold }}>{s.k}</div>
                          <div className="text-[11px] uppercase tracking-wider" style={{ color: 'rgba(245,243,238,0.55)' }}>{s.v}</div>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </motion.div>
              </div>

              {/* Prix comme element graphique -- pas une ligne de fiche produit. En flux sur
                  mobile ; sur desktop, ancre en position absolue pour venir mordre sur le
                  coin bas-gauche du produit, seul vrai point de contact entre texte et piece. */}
              {hasShop && featured?.price && (
                <motion.a
                  href="#shop"
                  variants={heroItem}
                  initial="hidden"
                  animate="show"
                  className="group inline-flex items-end gap-3 mt-10 lg:absolute lg:mt-0 lg:left-[54%] lg:bottom-[10%] lg:z-30"
                >
                  <span className="text-6xl md:text-7xl xl:text-8xl font-extralight leading-none tracking-tight transition-colors" style={{ fontFamily: 'var(--font-fraunces), serif', color: goldBright }}>
                    {featured.price.replace(/[^0-9.,]/g, '')}
                  </span>
                  <span className="text-xs uppercase tracking-[0.2em] mb-2" style={{ color: 'rgba(245,243,238,0.5)' }}>
                    {featured.price.replace(/[0-9.,]/g, '').trim()}
                    <span className="block mt-0.5 truncate max-w-[10rem]" style={{ color: 'rgba(245,243,238,0.35)' }}>{featured.name}</span>
                  </span>
                </motion.a>
              )}
            </div>

            {/* Desktop : le produit deborde, ancre a droite, chevauche la typographie. */}
            {heroImage && (
              <motion.div
                initial={{ opacity: 0, x: reduceMotion ? 0 : 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: reduceMotion ? 0.01 : 0.9, ease: [0.16, 1, 0.3, 1] }}
                className="hidden lg:block absolute z-10 top-[10%] right-[-3%] h-[70vh]"
              >
                <HeroObject heroImage={heroImage} alt={hasShop ? featured?.name || site.name : site.name} cropBottomPct={hasShop ? 9 : 0} spotX={spotX} spotReduceMotion={spotReduceMotion} heightClass="h-full" />
              </motion.div>
            )}

            {/* Constellation de produits secondaires -- dispersee, asymetrique, jamais alignee.
                Ancree directement sur la section (pas un wrapper vide) : un conteneur sans
                enfant en flux normal s'effondre a taille zero, ce qui annule tout offset en
                pourcentage pose sur ses enfants absolus -- piege reel rencontre en verifiant
                le rendu, corrige en ancrant chaque medaillon individuellement. */}
            {hasShop && filmstrip.slice(0, 3).map((p, i) => {
              const spot = [
                { top: '78%', right: '20%', size: 46 },
                { top: '84%', right: '11%', size: 32 },
                { top: '73%', right: '9%', size: 26 },
              ][i]
              return (
                <motion.a
                  key={i}
                  href="#shop"
                  initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: reduceMotion ? 0 : 0.5 + i * 0.12, duration: 0.5 }}
                  className="hidden lg:block absolute z-30 rounded-full overflow-hidden transition-transform duration-300 hover:scale-110"
                  style={{ top: spot.top, right: spot.right, width: spot.size, height: spot.size, border: `1px solid ${LINE}` }}
                >
                  <GradedImage src={p.image || ''} alt={p.name} />
                </motion.a>
              )
            })}
          </section>
        )}

        {/* =================== WHY US — meme grammaire editoriale que Services
             (numeros fantome, pas des pastilles d'icone generiques SaaS) =================== */}
        {Array.isArray(site.whyus) && site.whyus.length > 0 && (
          <section className="py-16 md:py-24">
            <div className="max-w-7xl mx-auto px-6 md:px-10">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10" style={{ borderTop: `1px solid ${LINE}` }}>
                {site.whyus.map((item: any, i: number) => (
                  <div key={i} className="py-8" style={{ borderBottom: `1px solid ${LINE}` }}>
                    <span className="block text-4xl md:text-5xl leading-none mb-4" style={{ fontFamily: 'var(--font-fraunces), serif', color: gold, opacity: 0.55 }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <h3 className="text-sm font-semibold uppercase mb-2" style={{ letterSpacing: '0.1em', color: '#F5F3EE' }}>{item.title}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: 'rgba(245,243,238,0.6)' }}>{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* =================== ABOUT — le fondu du hero se prolonge ici =================== */}
        {!hidden('About') && site.about && (
          <Reveal>
            <section id="about" className="relative py-28 md:py-36">
              <div className="absolute top-0 inset-x-0 h-32 pointer-events-none" style={{ background: `linear-gradient(180deg, ${VOID}, transparent)` }} />
              <div className="max-w-4xl mx-auto px-6 md:px-10 text-center">
                <SectionKicker color={gold} className="justify-center flex">{t.sections.aboutKicker}</SectionKicker>
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

        {/* =================== SECTIONS (services) =================== */}
        {sections.length > 0 && !hidden('Services') && sections.map((sec: any, si: number) => (
          <section key={si} id={si === 0 ? 'services' : `section-${si}`} className="reveal py-28 md:py-36">
            <div className="max-w-7xl mx-auto px-6 md:px-10">
              <div className="text-center max-w-2xl mx-auto mb-20">
                <SectionKicker color={gold} className="justify-center flex">{t.sections.servicesKicker}</SectionKicker>
                <h2 className="text-4xl md:text-5xl leading-tight" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                  {sec.name}
                </h2>
              </div>

              <div style={{ borderTop: `1px solid ${LINE}` }}>
                {(sec.items || []).map((s: any, i: number) => (
                  <div key={i} className="group grid md:grid-cols-2 gap-8 md:gap-14 items-center py-12 md:py-16 transition-colors duration-500 hover:bg-white/[0.02]" style={{ borderBottom: `1px solid ${LINE}` }}>
                    <div className={i % 2 === 1 ? 'md:order-2' : ''}>
                      <div className="flex items-baseline gap-5 mb-6">
                        <span className="text-5xl md:text-6xl leading-none transition-opacity duration-500 group-hover:opacity-100" style={{ fontFamily: 'var(--font-fraunces), serif', color: gold, opacity: 0.5 }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="flex-1 h-px" style={{ backgroundColor: gold, opacity: 0.5 }} />
                        {s.price && <span className="text-sm font-semibold" style={{ color: gold }}>{s.price}</span>}
                      </div>
                      <h3 className="text-3xl md:text-4xl leading-tight mb-5" style={{ fontFamily: 'var(--font-fraunces), serif' }}>{s.title}</h3>
                      {s.description && <p className="text-lg leading-relaxed" style={{ color: 'rgba(245,243,238,0.65)' }}>{s.description}</p>}
                    </div>
                    {s.image && (
                      <div className={`relative w-full aspect-[4/3] rounded-2xl overflow-hidden transition-all duration-500 ${i % 2 === 1 ? 'md:order-1' : ''}`} style={{ border: `1px solid ${LINE}` }}>
                        <img src={s.image} alt={s.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}

        {/* =================== SHOP =================== */}
        {hasShop && !hidden('Shop') && <NoirShopSection site={site} />}

        {/* =================== GALLERY =================== */}
        {gallery.length > 0 && !hidden('Gallery') && (
          <section id="gallery" className="reveal py-28 md:py-36">
            <div className="max-w-7xl mx-auto px-6 md:px-10">
              <div className="text-center max-w-2xl mx-auto mb-20">
                <SectionKicker color={gold} className="justify-center flex">{t.sections.galleryKicker}</SectionKicker>
                <h2 className="text-4xl md:text-5xl leading-tight" style={{ fontFamily: 'var(--font-fraunces), serif' }}>{t.sections.galleryTitle}</h2>
              </div>
              {/* Meme etalonnage que le hero/Shop (GradedImage) pour que la galerie
                  n'ait pas l'air d'un module a part -- variation de hauteur uniquement
                  (jamais de largeur) : une col-span croisee avec une row-span sur une
                  grille non-dense cree un trou impossible a combler, verifie et corrige
                  sur le Shop (voir cardSpan dans NoirShopSection.tsx). */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 auto-rows-[160px] sm:auto-rows-[200px] md:auto-rows-[230px] lg:auto-rows-[260px]">
                {gallery.map((url, i) => (
                  <div
                    key={i}
                    className={`relative overflow-hidden group transition-all duration-500 ${i % 5 === 2 ? 'row-span-2' : ''}`}
                    style={{ border: `1px solid ${LINE}` }}
                  >
                    <GradedImage src={url} alt="" imgClassName="transition-transform duration-500 group-hover:scale-105" />
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ boxShadow: `inset 0 0 0 1px ${gold}66` }} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* =================== TESTIMONIALS =================== */}
        {testimonials.length > 0 && !hidden('Reviews') && (
          <section id="testimonials" className="reveal py-28 md:py-36" style={{ backgroundColor: VOID }}>
            <div className="max-w-7xl mx-auto px-6 md:px-10">
              <div className="text-center max-w-2xl mx-auto mb-20">
                <SectionKicker color={gold} className="justify-center flex">{t.sections.testimonialsKicker}</SectionKicker>
                <h2 className="text-4xl md:text-5xl leading-tight" style={{ fontFamily: 'var(--font-fraunces), serif' }}>{t.sections.testimonialsTitle}</h2>
              </div>
              {/* Meme accent typographique fantome que WhyUs/Services (chiffre/guillemet
                  en grand serif translucide) -- verifie reellement via le harnais de
                  demonstration local (voir debug-noir-preview-temp), aucun marchand Noir
                  reel n'ayant de temoignages actifs pour le confirmer autrement. */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {testimonials.map((r: any, i: number) => (
                  <div key={i} className="relative overflow-hidden p-8 pt-14 rounded-2xl transition-all duration-500 hover:-translate-y-1" style={{ backgroundColor: PANEL, border: `1px solid ${LINE}` }}>
                    <span
                      aria-hidden
                      className="absolute top-1 left-5 leading-none select-none"
                      style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: '4.5rem', color: gold, opacity: 0.3 }}
                    >
                      &ldquo;
                    </span>
                    <p className="leading-relaxed mb-6 relative" style={{ color: 'rgba(245,243,238,0.8)' }}>{r.content}</p>
                    <div className="flex items-center gap-3 relative">
                      {r.avatar && <img src={r.avatar} alt={r.name} className="w-11 h-11 rounded-full object-cover" />}
                      <div>
                        <div className="text-sm font-semibold">{r.name}</div>
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
          <section key={`page-${pi}`} id={`page-${pi}`} className="reveal py-28 md:py-36">
            <div className="max-w-4xl mx-auto px-6 md:px-10">
              <h2 className="text-3xl md:text-5xl font-semibold tracking-tight mb-10" style={{ color: gold }}>{page.title}</h2>
              {page.image && (
                <div className="relative w-full rounded-2xl overflow-hidden mb-10 aspect-[16/9]" style={{ border: `1px solid ${LINE}` }}>
                  <img src={page.image} alt={page.title || ''} className="w-full h-full object-cover" />
                </div>
              )}
              {page.content && <div className="text-lg leading-relaxed whitespace-pre-line text-white/70">{page.content}</div>}
            </div>
          </section>
        ))}

        {/* =================== FAQ ===================
            CHANTIER 2 (MODE 1) -- la FAQ etait rendue par le seul theme
            Editorial, alors que `JsonLd` emet `FAQPage` pour les QUATRE
            themes et que `llms.txt` la publie. Mesure sur
            yiaglobalcommodities.com (theme Vif) : six questions completes
            servies a Google et aux crawlers LLM, et AUCUNE section FAQ dans
            le HTML. Les regles Google Rich Results exigent que le contenu
            balise soit visible sur la page.
            Meme motif qu'Editorial : accordeon <details> autonome, aucune
            dependance ajoutee. Place entre les avis et le contact, comme
            chez Editorial. */}
        {site.faq && site.faq.length > 0 && !hidden('FAQ') && (
          <section id="faq" className="reveal py-28 md:py-36">
            <div className="max-w-3xl mx-auto px-6 md:px-10">
              <div className="text-center mb-16">
                <div className="text-[11px] uppercase tracking-[0.25em] mb-4" style={{ color: gold }}>
                  {t.sections.faqKicker}
                </div>
                <h2 className="text-4xl md:text-5xl font-light leading-tight" style={{ color: '#F5F3EE' }}>
                  {t.sections.faqTitle}
                </h2>
              </div>
              <div className="space-y-4">
                {site.faq.map((item, i) => (
                  <details key={i} className="group rounded-2xl p-6 md:p-8" style={{ border: `1px solid ${LINE}`, backgroundColor: 'rgba(245,243,238,0.03)' }}>
                    <summary className="cursor-pointer list-none font-medium text-lg flex justify-between items-center" style={{ color: '#F5F3EE' }}>
                      {item.question}
                      <span className="ml-4 transition-transform group-open:rotate-45" style={{ color: gold }}>+</span>
                    </summary>
                    <p className="mt-4 leading-relaxed" style={{ color: 'rgba(245,243,238,0.65)' }}>{item.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* =================== CONTACT =================== */}
        {!hidden('Contact') && (
          <section id="contact" className="reveal py-28 md:py-36">
            <div className="max-w-3xl mx-auto px-6 md:px-10 text-center">
              <SectionKicker color={gold} className="justify-center flex">{t.sections.contactKicker}</SectionKicker>
              <h2 className="text-4xl md:text-5xl leading-tight mb-4" style={{ fontFamily: 'var(--font-fraunces), serif' }}>{t.sections.contactTitle}</h2>
              <p className="mb-12" style={{ color: 'rgba(245,243,238,0.7)' }}>{t.sections.contactSubtitle}</p>
              <ContactForm slug={site.slug} lang={site.lang} brand={gold} variant="dark" />

              <div className="grid sm:grid-cols-3 gap-4 mt-10 text-left">
                {contact.phone && (
                  <a href={`tel:${contact.phone}`} className="flex items-center gap-4 p-5 rounded-2xl border transition-all duration-300 hover:-translate-y-0.5" style={{ borderColor: LINE, backgroundColor: 'rgba(245,243,238,0.03)' }}>
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0" style={{ backgroundColor: `${gold}20` }}>
                      <Phone className="w-4 h-4" style={{ color: gold }} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.15em] mb-0.5" style={{ color: 'rgba(245,243,238,0.5)' }}>{t.labels.phone}</div>
                      <div className="text-sm font-medium truncate" style={{ color: '#F5F3EE' }}>{contact.phone}</div>
                    </div>
                  </a>
                )}
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="flex items-center gap-4 p-5 rounded-2xl border transition-all duration-300 hover:-translate-y-0.5" style={{ borderColor: LINE, backgroundColor: 'rgba(245,243,238,0.03)' }}>
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0" style={{ backgroundColor: `${gold}20` }}>
                      <Mail className="w-4 h-4" style={{ color: gold }} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.15em] mb-0.5" style={{ color: 'rgba(245,243,238,0.5)' }}>{t.labels.email}</div>
                      <div className="text-sm font-medium truncate" style={{ color: '#F5F3EE' }}>{contact.email}</div>
                    </div>
                  </a>
                )}
                {contact.address && (
                  <div className="flex items-center gap-4 p-5 rounded-2xl border" style={{ borderColor: LINE, backgroundColor: 'rgba(245,243,238,0.03)' }}>
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0" style={{ backgroundColor: `${gold}20` }}>
                      <MapPin className="w-4 h-4" style={{ color: gold }} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.15em] mb-0.5" style={{ color: 'rgba(245,243,238,0.5)' }}>{t.labels.address}</div>
                      <div className="text-sm font-medium leading-snug" style={{ color: '#F5F3EE' }}>{contact.address}</div>
                    </div>
                  </div>
                )}
              </div>

              <ContactMap lat={site.geo_lat} lng={site.geo_lng} accent={gold} dark className="mt-8" />
            </div>
          </section>
        )}
      </main>

      {/* =================== FOOTER =================== */}
      <footer className="relative py-16" style={{ borderTop: `1px solid ${LINE}`, backgroundColor: VOID }}>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-md h-px" style={{ background: `linear-gradient(90deg, transparent, ${gold}55, transparent)` }} />
        <div className="max-w-7xl mx-auto px-6 md:px-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-xl" style={{ fontFamily: 'var(--font-fraunces), serif' }}>{site.name}</div>
          <div className="flex items-center gap-5">
            {socialUrl('instagram', social.instagram) && <a href={socialUrl('instagram', social.instagram)!} target="_blank" rel="noreferrer" className="transition-colors hover:opacity-70"><Instagram className="w-5 h-5" /></a>}
            {socialUrl('facebook', social.facebook) && <a href={socialUrl('facebook', social.facebook)!} target="_blank" rel="noreferrer" className="transition-colors hover:opacity-70"><Facebook className="w-5 h-5" /></a>}
            {socialUrl('tiktok', social.tiktok) && <a href={socialUrl('tiktok', social.tiktok)!} target="_blank" rel="noreferrer" className="transition-colors hover:opacity-70"><TikTok className="w-5 h-5" /></a>}
            {socialUrl('whatsapp', social.whatsapp) && <a href={socialUrl('whatsapp', social.whatsapp)!} target="_blank" rel="noreferrer" className="transition-colors hover:opacity-70"><WhatsApp className="w-5 h-5" /></a>}
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
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--brand, #888); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { opacity: 0.8; }
        html { scrollbar-width: thin; scrollbar-color: var(--brand, #888) transparent; }
      `}</style>
    </div>
  )
}
