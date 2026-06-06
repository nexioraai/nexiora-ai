'use client';
import { useState, useEffect } from 'react';
import { Menu as MenuIcon, X } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/translations';
import LanguageSwitcher from './LanguageSwitcher';

export default function Navbar() {
  const { t } = useTranslation();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email || null);
      setAuthLoaded(true);
    });
  }, []);

  return (
    <>
    <nav className="flex items-center justify-between px-6 py-4 border-b border-white/8 backdrop-blur-md sticky top-0 z-50"
      style={{ background: 'rgba(10,5,14,0.75)' }}>

      <Link href="/" className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-lg"
          style={{
            background: 'radial-gradient(circle at 30% 30%, #4F6EF5 0%, transparent 60%), radial-gradient(circle at 70% 70%, #E07040 0%, transparent 60%), #16090e'
          }}
        >
          N
        </div>
        <span className="text-xl font-black tracking-tight text-nexiora hidden sm:block">
          nexiora
        </span>
      </Link>

      <div className="flex items-center gap-3 sm:gap-4">
        <LanguageSwitcher />
        {authLoaded && (
          userEmail ? (
            <button
              onClick={() => setMenuOpen(true)}
              className="btn-nexiora p-2.5 rounded-full text-white flex items-center justify-center"
              aria-label="Menu"
            >
              <MenuIcon size={20} />
            </button>
          ) : (
            <>
              <Link
                href="/login"
                className="text-white/70 hover:text-white text-sm font-medium transition-colors hidden sm:inline"
              >
                {t('nav.login')}
              </Link>
              <Link
                href="/signup"
                className="btn-nexiora px-4 sm:px-5 py-2 rounded-full text-white text-sm font-semibold whitespace-nowrap"
              >
                {t('nav.signup')}
              </Link>
            </>
          )
        )}
      </div>
    </nav>

      {/* Hamburger Menu Drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-[100]" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="absolute top-0 right-0 h-full w-80 max-w-[85vw] bg-[#0a050e] border-l border-white/10 shadow-2xl p-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold text-white">Sections</h2>
              <button
                onClick={() => setMenuOpen(false)}
                className="text-white/60 hover:text-white p-2"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-2">
              {['Home', 'About Us', 'Contact', 'Menu'].map((section) => (
                <button
                  key={section}
                  className="w-full text-left px-4 py-3 rounded-xl bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition font-medium"
                >
                  {section}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
