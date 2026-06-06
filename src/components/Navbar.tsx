'use client';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/translations';
import LanguageSwitcher from './LanguageSwitcher';
import { Menu as MenuIcon, X, ArrowLeft, Plus, Trash2, Check, Loader2 } from 'lucide-react';

export default function Navbar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentSection, setCurrentSection] = useState<string | null>(null);
  const [site, setSite] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const initialLoad = useRef(true);
  const saveTimeout = useRef<any>(null);

  const slug = pathname?.startsWith('/edit/') ? pathname.split('/')[2] : null;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email || null);
      setAuthLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (slug) {
      initialLoad.current = true;
      supabase.from('sites').select('*').eq('slug', slug).maybeSingle().then(({ data }) => {
        setSite(data);
      });
    }
  }, [slug]);

  // Auto-sync with debounce
  useEffect(() => {
    if (!site || !slug) return;
    if (initialLoad.current) {
      initialLoad.current = false;
      return;
    }

    setSyncStatus('saving');
    if (saveTimeout.current) clearTimeout(saveTimeout.current);

    saveTimeout.current = setTimeout(async () => {
      const { error } = await supabase
        .from('sites')
        .update({
          hero_title: site.hero_title,
          slogan: site.slogan,
          hero_subtitle: site.hero_subtitle,
          about: site.about,
          products: site.products,
          social_links: site.social_links,
        })
        .eq('slug', slug);

      if (!error) {
        setSyncStatus('saved');
        setTimeout(() => setSyncStatus('idle'), 2000);
      } else {
        setSyncStatus('idle');
      }
    }, 1500);

    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [site, slug]);

  const updateField = (field: string, value: any) => {
    setSite({ ...site, [field]: value });
  };

  const updateSocialLink = (key: string, value: string) => {
    setSite({ ...site, social_links: { ...(site.social_links || {}), [key]: value } });
  };

  const updateProduct = (idx: number, key: string, value: string) => {
    const products = [...(site.products || [])];
    products[idx] = { ...products[idx], [key]: value };
    setSite({ ...site, products });
  };

  const addProduct = () => {
    setSite({ ...site, products: [...(site.products || []), { name: '', price: '', description: '' }] });
  };

  const removeProduct = (idx: number) => {
    setSite({ ...site, products: site.products.filter((_: any, i: number) => i !== idx) });
  };

  return (
    <>
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/8 backdrop-blur-md sticky top-0 z-50"
        style={{ background: 'rgba(10,5,14,0.75)' }}>

        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-lg"
            style={{ background: 'radial-gradient(circle at 30% 30%, #4F6EF5 0%, transparent 60%), radial-gradient(circle at 70% 70%, #E07040 0%, transparent 60%), #16090e' }}>
            N
          </div>
          <span className="text-xl font-black tracking-tight text-nexiora hidden sm:block">nexiora</span>
        </Link>

        <div className="flex items-center gap-3 sm:gap-4">
          <LanguageSwitcher />
          {authLoaded && (userEmail ? (
            <button onClick={() => setMenuOpen(true)} className="btn-nexiora p-2.5 rounded-full text-white flex items-center justify-center" aria-label="Menu">
              <MenuIcon size={20} />
            </button>
          ) : (
            <>
              <Link href="/login" className="text-white/70 hover:text-white text-sm font-medium transition-colors hidden sm:inline">{t('nav.login')}</Link>
              <Link href="/signup" className="btn-nexiora px-4 sm:px-5 py-2 rounded-full text-white text-sm font-semibold whitespace-nowrap">{t('nav.signup')}</Link>
            </>
          ))}
        </div>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-[100]" onClick={() => { setMenuOpen(false); setCurrentSection(null); }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="absolute top-0 right-0 h-full w-96 max-w-[90vw] bg-[#0a050e] border-l border-white/10 shadow-2xl p-6 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            
            {!currentSection ? (
              <>
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-xl font-bold text-white">Sections</h2>
                  <button onClick={() => setMenuOpen(false)} className="text-white/60 hover:text-white p-2"><X size={24} /></button>
                </div>

                {!slug && (
                  <div className="mb-4 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-sm">
                    💡 Va sur un de tes sites depuis le Dashboard pour l'éditer
                  </div>
                )}

                <div className="space-y-2">
                  {['Home', 'About Us', 'Contact', 'Menu'].map((section) => (
                    <button key={section} onClick={() => setCurrentSection(section)} disabled={!slug}
                      className="w-full text-left px-4 py-3 rounded-xl bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition font-medium disabled:opacity-40 disabled:cursor-not-allowed">
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
                  <div className="flex items-center gap-3">
                    {syncStatus === 'saving' && (
                      <span className="text-xs text-yellow-400 flex items-center gap-1"><Loader2 size={14} className="animate-spin" /> Sync...</span>
                    )}
                    {syncStatus === 'saved' && (
                      <span className="text-xs text-green-400 flex items-center gap-1"><Check size={14} /> Synced</span>
                    )}
                    <button onClick={() => { setMenuOpen(false); setCurrentSection(null); }} className="text-white/60 hover:text-white p-2"><X size={24} /></button>
                  </div>
                </div>

                <h2 className="text-2xl font-bold text-white mb-6">{currentSection}</h2>

                {/* HOME */}
                {currentSection === 'Home' && site && (
                  <div className="space-y-4">
                    <Field label="Hero Title" value={site.hero_title || ''} onChange={(v) => updateField('hero_title', v)} />
                    <Field label="Slogan" value={site.slogan || ''} onChange={(v) => updateField('slogan', v)} />
                    <Field label="Hero Subtitle" value={site.hero_subtitle || ''} onChange={(v) => updateField('hero_subtitle', v)} />
                  </div>
                )}

                {/* ABOUT US */}
                {currentSection === 'About Us' && site && (
                  <div className="space-y-4">
                    <TextArea label="About description" value={site.about || ''} onChange={(v) => updateField('about', v)} rows={8} />
                  </div>
                )}

                {/* CONTACT */}
                {currentSection === 'Contact' && site && (
                  <div className="space-y-4">
                    <Field label="📞 Phone" value={site.social_links?.phone || ''} onChange={(v) => updateSocialLink('phone', v)} />
                    <Field label="📧 Email" value={site.social_links?.email || ''} onChange={(v) => updateSocialLink('email', v)} />
                    <Field label="📍 Address" value={site.social_links?.address || ''} onChange={(v) => updateSocialLink('address', v)} />
                    <Field label="Facebook" value={site.social_links?.facebook || ''} onChange={(v) => updateSocialLink('facebook', v)} />
                    <Field label="Instagram" value={site.social_links?.instagram || ''} onChange={(v) => updateSocialLink('instagram', v)} />
                  </div>
                )}

                {/* MENU */}
                {currentSection === 'Menu' && site && (
                  <div className="space-y-4">
                    {(site.products || []).map((product: any, idx: number) => (
                      <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">Item #{idx + 1}</span>
                          <button onClick={() => removeProduct(idx)} className="text-red-400 hover:text-red-300 p-1">
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <input value={product.name || ''} onChange={(e) => updateProduct(idx, 'name', e.target.value)} placeholder="Name" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#E07040]" />
                        <input value={product.price || ''} onChange={(e) => updateProduct(idx, 'price', e.target.value)} placeholder="Price" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#E07040]" />
                        <textarea value={product.description || ''} onChange={(e) => updateProduct(idx, 'description', e.target.value)} placeholder="Description" rows={2} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#E07040] resize-y" />
                      </div>
                    ))}
                    <button onClick={addProduct} className="w-full px-4 py-3 rounded-xl bg-[#E07040]/10 hover:bg-[#E07040]/20 text-[#E07040] font-semibold transition border border-[#E07040]/20 flex items-center justify-center gap-2">
                      <Plus size={18} /> Add Item
                    </button>
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

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#E07040]" />
    </div>
  );
}

function TextArea({ label, value, onChange, rows = 5 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#E07040] resize-y" />
    </div>
  );
}
