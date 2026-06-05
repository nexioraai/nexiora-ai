'use client'

import { useState } from 'react'
import { Menu, X, ArrowRight } from 'lucide-react'

interface MobileNavProps {
  site: {
    slug: string
    name: string
    primary_color?: string
    products?: any[]
  }
  cta: string
  ctaHref: string
}

export default function MobileNav({ site, cta, ctaHref }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const primary = site.primary_color || '#111111'
  const hasShop = (site.products?.length || 0) > 0
  const closeMenu = () => setIsOpen(false)

  const navLinks = [
    { href: '#about', label: 'About' },
    { href: '#services', label: 'Services' },
    ...(hasShop ? [{ href: '#shop', label: 'Shop' }] : []),
    { href: '#gallery', label: 'Gallery' },
    { href: '#testimonials', label: 'Reviews' },
    { href: '#contact', label: 'Contact' },
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
