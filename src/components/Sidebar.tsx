'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Home, LayoutGrid, Settings, Globe, BarChart3,
  Database, MapPin, Plus, LogOut,
} from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || null));
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : (pathname?.startsWith(href) ?? false);

  const pages = [
    { label: 'Accueil', href: '/', icon: Home },
    { label: 'Mes projets', href: '/dashboard', icon: LayoutGrid },
  ];

  const modules = [
    { label: 'Sites Web', href: '/dashboard', icon: Globe },
    { label: 'Visibilité IA', href: '/dashboard', icon: BarChart3 },
    { label: 'ERP', href: null, icon: Database },
    { label: 'Business Maps', href: null, icon: MapPin },
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
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/40">bientôt</span>
      </div>
    );

  return (
    <aside
      className="hidden lg:flex flex-col w-60 h-screen sticky top-0 border-r border-white/8 px-4 py-5"
      style={{ background: 'rgba(10,5,14,0.6)' }}
    >
      <Link href="/" className="flex items-center gap-3 px-2 mb-6">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-lg"
          style={{ background: 'radial-gradient(circle at 30% 30%, #4F6EF5 0%, transparent 60%), radial-gradient(circle at 70% 70%, #E07040 0%, transparent 60%), #16090e' }}>
          N
        </div>
        <span className="text-xl font-black tracking-tight text-nexiora">nexiora</span>
      </Link>

      <nav className="flex flex-col gap-1 mb-6">
        {pages.map(renderItem)}
      </nav>

      <div className="text-[11px] uppercase tracking-[0.18em] font-semibold text-white/30 px-3 mb-2">Modules</div>
      <nav className="flex flex-col gap-1">
        {modules.map(renderItem)}
      </nav>

      <div className="mt-auto pt-4 border-t border-white/8">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/30 cursor-not-allowed mb-1">
          <span className="flex items-center gap-3"><Settings className="w-[18px] h-[18px]" />Paramètres</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/40">bientôt</span>
        </div>
        {email && (
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #4F6EF5 0%, #E07040 100%)' }}>
              {email[0].toUpperCase()}
            </div>
            <span className="text-xs text-white/50 truncate">{email}</span>
          </div>
        )}
        <button onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-all w-full">
          <LogOut className="w-[18px] h-[18px]" />
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
