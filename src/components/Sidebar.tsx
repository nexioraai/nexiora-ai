'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/translations';
import {
  Home, LayoutGrid, Settings, Globe, BarChart3,
  Database, MapPin, Menu, X, Zap, Megaphone, Shield,
} from 'lucide-react';

export default function Sidebar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email);
    });
  }, []);

  // Ferme le panneau mobile quand on change de page
  useEffect(() => { setOpen(false); }, [pathname]);



  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : (pathname?.startsWith(href) ?? false);

  const pages = [
    { label: t('sidebar.home'), href: '/', icon: Home },
    { label: t('sidebar.projects'), href: '/dashboard', icon: LayoutGrid },
  ];

  const modules = [
    { label: t('sidebar.aiVisibility'), href: '/visibilite-ia', icon: BarChart3 },
    { label: t('sidebar.marketing'), href: '/dashboard/marketing', icon: Megaphone },
    // { label: t("sidebar.erp"), href: null, icon: Database },
    // { label: t("sidebar.upgrade"), href: null, icon: Zap },
  ];

  const renderItem = ({ label, href, icon: Icon }: { label: string; href: string | null; icon: any }) =>
    href ? (
      <Link key={label} href={href}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
          isActive(href) ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
        }`}>
        <Icon className="w-[18px] h-[18px]" />
        {label}
      </Link>
    ) : (
      <div key={label}
        className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/30 cursor-not-allowed">
        <span className="flex items-center gap-3"><Icon className="w-[18px] h-[18px]" />{label}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/40">{t('sidebar.soon')}</span>
      </div>
    );

  const content = (
    <>
      <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-3 px-2 mb-6">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-lg"
          style={{ background: 'radial-gradient(circle at 30% 30%, #4F6EF5 0%, transparent 60%), radial-gradient(circle at 70% 70%, #E07040 0%, transparent 60%), #16090e' }}>
          N
        </div>
        <span className="text-xl font-black tracking-tight text-nexiora" translate="no">nexiora</span>
      </Link>

      <nav className="flex flex-col gap-1 mb-6">
        {pages.map(renderItem)}
      </nav>

      <div className="text-[11px] uppercase tracking-[0.18em] font-semibold text-white/30 px-3 mb-2">{t('sidebar.section.products')}</div>
      <nav className="flex flex-col gap-1">
        {modules.map(renderItem)}
      </nav>

      <div className="mt-auto pt-4 border-t border-white/8">
        {userEmail === 'issayamiyoussouf@gmail.com' && (
          <Link href="/admin"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all mb-1 ${
              isActive('/admin') ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}>
            <Shield className="w-[18px] h-[18px]" />
            Admin
          </Link>
        )}
        <Link href="/parametres"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all mb-1 ${
            isActive('/parametres') ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}>
          <Settings className="w-[18px] h-[18px]" />
          {t('sidebar.settings')}
        </Link>


      </div>
    </>
  );

  return (
    <>
      {/* Desktop : sidebar fixe */}
      <div className="hidden lg:block w-60 flex-shrink-0" />
      <aside
        className="hidden lg:flex flex-col w-60 h-screen fixed top-0 left-0 border-r border-white/8 px-4 py-5 z-40"
        style={{ background: 'rgba(10,5,14,0.6)' }}
      >
        {content}
      </aside>

      {/* Mobile : logo en haut à gauche */}
      <Link href="/"
        className="lg:hidden fixed top-4 left-4 z-50 flex items-center gap-2 px-3 h-11 rounded-xl backdrop-blur-md border border-white/10"
        style={{ background: 'rgba(10,5,14,0.8)' }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-sm"
          style={{ background: 'radial-gradient(circle at 30% 30%, #4F6EF5 0%, transparent 60%), radial-gradient(circle at 70% 70%, #E07040 0%, transparent 60%), #16090e' }}>
          N
        </div>
        <span className="text-base font-black tracking-tight text-nexiora" translate="no">nexiora</span>
      </Link>

      {/* Mobile : bouton hamburger */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Menu"
        className="lg:hidden fixed top-4 right-4 z-50 w-11 h-11 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/10"
        style={{ background: 'rgba(10,5,14,0.8)' }}
      >
        <Menu className="w-5 h-5 text-white" />
      </button>

      {/* Mobile : panneau coulissant */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-[100]" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <aside
            className="absolute top-0 right-0 h-full w-72 max-w-[85vw] flex flex-col border-l border-white/8 px-4 py-5 overflow-y-auto"
            style={{ background: '#0a050e' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="absolute top-4 right-4 text-white/60 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
