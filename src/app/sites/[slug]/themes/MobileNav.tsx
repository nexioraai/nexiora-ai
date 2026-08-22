'use client'

import { useState } from 'react'
import { Menu, X, ArrowRight } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { getDict } from './i18n'
import { getModeCapabilities } from './modeCapabilities'

interface MobileNavProps {
  site: {
    slug: string
    name: string
    primary_color?: string
    products?: any[]
    lang?: string
    hidden_sections?: string[]
    mode?: number | null
  }
  cta: string
  ctaHref: string
  // Optionnel, retro-compatible : Editorial/Vif/Aurora ne le passent pas et
  // conservent donc exactement le panneau clair actuel (aucun diff visuel).
  // 'dark' n'est utilise que par Noir -- ce panneau etait code en dur en
  // blanc (bg-white/95, text-neutral-800...) quel que soit le theme du site,
  // meme categorie de probleme deja rencontree sur CatalogSearch et
  // ContactForm : decouvert a l'audit final en ouvrant reellement le menu
  // mobile sur Cosmopo, panneau entierement blanc sur un site entierement
  // sombre. Le bouton CTA garde `primary_color` du marchand tel quel (deja
  // le comportement etabli ailleurs, ex. PromoBanner) -- seuls le panneau,
  // le fond, les liens et le bouton bascule sont rendus theme-aware.
  variant?: 'light' | 'dark'
}

export default function MobileNav({ site, cta, ctaHref, variant = 'light' }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const isDark = variant === 'dark'
  const primary = site.primary_color || '#111111'
  const t = getDict(site.lang)
  // Source de verite inchangee depuis la Phase 1 -- ne touche jamais a ce
  // calcul en modernisant l'apparence du menu. Voir modeCapabilities.ts.
  const { hasShop } = getModeCapabilities(site)
  const hidden = (name: string) => (site.hidden_sections || []).includes(name)
  const closeMenu = () => setIsOpen(false)
  const reduceMotion = useReducedMotion()

  const navLinks = [
    ...(!hidden('About') ? [{ href: '#about', label: t.nav.about }] : []),
    ...(!hidden('Services') ? [{ href: '#services', label: t.nav.services }] : []),
    ...(hasShop && !hidden('Shop') ? [{ href: '#shop', label: t.nav.shop }] : []),
    ...(!hidden('Gallery') ? [{ href: '#gallery', label: t.nav.gallery }] : []),
    ...(!hidden('Reviews') ? [{ href: '#testimonials', label: t.nav.reviews }] : []),
    ...(!hidden('Contact') ? [{ href: '#contact', label: t.nav.contact }] : []),
  ]

  return (
    <div className="md:hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed top-5 right-5 z-[60] flex items-center justify-center w-11 h-11 rounded-full backdrop-blur-md border shadow-sm transition-transform active:scale-95 ${isDark ? 'bg-black/50 border-white/15' : 'bg-white/80 border-black/10'}`}
        aria-label={isOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        aria-expanded={isOpen}
      >
        {isOpen ? <X className={`w-5 h-5 ${isDark ? 'text-white' : 'text-neutral-900'}`} /> : <Menu className={`w-5 h-5 ${isDark ? 'text-white' : 'text-neutral-900'}`} />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="scrim"
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.25 }}
              onClick={closeMenu}
            />
            <motion.div
              key="panel"
              className={`fixed top-0 right-0 bottom-0 z-50 w-[82vw] max-w-sm backdrop-blur-xl shadow-2xl flex flex-col ${isDark ? 'bg-[#0A0806]/95' : 'bg-white/95'}`}
              initial={{ x: reduceMotion ? 0 : '100%', opacity: reduceMotion ? 0 : 1 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: reduceMotion ? 0 : '100%', opacity: reduceMotion ? 0 : 1 }}
              transition={{ type: reduceMotion ? 'tween' : 'spring', stiffness: 320, damping: 34, duration: reduceMotion ? 0.15 : undefined }}
            >
              <nav className="flex-1 overflow-y-auto pt-24 px-2 pb-6">
                {navLinks.map((link, i) => (
                  <motion.a
                    key={link.href}
                    href={link.href}
                    onClick={closeMenu}
                    className={`block px-5 py-4 rounded-2xl text-base font-medium transition-colors ${isDark ? 'text-white/90 hover:bg-white/10' : 'text-neutral-800 hover:bg-neutral-100'}`}
                    initial={{ opacity: 0, x: reduceMotion ? 0 : 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: reduceMotion ? 0 : 0.05 + i * 0.04, duration: 0.25 }}
                  >
                    {link.label}
                  </motion.a>
                ))}
              </nav>
              <div className="p-5 pt-0">
                <a
                  href={ctaHref}
                  onClick={closeMenu}
                  className="inline-flex items-center gap-2 w-full justify-center px-4 py-3.5 rounded-full text-white text-sm font-semibold shadow-lg transition-transform active:scale-95"
                  style={{ backgroundColor: primary }}
                >
                  {cta}
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
