'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/translations';
import LanguageSwitcher from './LanguageSwitcher';
import { Menu } from 'lucide-react';

export default function Navbar() {
  const { t } = useTranslation();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email || null);
      setAuthLoaded(true);
    });
  }, []);

  return (
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
              className="btn-nexiora p-2.5 rounded-full text-white flex items-center justify-center"
              aria-label="Menu"
            >
              <Menu size={20} />
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
  );
}
