'use client'

import { useState } from 'react'
import { Menu, X, ArrowRight } from 'lucide-react'
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
}

export default function MobileNav({ site, cta, ctaHref }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const primary = site.primary_color || '#111111'
  const t = getDict(site.lang)
  // Avant correction : (site.products?.length || 0) > 0, sans jamais
  // verifier le mode -- un site Mode 1 avec des lignes "products" orphelines
  // affichait un lien Shop mort, ET un site Mode 3 sans produit charge
  // masquait a tort son lien Shop (incoherent avec la nav desktop, qui
  // affiche toujours Shop en mode 3). Meme source de verite que partout
  // ailleurs desormais.
  const { hasShop } = getModeCapabilities(site)
  const hidden = (name: string) => (site.hidden_sections || []).includes(name)
  const closeMenu = () => setIsOpen(false)

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
      <button onClick={() => setIsOpen(!isOpen)} className="fixed top-20 right-6 z-50 p-2 rounded-lg hover:bg-white/10" aria-label="Menu">
        {isOpen ? <X className="w-6 h-6 text-neutral-900" /> : <Menu className="w-6 h-6 text-neutral-900" />}
      </button>
      {isOpen && <div className="fixed inset-0 bg-black/20 z-40 top-20" onClick={closeMenu} />}
      <div className={`fixed top-20 right-0 left-0 z-40 bg-white border-b border-neutral-200/70 shadow-lg transition-all duration-300 ${isOpen ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`}>
        <nav className="flex flex-col divide-y divide-neutral-200/70">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} onClick={closeMenu} className="px-6 py-4 text-sm font-medium text-neutral-700 hover:text-black hover:bg-neutral-50">
              {link.label}
            </a>
          ))}
          <div className="px-6 py-4">
            <a href={ctaHref} onClick={closeMenu} className="inline-flex items-center gap-2 w-full justify-center px-4 py-3 rounded-full text-white text-sm font-medium" style={{ backgroundColor: primary }}>
              {cta}
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </nav>
      </div>
    </div>
  )
}
