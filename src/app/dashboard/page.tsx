'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, ExternalLink, Pencil, Trash2, LogOut, Globe } from 'lucide-react';
import DashboardMobileNav from '@/components/DashboardMobileNav';
import { supabase } from '@/lib/supabase';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push('/login');
      } else {
        setUser(data.user);
        supabase.from('sites').select('*').eq('owner_email', data.user.email)
          .order('created_at', { ascending: false })
          .then(({ data: sitesData }) => {
            setSites(sitesData || []);
            setLoading(false);
          });
      }
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleDelete = async (slug: string) => {
    if (!confirm('Supprimer ce site ?')) return;
    await supabase.from('sites').delete().eq('slug', slug);
    setSites(sites.filter(s => s.slug !== slug));
  };

  if (loading) return (
    <div className="min-h-screen nexiora-bg flex items-center justify-center">
      <div className="text-white/40 text-lg">Chargement...</div>
    </div>
  );

  return (
    <div className="min-h-screen nexiora-bg text-white">

      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/8 backdrop-blur-md sticky top-0 z-50"
        style={{ background: 'rgba(10,5,14,0.8)' }}>
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-lg"
            style={{ background: 'radial-gradient(circle at 30% 30%, #4F6EF5 0%, transparent 60%), radial-gradient(circle at 70% 70%, #E07040 0%, transparent 60%), #16090e' }}>
            N
          </div>
          <span className="text-xl font-black text-nexiora hidden sm:block">nexiora</span>
        </Link>
        <DashboardMobileNav userEmail={user?.email} onLogout={handleLogout} />
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-10">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] font-medium mb-2" style={{ color: '#E07040' }}>Dashboard</div>
            <h1 className="text-4xl font-black tracking-tight">Mes sites</h1>
          </div>
          <Link href="/" className="btn-nexiora flex items-center gap-2 px-6 py-3 rounded-full text-white font-semibold text-sm">
            <Plus className="w-4 h-4" />
            Nouveau site
          </Link>
        </div>

        {sites.length === 0 ? (
          <div className="text-center py-24 border border-white/8 rounded-3xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <Globe className="w-14 h-14 mx-auto mb-6" style={{ color: 'rgba(255,255,255,0.15)' }} />
            <p className="text-white/40 text-xl mb-6">Aucun site pour l'instant.</p>
            <Link href="/" className="btn-nexiora inline-flex items-center gap-2 px-8 py-3 rounded-full text-white font-semibold">
              <Plus className="w-4 h-4" />
              Générer mon premier site
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {sites.map((site) => (
              <div key={site.slug}
                className="group border border-white/8 rounded-2xl overflow-hidden hover:border-white/20 transition-all duration-300 hover:-translate-y-1"
                style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="h-28 relative flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0"
                    style={{ background: `radial-gradient(ellipse at 50% 50%, ${site.primary_color || '#E07040'}50 0%, transparent 70%), #0a050e` }} />
                  <div className="relative text-center px-4">
                    <h2 className="text-xl font-black text-white">{site.name}</h2>
                    <span className="text-xs px-3 py-1 rounded-full mt-2 inline-block font-medium"
                      style={{ background: `${site.primary_color || '#E07040'}25`, color: site.primary_color || '#E07040' }}>
                      {site.type}
                    </span>
                  </div>
                </div>
                <div className="p-5">
                  {site.slogan && (
                    <p className="text-white/40 text-sm mb-4 line-clamp-2">{site.slogan}</p>
                  )}
                  <div className="flex gap-2">
                    <Link href={`/sites/${site.slug}`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-80"
                      style={{ background: site.primary_color || '#E07040' }}>
                      <ExternalLink className="w-3.5 h-3.5" />
                      Voir
                    </Link>
                    <Link href={`/edit/${site.slug}`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold border border-white/10 text-white/70 hover:text-white hover:border-white/30 transition-all">
                      <Pencil className="w-3.5 h-3.5" />
                      Éditer
                    </Link>
                    <button onClick={() => handleDelete(site.slug)}
                      className="w-10 flex items-center justify-center rounded-xl border border-red-500/20 text-red-400/50 hover:text-red-400 hover:border-red-500/40 transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
