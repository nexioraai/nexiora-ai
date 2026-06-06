'use client';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/translations';
import LanguageSwitcher from './LanguageSwitcher';
import { Menu as MenuIcon, X, ArrowLeft } from 'lucide-react';

export default function Navbar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentSection, setCurrentSection] = useState<string | null>(null);
  const [site, setSite] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const slug = pathname?.startsWith('/edit/') ? pathname.split('/')[2] : null;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email || null);
      setAuthLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (slug) {
      supabase.from('sites').select('*').eq('slug', slug).maybeSingle().then(({ data }) => {
        setSite(data);
      });
    }
  }, [slug]);

  const updateField = (field: string, value: string) => {
    setSite({ ...site, [field]: value });
  };

  const handleSave = async () => {
    if (!site) return;
    setSaving(true);
    setSavedMsg('');
    const { error } = await supabase
      .from('sites')
      .update({
        hero_title: site.hero_title,
        slogan: site.slogan,
        about: site.about,
        hero_subtitle: site.hero_subtitle,
      })
      .eq('slug', slug);
    setSaving(false);
    if (error) {
      setSavedMsg('Erreur: ' + error.message);
    } else {
      setSavedMsg('✓ Saved! Site mis à jour');
      setTimeout(() => setSavedMsg(''), 3000);
    }
  };

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
        <div className="fixed inset-0 z-[100]" onClick={() => { setMenuOpen(false); setCurrentSection(null); }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="absolute top-0 right-0 h-full w-96 max-w-[90vw] bg-[#0a050e] border-l border-white/10 shadow-2xl p-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {!currentSection ? (
              <>
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-xl font-bold text-white">Sections</h2>
                  <button onClick={() => setMenuOpen(false)} className="text-white/60 hover:text-white p-2">
                    <X size={24} />
                  </button>
                </div>

                {!slug && (
                  <div className="mb-4 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-sm">
                    💡 Va sur un de tes sites depuis le Dashboard pour l'éditer
                  </div>
                )}

                <div className="space-y-2">
                  {['Home', 'About Us', 'Contact', 'Menu'].map((section) => (
                    <button
                      key={section}
                      onClick={() => setCurrentSection(section)}
                      disabled={!slug}
                      className="w-full text-left px-4 py-3 rounded-xl bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {section}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-6">
                  <button onClick={() => setCurrentSection(null)} className="text-white/60 hover:text-white p-2 flex items-center gap-1 text-sm">
                    <ArrowLeft size={16} /> Retour
                  </button>
                  <button onClick={() => { setMenuOpen(false); setCurrentSection(null); }} className="text-white/60 hover:text-white p-2">
                    <X size={24} />
                  </button>
                </div>

                <h2 className="text-2xl font-bold text-white mb-6">{currentSection}</h2>

                {currentSection === 'Home' && site && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">Hero Title</label>
                      <input
                        value={site.hero_title || ''}
                        onChange={(e) => updateField('hero_title', e.target.value)}
                        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#E07040]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">Slogan</label>
                      <input
                        value={site.slogan || ''}
                        onChange={(e) => updateField('slogan', e.target.value)}
                        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#E07040]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">Hero Subtitle</label>
                      <input
                        value={site.hero_subtitle || ''}
                        onChange={(e) => updateField('hero_subtitle', e.target.value)}
                        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#E07040]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">About</label>
                      <textarea
                        value={site.about || ''}
                        onChange={(e) => updateField('about', e.target.value)}
                        rows={5}
                        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#E07040] resize-y"
                      />
                    </div>

                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="w-full btn-nexiora py-3 rounded-xl font-semibold transition disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>

                    {savedMsg && (
                      <div className="text-center text-sm text-green-400 mt-2">{savedMsg}</div>
                    )}
                  </div>
                )}

                {currentSection !== 'Home' && (
                  <div className="text-center text-white/40 py-12">
                    Éditeur {currentSection} bientôt disponible
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
