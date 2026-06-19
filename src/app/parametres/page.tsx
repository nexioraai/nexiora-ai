'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Sidebar from '@/components/Sidebar';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { LogOut } from 'lucide-react';

export default function ParametresPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>('');
  const [firstName, setFirstName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return; }
      setEmail(data.user.email || '');
      const meta: any = data.user.user_metadata || {};
      const raw = meta.first_name || (meta.full_name || '').split(' ')[0] || '';
      setFirstName(raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '');
      setLoading(false);
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) return (
    <div className="min-h-screen nexiora-bg flex items-center justify-center">
      <div className="text-white/40 text-lg">Chargement...</div>
    </div>
  );

  return (
    <div className="min-h-screen nexiora-bg text-white flex">
      <Sidebar />
      <div className="flex-1 min-w-0 max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10">
          <div className="text-xs uppercase tracking-[0.2em] font-medium mb-2" style={{ color: '#E07040' }}>Paramètres</div>
          <h1 className="text-4xl font-black tracking-tight">Mon compte</h1>
        </div>

        <div className="space-y-6">
          {/* Compte */}
          <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8">
            <h2 className="text-sm font-semibold text-white/70 mb-5 uppercase tracking-wider">Compte</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/40 uppercase tracking-wider font-semibold mb-1.5">Prénom</label>
                <p className="text-lg text-white">{firstName || <span className="text-white/30">Non renseigné</span>}</p>
              </div>
              <div className="pt-4 border-t border-white/10">
                <label className="block text-xs text-white/40 uppercase tracking-wider font-semibold mb-1.5">Email</label>
                <p className="text-lg text-white">{email}</p>
              </div>
            </div>
          </div>

          {/* Langue */}
          <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8">
            <h2 className="text-sm font-semibold text-white/70 mb-5 uppercase tracking-wider">Langue</h2>
            <LanguageSwitcher />
          </div>

          {/* Déconnexion */}
          <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8">
            <button onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold border border-red-500/20 text-red-400/80 hover:text-red-400 hover:border-red-500/40 transition-all">
              <LogOut className="w-[18px] h-[18px]" />
              Déconnexion
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
