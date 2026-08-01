'use client'

import { useState } from 'react'
import { Menu, X, Plus, LogOut } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from '@/lib/translations'

interface DashboardMobileNavProps {
  userEmail?: string
  onLogout: () => void
}

export default function DashboardMobileNav({ userEmail, onLogout }: DashboardMobileNavProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const closeMenu = () => setIsOpen(false)

  return (
    <div>
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
        aria-label={t('nav.menu')}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <Menu className="w-6 h-6 text-white" />
        )}
      </button>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 top-20"
          onClick={closeMenu}
        />
      )}

      {/* Mobile Menu Drawer */}
      <div
        className={`fixed top-20 right-0 left-0 z-30 bg-neutral-900 border-b border-white/10 shadow-lg transition-all duration-300 ${
          isOpen ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex flex-col divide-y divide-white/10 p-4 gap-2">
          {/* Nouveau site */}
          <Link
            href="/"
            onClick={closeMenu}
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 text-white font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            {t('dashboard.newSite')}
          </Link>

          {/* Email */}
          {userEmail && (
            <div className="px-4 py-3 text-sm text-white/50 break-all">
              {userEmail}
            </div>
          )}

          {/* Déconnexion */}
          <button
            onClick={() => {
              closeMenu()
              onLogout()
            }}
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-red-500/10 text-red-400 font-medium transition-colors w-full text-left"
          >
            <LogOut className="w-5 h-5" />
            {t('sidebar.logout')}
          </button>
        </div>
      </div>
    </div>
  )
}
