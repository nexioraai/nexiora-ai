'use client';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { fetchOwnedSite, updateOwnedSite } from '@/lib/supabase-owned-site';
import { useTranslation } from '@/lib/translations';
import LanguageSwitcher from './LanguageSwitcher';
import { SUPPORTED_LANGUAGES } from '@/lib/i18n/supportedLanguages';
import { Menu as MenuIcon, X, ArrowLeft, Plus, Trash2, Check, Loader2, Upload, Eye, EyeOff, MapPin } from 'lucide-react';

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
  const isHome = pathname === '/';

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email || null);
      setAuthLoaded(true);
    });
  }, []);

  // Audit Mode 3/POD BRAND, perfectionnement (lot 2) -- cause racine :
  // Navbar est un "editeur de site complet" (voir historique git) monte sur
  // TOUTE page /edit/[slug], y compris quand edit/[slug]/page.tsx affiche
  // deja "site introuvable" (utilisateur non proprietaire) -- ce fetch
  // tournait pourtant independamment, sans AUCUN filtre d'ownership
  // (`select('*').eq('slug', slug)` seul), chargeant l'integralite du site
  // d'un tiers dans l'etat local `site`, ensuite reecrivable via l'effet
  // d'auto-sync ci-dessous. Attend desormais `userEmail` (memes garanties
  // que le filtre deja applique par edit/[slug]/page.tsx et
  // requireSiteOwner cote serveur) avant toute lecture -- fetchOwnedSite()
  // ne peut renvoyer que le site DU vrai proprietaire authentifie.
  useEffect(() => {
    if (!slug || !authLoaded) return;
    if (!userEmail) {
      setSite(null);
      return;
    }
    initialLoad.current = true;
    fetchOwnedSite(slug, userEmail).then((data) => {
      setSite(data);
    });
  }, [slug, userEmail, authLoaded]);

  // Generic auto-sync: update ALL columns automatically
  useEffect(() => {
    // site.owner_email necessaire pour reconstruire le meme filtre que la
    // lecture ci-dessus : `site` ne peut avoir ete charge que via
    // fetchOwnedSite() (filtre par owner_email), donc site.owner_email est
    // necessairement celui de l'utilisateur authentifie courant -- jamais
    // une valeur controlable differemment par un tiers.
    if (!site || !slug || !site.owner_email) return;
    if (initialLoad.current) {
      initialLoad.current = false;
      return;
    }

    setSyncStatus('saving');
    if (saveTimeout.current) clearTimeout(saveTimeout.current);

    saveTimeout.current = setTimeout(async () => {
      const updates = { ...site };
      delete updates.id;
      delete updates.slug;
      delete updates.owner_email;
      delete updates.created_at;
      delete updates.updated_at;

      const { error } = await updateOwnedSite(slug, site.owner_email, updates);
      if (!error) {
        setSyncStatus('saved');
        setTimeout(() => setSyncStatus('idle'), 2000);
      } else {
        console.error('Sync error:', error);
        setSyncStatus('idle');
      }
    }, 1500);

    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [site, slug]);

  // Audit Mode 3/POD BRAND, perfectionnement (lot 2) -- garde defensive
  // ajoutee sur TOUS les mutateurs locaux : avant ce lot, `site` etait
  // TOUJOURS non-null pour un slug valide (fetch sans filtre), donc ces
  // fonctions n'avaient jamais besoin de gerer `site === null`. Depuis le
  // correctif ci-dessus, un visiteur authentifie mais non-proprietaire a
  // desormais `site === null` -- plusieurs boutons ne sont gardes que par
  // `disabled={!slug}` dans le JSX (ex. le bouton masquer/afficher une
  // section), pas par `!site` : sans cette garde, les cliquer sur
  // /edit/{slug-d-un-tiers} aurait fait planter le composant
  // (`Cannot read properties of null`) plutot que de ne rien faire.
  const updateField = (field: string, value: any) => { if (!site) return; setSite({ ...site, [field]: value }); };
  const updateSocialLink = (key: string, value: string) => { if (!site) return; setSite({ ...site, social_links: { ...(site.social_links || {}), [key]: value } }); };
  const updateContact = (key: string, value: string) => { if (!site) return; setSite({ ...site, contact: { ...(site.contact || {}), [key]: value } }); };
  const [geocoding, setGeocoding] = useState(false);
  const geocodeAddress = async () => {
    const addr = site?.contact?.address;
    if (!addr || !site?.owner_email) return;
    setGeocoding(true);
    try {
      const res = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr }),
      });
      const data = await res.json();
      if (data.lat != null && data.lng != null) {
        setSite((prev: any) => ({ ...prev, geo_lat: data.lat, geo_lng: data.lng }));
        await updateOwnedSite(slug!, site.owner_email, { geo_lat: data.lat, geo_lng: data.lng });
      }
    } catch (e) {
      console.error('Geocode failed:', e);
    } finally {
      setGeocoding(false);
    }
  };

  // Generic array helpers
  const updateArrayItem = (field: string, idx: number, key: string, value: any) => {
    if (!site) return;
    const arr = [...(site[field] || [])];
    arr[idx] = { ...arr[idx], [key]: value };
    setSite({ ...site, [field]: arr });
  };
  const toggleSection = (section: string) => {
    if (!site) return;
    const hidden = site.hidden_sections || [];
    const next = hidden.includes(section) ? hidden.filter((x: string) => x !== section) : [...hidden, section];
    setSite({ ...site, hidden_sections: next });
  };
  const addArrayItem = (field: string, template: any) => { if (!site) return; setSite({ ...site, [field]: [...(site[field] || []), template] }); };
  const removeArrayItem = (field: string, idx: number) => { if (!site) return; setSite({ ...site, [field]: site[field].filter((_: any, i: number) => i !== idx) }); };

  // Nested section item helpers (sections[si].items[ii].key)
  const updateSectionItem = (si: number, ii: number, key: string, value: any) => {
    if (!site) return;
    const secs = [...(site.sections || [])];
    const items = [...(secs[si].items || [])];
    items[ii] = { ...items[ii], [key]: value };
    secs[si] = { ...secs[si], items };
    setSite({ ...site, sections: secs });
  };
  const updateSectionName = (si: number, value: string) => {
    if (!site) return;
    const secs = [...(site.sections || [])];
    secs[si] = { ...secs[si], name: value };
    setSite({ ...site, sections: secs });
  };

  // Image upload helper
  const uploadImage = async (file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop();
    const path = `${slug}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('site-images').upload(path, file);
    if (error) { console.error(error); return null; }
    const { data } = supabase.storage.from('site-images').getPublicUrl(path);
    return data.publicUrl;
  };

  return (
    <>
      <nav className="flex items-center justify-between px-6 py-4 sticky top-0 z-50"
        style={{ background: 'transparent' }}>
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-lg"
            style={{ background: 'radial-gradient(circle at 30% 30%, #4F6EF5 0%, transparent 60%), radial-gradient(circle at 70% 70%, #FA5D1E 0%, transparent 60%), #16090e' }}>
            W
          </div>
          <span className="text-xl font-black tracking-tight text-nexiora hidden sm:block" translate="no">deribfy</span>
        </Link>
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/about" className="text-white/70 hover:text-white text-sm font-medium transition-colors hidden sm:inline">{t('nav.about')}</Link>
          <Link href="/pricing" className="text-white/70 hover:text-white text-sm font-medium transition-colors hidden sm:inline">{t('nav.pricing')}</Link>
          {!isHome && <LanguageSwitcher />}
          {authLoaded && (userEmail ? (
            !isHome && <button onClick={() => setMenuOpen(true)} className="btn-nexiora p-2.5 rounded-full text-white flex items-center justify-center" aria-label="Menu">
              <MenuIcon size={20} />
            </button>
          ) : (
            !isHome && <>
              <Link href="/login" className="text-white/70 hover:text-white text-sm font-medium transition-colors hidden sm:inline">{t('nav.login')}</Link>
              <Link href="/login" className="btn-nexiora px-4 sm:px-5 py-2 rounded-full text-white text-sm font-semibold whitespace-nowrap">{t('nav.signup')}</Link>
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
                  <h2 className="text-xl font-bold text-white">{t('naved.sections')}</h2>
                  <button onClick={() => setMenuOpen(false)} className="text-white/60 hover:text-white p-2"><X size={24} /></button>
                </div>
                {!slug && (
                  <div className="mb-4 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-sm">
                    💡 {t('naved.goToSite')}
                  </div>
                )}
                <div className="space-y-2">
                  {(() => {
                    const sections = ['Home', 'About', 'Services'];
                    if (site?.products && site.products.length > 0) sections.push('Shop');
                    sections.push('Gallery', 'Reviews', 'FAQ', 'Contact');
                    (site?.sections || []).forEach((sec: any) => { if (sec?.name) sections.push(sec.name); });
                    return sections;
                  })().map((section) => {
                    const isHidden = (site?.hidden_sections || []).includes(section);
                    return (
                    <div key={section} className={`flex items-center gap-2 rounded-xl bg-white/5 transition ${isHidden ? 'opacity-40' : ''}`}>
                      <button onClick={() => setCurrentSection(section)} disabled={!slug}
                        className="flex-1 text-left px-4 py-3 text-white/80 hover:text-white transition font-medium disabled:cursor-not-allowed">
                        {section}
                      </button>
                      <button onClick={() => toggleSection(section)} disabled={!slug} title={isHidden ? t('naved.showOnSite') : t('naved.hideFromSite')}
                        className="px-3 py-3 text-white/50 hover:text-white transition disabled:opacity-40">
                        {isHidden ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    );
                  })}

                  {/* Custom Pages */}
                  {(site?.pages || []).map((page: any, idx: number) => (
                    <button key={'page-' + idx} onClick={() => setCurrentSection('page:' + idx)}
                      className="w-full text-left px-4 py-3 rounded-xl bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition font-medium flex items-center justify-between">
                      <span>{page.title || t('naved.untitledPage')}</span>
                      <span className="text-xs text-[#FA5D1E]">{t('naved.custom')}</span>
                    </button>
                  ))}

                  {/* Add Page Button */}
                  {slug && (
                    <button onClick={() => {
                      const newPages = [...(site?.pages || []), { title: t('naved.newPage'), content: '' }];
                      setSite({ ...site, pages: newPages });
                      setCurrentSection('page:' + (newPages.length - 1));
                    }}
                      className="w-full px-4 py-3 rounded-xl bg-[#FA5D1E]/10 hover:bg-[#FA5D1E]/20 text-[#FA5D1E] font-semibold transition border border-[#FA5D1E]/20 border-dashed flex items-center justify-center gap-2 mt-3">
                      <Plus size={18} /> {t('naved.addPage')}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-6">
                  <button onClick={() => setCurrentSection(null)} className="text-white/60 hover:text-white p-2 flex items-center gap-1 text-sm">
                    <ArrowLeft size={16} /> Retour
                  </button>
                  <div className="flex items-center gap-3">
                    {syncStatus === 'saving' && <span className="text-xs text-yellow-400 flex items-center gap-1"><Loader2 size={14} className="animate-spin" /> Sync...</span>}
                    {syncStatus === 'saved' && <span className="text-xs text-green-400 flex items-center gap-1"><Check size={14} /> Synced</span>}
                    <button onClick={() => { setMenuOpen(false); setCurrentSection(null); }} className="text-white/60 hover:text-white p-2"><X size={24} /></button>
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-white mb-6">
                  {currentSection?.startsWith('page:') 
                    ? site?.pages?.[parseInt(currentSection.split(':')[1])]?.title || t('naved.page')
                    : currentSection}
                </h2>

                {/* HOME */}
                {currentSection === 'Home' && site && (
                  <div className="space-y-4">
                    <Field label="Business Name" value={site.name || ''} onChange={(v) => updateField('name', v)} />
                    <Field label="Hero Title" value={site.hero_title || ''} onChange={(v) => updateField('hero_title', v)} />
                    <Field label="Slogan" value={site.slogan || ''} onChange={(v) => updateField('slogan', v)} />
                    <Field label="Hero Subtitle" value={site.hero_subtitle || ''} onChange={(v) => updateField('hero_subtitle', v)} />
                    <div>
                      <label className="block text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">Primary Color</label>
                      <input type="color" value={site.primary_color || '#FA5D1E'} onChange={(e) => updateField('primary_color', e.target.value)} className="w-24 h-12 rounded-xl border border-white/10 bg-transparent cursor-pointer" />
                    </div>
                    {/* CHANTIER 3 (MODE 1) -- `sites.lang` DEVIENT EDITABLE.
                        La colonne etait ecrite une fois, a la generation, a
                        partir de la langue detectee dans la conversation
                        d'onboarding -- et plus jamais. Mesure sur
                        yiaglobalcommodities.com : contenu entierement anglais,
                        `lang` a `fr`, aucun chemin pour le corriger.
                        Menu deroulant et non champ libre : le depot possede
                        deja l'enum des langues qu'il sait servir, et proposer
                        `de` ou `pt` livrerait un site a moitie traduit.
                        AUCUNE seconde voie d'ecriture : `updateField` alimente
                        la sauvegarde automatique existante (`updateOwnedSite`,
                        l.80), qui portait deja `lang` dans son aller-retour. */}
                    <div>
                      <label className="block text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">Site Language</label>
                      <select
                        value={site.lang || ''}
                        onChange={(e) => updateField('lang', e.target.value)}
                        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#FA5D1E] cursor-pointer"
                        aria-label="Site Language"
                      >
                        {!SUPPORTED_LANGUAGES.some((l) => l.code === site.lang) && (
                          <option value={site.lang || ''} disabled>
                            {site.lang ? `${site.lang} (unsupported)` : 'Not set'}
                          </option>
                        )}
                        {SUPPORTED_LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs text-slate-500">
                        Changes the interface labels, navigation and metadata of your site. Your own text is not translated.
                      </p>
                    </div>
                    <Field label="CTA Button Text" value={site.cta || ''} onChange={(v) => updateField('cta', v)} />
                    <div className="pt-4 border-t border-white/10">
                      <label className="block text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">Hero Image</label>
                      {site.hero_image && (
                        <div className="relative group rounded-xl overflow-hidden mb-3">
                          <img src={site.hero_image} alt="hero" className="w-full h-40 object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                            <label className="bg-[#FA5D1E] text-white p-2 rounded-lg cursor-pointer" title={t('naved.replace')}>
                              <Upload size={16} />
                              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const newUrl = await uploadImage(file);
                                if (newUrl) updateField('hero_image', newUrl);
                              }} />
                            </label>
                            <button onClick={() => updateField('hero_image', null)} className="bg-red-500 text-white p-2 rounded-lg">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      )}
                      {!site.hero_image && (
                        <label className="block w-full text-center bg-[#FA5D1E]/10 hover:bg-[#FA5D1E]/20 text-[#FA5D1E] py-4 rounded-xl cursor-pointer font-semibold transition border border-[#FA5D1E]/20">
                          <Plus size={18} className="inline mr-2" /> Upload Hero Image
                          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const newUrl = await uploadImage(file);
                            if (newUrl) updateField('hero_image', newUrl);
                          }} />
                        </label>
                      )}
                    </div>
                  </div>
                )}

                {/* ABOUT */}
                {currentSection === 'About' && site && (
                  <div className="space-y-4">
                    <TextArea label="About description" value={site.about || ''} onChange={(v) => updateField('about', v)} rows={8} />
                    <TextArea label="Mission" value={site.mission || ''} onChange={(v) => updateField('mission', v)} rows={3} />
                    <TextArea label="Vision" value={site.vision || ''} onChange={(v) => updateField('vision', v)} rows={3} />
                    <div className="pt-4 border-t border-white/10">
                      <h3 className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-3">Pourquoi nous (points forts)</h3>
                    </div>
                    {(site.whyus || []).map((item: any, idx: number) => (
                      <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">Point #{idx + 1}</span>
                          <button onClick={() => removeArrayItem('whyus', idx)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={16} /></button>
                        </div>
                        <input value={item.title || ''} onChange={(e) => updateArrayItem('whyus', idx, 'title', e.target.value)} placeholder={t('naved.phTitle')} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E]" />
                        <textarea value={item.text || ''} onChange={(e) => updateArrayItem('whyus', idx, 'text', e.target.value)} placeholder={t('naved.phDescription')} rows={2} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E] resize-y" />
                      </div>
                    ))}
                    <button onClick={() => addArrayItem('whyus', { title: '', text: '' })} className="w-full px-4 py-3 rounded-xl bg-[#FA5D1E]/10 hover:bg-[#FA5D1E]/20 text-[#FA5D1E] font-semibold transition border border-[#FA5D1E]/20 flex items-center justify-center gap-2">
                      <Plus size={18} /> {t('naved.addPoint')}
                    </button>
                  </div>
                )}

                {/* SERVICES */}
                {currentSection === 'Services' && site && (
                  <div className="space-y-4">
                    {(site.services || []).map((service: any, idx: number) => (
                      <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">{t('naved.service')} #{idx + 1}</span>
                          <button onClick={() => removeArrayItem('services', idx)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={16} /></button>
                        </div>
                        <input value={service.name || service.title || ''} onChange={(e) => updateArrayItem('services', idx, 'name', e.target.value)} placeholder={t('naved.phServiceName')} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E]" />
                        <textarea value={service.description || ''} onChange={(e) => updateArrayItem('services', idx, 'description', e.target.value)} placeholder={t('naved.phDescription')} rows={3} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E] resize-y" />
                      </div>
                    ))}
                    <button onClick={() => addArrayItem('services', { name: '', description: '' })} className="w-full px-4 py-3 rounded-xl bg-[#FA5D1E]/10 hover:bg-[#FA5D1E]/20 text-[#FA5D1E] font-semibold transition border border-[#FA5D1E]/20 flex items-center justify-center gap-2">
                      <Plus size={18} /> {t('naved.addService')}
                    </button>
                  </div>
                )}

                {/* REVIEWS */}
                {currentSection === 'Reviews' && site && (
                  <div className="space-y-4">
                    {(site.testimonials || []).map((t: any, idx: number) => (
                      <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">{t('naved.review')} #{idx + 1}</span>
                          <button onClick={() => removeArrayItem('testimonials', idx)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={16} /></button>
                        </div>
                        <input value={t.name || t.author || ''} onChange={(e) => updateArrayItem('testimonials', idx, 'name', e.target.value)} placeholder={t('naved.phCustomerName')} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E]" />
                        <textarea value={t.content || t.text || ''} onChange={(e) => updateArrayItem('testimonials', idx, 'content', e.target.value)} placeholder={t('naved.phReviewContent')} rows={3} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E] resize-y" />
                        <input type="number" min="1" max="5" value={t.rating || 5} onChange={(e) => updateArrayItem('testimonials', idx, 'rating', parseInt(e.target.value))} placeholder={t('naved.phRating')} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E]" />
                      </div>
                    ))}
                    <button onClick={() => addArrayItem('testimonials', { name: '', content: '', rating: 5 })} className="w-full px-4 py-3 rounded-xl bg-[#FA5D1E]/10 hover:bg-[#FA5D1E]/20 text-[#FA5D1E] font-semibold transition border border-[#FA5D1E]/20 flex items-center justify-center gap-2">
                      <Plus size={18} /> {t('naved.addReview')}
                    </button>
                  </div>
                )}

                {/* CUSTOM PAGE EDITOR */}
                {currentSection?.startsWith('page:') && site && (() => {
                  const pageIdx = parseInt(currentSection.split(':')[1]);
                  const page = site.pages?.[pageIdx];
                  if (!page) return <div className="text-white/40">{t('naved.pageNotFound')}</div>;
                  return (
                    <div className="space-y-4">
                      <Field label={t('naved.pageTitle')} value={page.title || ''} onChange={(v) => updateArrayItem('pages', pageIdx, 'title', v)} />
                      {page.image ? (
                        <div className="relative group rounded-lg overflow-hidden">
                          <img src={page.image} alt="" className="w-full h-32 object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                            <label className="bg-[#FA5D1E] hover:bg-[#FA5D1E]/80 text-white p-2 rounded-lg cursor-pointer transition" title={t('naved.replace')}>
                              <Upload size={16} />
                              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const url = await uploadImage(file);
                                if (url) updateArrayItem('pages', pageIdx, 'image', url);
                              }} />
                            </label>
                            <button onClick={() => updateArrayItem('pages', pageIdx, 'image', null)} className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-lg transition" title={t('naved.delete')}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <label className="block w-full text-center bg-[#FA5D1E]/10 hover:bg-[#FA5D1E]/20 text-[#FA5D1E] py-3 rounded-lg cursor-pointer font-semibold transition border border-[#FA5D1E]/20 text-sm">
                          <Plus size={16} className="inline mr-1" /> {t('naved.addPhoto')}
                          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const url = await uploadImage(file);
                            if (url) updateArrayItem('pages', pageIdx, 'image', url);
                          }} />
                        </label>
                      )}
                      <TextArea label={t('naved.content')} value={page.content || ''} onChange={(v) => updateArrayItem('pages', pageIdx, 'content', v)} rows={10} />
                      <button onClick={() => { removeArrayItem('pages', pageIdx); setCurrentSection(null); }}
                        className="w-full px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold transition border border-red-500/20 flex items-center justify-center gap-2">
                        <Trash2 size={16} /> {t('naved.deletePage')}
                      </button>
                    </div>
                  );
                })()}

                {/* CONTACT */}
                {currentSection === 'Contact' && site && (
                  <div className="space-y-4">
                    <Field label={t('naved.phone')} value={site.contact?.phone || ''} onChange={(v) => updateContact('phone', v)} />
                    <Field label={t('naved.email')} value={site.contact?.email || ''} onChange={(v) => updateContact('email', v)} />
                    <Field label={t('naved.address')} value={site.contact?.address || site.address || ''} onChange={(v) => updateContact('address', v)} />
                    <button onClick={geocodeAddress} disabled={geocoding} className="w-full px-4 py-2.5 rounded-xl bg-[#FA5D1E]/10 hover:bg-[#FA5D1E]/20 text-[#FA5D1E] font-semibold text-sm transition border border-[#FA5D1E]/20 flex items-center justify-center gap-2 disabled:opacity-50">
                      {geocoding ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
                      {geocoding ? t('naved.locating') : t('naved.locateOnMap')}
                    </button>
                    <div className="pt-4 border-t border-white/10">
                      <h3 className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-3">{t('naved.socialNetworks')}</h3>
                    </div>
                    <Field label="📘 Facebook" value={site.social_links?.facebook || ''} onChange={(v) => updateSocialLink('facebook', v)} />
                    <Field label="📸 Instagram" value={site.social_links?.instagram || ''} onChange={(v) => updateSocialLink('instagram', v)} />
                    <Field label="🎵 TikTok" value={site.social_links?.tiktok || ''} onChange={(v) => updateSocialLink('tiktok', v)} />
                    <Field label="💬 WhatsApp" value={site.social_links?.whatsapp || ''} onChange={(v) => updateSocialLink('whatsapp', v)} />
                    <Field label="👻 Snapchat" value={site.social_links?.snapchat || ''} onChange={(v) => updateSocialLink('snapchat', v)} />
                    <Field label="🐦 Twitter / X" value={site.social_links?.twitter || ''} onChange={(v) => updateSocialLink('twitter', v)} />
                    <Field label="📺 YouTube" value={site.social_links?.youtube || ''} onChange={(v) => updateSocialLink('youtube', v)} />
                    <Field label="💼 LinkedIn" value={site.social_links?.linkedin || ''} onChange={(v) => updateSocialLink('linkedin', v)} />
                  </div>
                )}

                {/* SHOP */}
                {currentSection === 'Shop' && site && (
                  <div className="space-y-4">
                    {(site.products || []).map((product: any, idx: number) => (
                      <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">{t('naved.item')} #{idx + 1}</span>
                          <button onClick={() => removeArrayItem('products', idx)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={16} /></button>
                        </div>
                        {product.image ? (
                          <div className="relative group rounded-lg overflow-hidden">
                            <img src={product.image} alt="" className="w-full h-32 object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                              <label className="bg-[#FA5D1E] hover:bg-[#FA5D1E]/80 text-white p-2 rounded-lg cursor-pointer transition" title={t('naved.replace')}>
                                <Upload size={16} />
                                <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const url = await uploadImage(file);
                                  if (url) updateArrayItem('products', idx, 'image', url);
                                }} />
                              </label>
                              <button onClick={() => updateArrayItem('products', idx, 'image', null)} className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-lg transition" title={t('naved.delete')}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label className="block w-full text-center bg-[#FA5D1E]/10 hover:bg-[#FA5D1E]/20 text-[#FA5D1E] py-3 rounded-lg cursor-pointer font-semibold transition border border-[#FA5D1E]/20 text-sm">
                            <Plus size={16} className="inline mr-1" /> {t('naved.addPhoto')}
                            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const url = await uploadImage(file);
                              if (url) updateArrayItem('products', idx, 'image', url);
                            }} />
                          </label>
                        )}
                        <input value={product.name || ''} onChange={(e) => updateArrayItem('products', idx, 'name', e.target.value)} placeholder={t('naved.phName')} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E]" />
                        <input value={product.price || ''} onChange={(e) => updateArrayItem('products', idx, 'price', e.target.value)} placeholder={t('naved.phPrice')} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E]" />
                        <textarea value={product.description || ''} onChange={(e) => updateArrayItem('products', idx, 'description', e.target.value)} placeholder={t('naved.phDescription')} rows={2} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E] resize-y" />
                      </div>
                    ))}
                    <button onClick={() => addArrayItem('products', { name: '', price: '', description: '' })} className="w-full px-4 py-3 rounded-xl bg-[#FA5D1E]/10 hover:bg-[#FA5D1E]/20 text-[#FA5D1E] font-semibold transition border border-[#FA5D1E]/20 flex items-center justify-center gap-2">
                      <Plus size={18} /> {t('naved.addItem')}
                    </button>
                  </div>
                )}

                {/* DYNAMIC SECTIONS (IA) */}
                {site && (site.sections || []).map((sec: any, si: number) => (
                  currentSection === sec.name && (
                    <div key={si} className="space-y-4">
                      {(sec.items || []).map((item: any, ii: number) => (
                        <div key={ii} className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                          <span className="text-xs text-slate-400">Item #{ii + 1}</span>
                          {item.image ? (
                            <div className="relative group rounded-lg overflow-hidden">
                              <img src={item.image} alt="" className="w-full h-32 object-cover" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                                <label className="bg-[#FA5D1E] hover:bg-[#FA5D1E]/80 text-white p-2 rounded-lg cursor-pointer transition" title={t('naved.replace')}>
                                  <Upload size={16} />
                                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const url = await uploadImage(file);
                                    if (url) updateSectionItem(si, ii, 'image', url);
                                  }} />
                                </label>
                              </div>
                            </div>
                          ) : (
                            <label className="block w-full text-center bg-[#FA5D1E]/10 hover:bg-[#FA5D1E]/20 text-[#FA5D1E] py-3 rounded-lg cursor-pointer font-semibold transition border border-[#FA5D1E]/20 text-sm">
                              <Plus size={16} className="inline mr-1" /> {t('naved.addPhoto')}
                              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const url = await uploadImage(file);
                                if (url) updateSectionItem(si, ii, 'image', url);
                              }} />
                            </label>
                          )}
                          <input value={item.title || ''} onChange={(e) => updateSectionItem(si, ii, 'title', e.target.value)} placeholder={t('naved.phTitle')} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E]" />
                          <textarea value={item.description || ''} onChange={(e) => updateSectionItem(si, ii, 'description', e.target.value)} placeholder={t('naved.phDescription')} rows={3} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E] resize-y" />
                          {item.price !== undefined && (
                            <input value={item.price || ''} onChange={(e) => updateSectionItem(si, ii, 'price', e.target.value)} placeholder={t('naved.phPriceBadge')} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E]" />
                          )}
                        </div>
                      ))}
                    </div>
                  )
                ))}

                {/* REVIEWS */}
                {currentSection === 'Reviews' && site && (
                  <div className="space-y-4">
                    {(site.testimonials || []).map((item: any, idx: number) => (
                      <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">{t('naved.review')} #{idx + 1}</span>
                          <button onClick={() => removeArrayItem('testimonials', idx)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={16} /></button>
                        </div>
                        <input value={item.name || ''} onChange={(e) => updateArrayItem('testimonials', idx, 'name', e.target.value)} placeholder={t('naved.phName')} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E]" />
                        <input value={item.role || ''} onChange={(e) => updateArrayItem('testimonials', idx, 'role', e.target.value)} placeholder={t('naved.phRole')} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E]" />
                        <input value={item.rating || ''} onChange={(e) => updateArrayItem('testimonials', idx, 'rating', e.target.value)} placeholder={t('naved.phRating')} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E]" />
                        <textarea value={item.content || ''} onChange={(e) => updateArrayItem('testimonials', idx, 'content', e.target.value)} placeholder={t('naved.phTestimonial')} rows={3} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E] resize-y" />
                      </div>
                    ))}
                    <button onClick={() => addArrayItem('testimonials', { name: '', role: '', rating: '5', content: '' })} className="w-full px-4 py-3 rounded-xl bg-[#FA5D1E]/10 hover:bg-[#FA5D1E]/20 text-[#FA5D1E] font-semibold transition border border-[#FA5D1E]/20 flex items-center justify-center gap-2">
                      <Plus size={18} /> {t('naved.addReview')}
                    </button>
                  </div>
                )}

                {/* FAQ */}
                {currentSection === 'FAQ' && site && (
                  <div className="space-y-4">
                    {(site.faq || []).map((item: any, idx: number) => (
                      <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">Q{idx + 1}</span>
                          <button onClick={() => removeArrayItem('faq', idx)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={16} /></button>
                        </div>
                        <input value={item.question || ''} onChange={(e) => updateArrayItem('faq', idx, 'question', e.target.value)} placeholder={t('naved.phQuestion')} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E]" />
                        <textarea value={item.answer || ''} onChange={(e) => updateArrayItem('faq', idx, 'answer', e.target.value)} placeholder={t('naved.phAnswer')} rows={3} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E] resize-y" />
                      </div>
                    ))}
                    <button onClick={() => addArrayItem('faq', { question: '', answer: '' })} className="w-full px-4 py-3 rounded-xl bg-[#FA5D1E]/10 hover:bg-[#FA5D1E]/20 text-[#FA5D1E] font-semibold transition border border-[#FA5D1E]/20 flex items-center justify-center gap-2">
                      <Plus size={18} /> {t('naved.addQuestion')}
                    </button>
                  </div>
                )}

                {/* GALLERY */}
                {currentSection === 'Gallery' && site && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      {(site.gallery || []).map((img: any, idx: number) => {
                        const url = typeof img === 'string' ? img : img.url;
                        return (
                          <div key={idx} className="relative group rounded-xl overflow-hidden">
                            <img src={url} alt="" className="w-full h-36 object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                              <label className="bg-[#FA5D1E] hover:bg-[#FA5D1E]/80 text-white p-2 rounded-lg cursor-pointer transition" title={t('naved.replace')}>
                                <Upload size={16} />
                                <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const newUrl = await uploadImage(file);
                                  if (newUrl) {
                                    const newGallery = [...site.gallery];
                                    newGallery[idx] = typeof img === 'string' ? newUrl : { ...img, url: newUrl };
                                    setSite({ ...site, gallery: newGallery });
                                  }
                                }} />
                              </label>
                              <button onClick={() => removeArrayItem('gallery', idx)} className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-lg transition" title={t('naved.delete')}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                            <div className="absolute top-2 right-2 flex gap-1 sm:hidden">
                              <button onClick={() => removeArrayItem('gallery', idx)} className="bg-red-500/90 text-white p-1.5 rounded-lg">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <label className="block w-full text-center bg-[#FA5D1E]/10 hover:bg-[#FA5D1E]/20 text-[#FA5D1E] py-4 rounded-xl cursor-pointer font-semibold transition border border-[#FA5D1E]/20">
                      <Plus size={18} className="inline mr-2" /> {t('naved.addImage')}
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const url = await uploadImage(file);
                        if (url) addArrayItem('gallery', url);
                      }} />
                    </label>
                  </div>
                )}

                {/* PAGES */}
                {currentSection === 'Pages' && site && (
                  <div className="space-y-4">
                    {(site.pages || []).map((page: any, idx: number) => (
                      <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">{t('naved.page')} #{idx + 1}</span>
                          <button onClick={() => removeArrayItem('pages', idx)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={16} /></button>
                        </div>
                        <input value={page.title || ''} onChange={(e) => updateArrayItem('pages', idx, 'title', e.target.value)} placeholder={t('naved.phPageTitleEx')} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E]" />
                        <textarea value={page.content || ''} onChange={(e) => updateArrayItem('pages', idx, 'content', e.target.value)} placeholder={t('naved.content')} rows={4} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FA5D1E] resize-y" />
                      </div>
                    ))}
                    <button onClick={() => addArrayItem('pages', { title: '', content: '' })} className="w-full px-4 py-3 rounded-xl bg-[#FA5D1E]/10 hover:bg-[#FA5D1E]/20 text-[#FA5D1E] font-semibold transition border border-[#FA5D1E]/20 flex items-center justify-center gap-2">
                      <Plus size={18} /> {t('naved.addPage')}
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
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#FA5D1E]" />
    </div>
  );
}

function TextArea({ label, value, onChange, rows = 5 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#FA5D1E] resize-y" />
    </div>
  );
}
