'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/translations';

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ThemeSelector from '@/components/edit/ThemeSelector';
import AIAgentChat from '@/components/edit/AIAgentChat';
import ProductManager from '@/components/edit/ProductManager';
import PaymentConnect from '@/components/edit/PaymentConnect';
import CatalogSelections from '@/components/edit/CatalogSelections';
import OrderManager from '@/components/edit/OrderManager';
import FinanceDashboard from '@/components/edit/FinanceDashboard';
import HealthBadge from '@/components/edit/HealthBadge';
import { MIN_MARGIN_PERCENT, LOW_MARGIN_PERCENT, NEXIORA_COMMISSION_PERCENT, DEFAULT_MARGIN_PERCENT, merchantProfit } from '@/lib/pricing';
import { supabase } from '@/lib/supabase';
import { computeAiScore } from '@/app/lib/aiScore';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function EditPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { t } = useTranslation();

  const [site, setSite] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [podDesigns, setPodDesigns] = useState<{url: string; name: string; created_at: string}[]>([]);
  const [uploadingDesign, setUploadingDesign] = useState(false);
  const [generatingMockups, setGeneratingMockups] = useState(false);
  const [podCatalog, setPodCatalog] = useState<any[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Record<string, {selected: boolean; sellPrice: number; variantId?: string}>>({});
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<{ score: number; date: string; reason: string }[]>([]);
  const initialPassed = useRef<string[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push('/login');
        return;
      }
      supabase.from('sites').select('*').eq('slug', slug).eq('owner_email', data.user.email!).maybeSingle().then(({ data: siteData }) => {
        setSite(siteData);
        if (siteData) {
          initialPassed.current = computeAiScore(siteData as any).passed;
          setPodDesigns(Array.isArray((siteData as any).pod_designs) ? (siteData as any).pod_designs : []);
          // Restore selected products from pod_designs
          const designs = Array.isArray((siteData as any).pod_designs) ? (siteData as any).pod_designs : [];
          if (designs[0]?.selected_products) {
            setSelectedProducts(designs[0].selected_products);
          }
        }
        setLoading(false);
      });
      supabase.from('score_history').select('score, created_at, reason').eq('slug', slug).order('created_at', { ascending: true }).then(({ data: hist }) => {
        setHistory((hist || []).map((h: any) => ({
          score: h.score,
          reason: h.reason || '',
          date: new Date(h.created_at).toLocaleString('fr-CA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
        })));
      });
    });
  }, [slug]);

  const updateField = (field: string, value: any) => {
    setSite({ ...site, [field]: value });
  };

  const handleImageUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage('');
    const ext = file.name.split('.').pop();
    const path = `${slug}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('site-images').upload(path, file);
    if (uploadError) {
      setMessage('Upload error: ' + uploadError.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from('site-images').getPublicUrl(path);
    setSite({ ...site, hero_image: data.publicUrl });
    setUploading(false);
    setMessage('Image uploaded! Click Save Changes to keep it.');
  };

  const handleSave = async () => {
    // Verrou rentabilite : jamais de marge sous le seuil de perte (mode 3)
    if (site?.mode === 3 && (site?.dropship_type === 'reseller' || site?.dropship_type === 'pod_custom' || site?.dropship_type === 'pod_brand')) {
      const m = Number(site.cj_margin_percent ?? DEFAULT_MARGIN_PERCENT);
      if (m < MIN_MARGIN_PERCENT) {
        setMessage('Marge trop basse : minimum ' + MIN_MARGIN_PERCENT + '% pour ne pas vendre a perte (commission Woorri ' + NEXIORA_COMMISSION_PERCENT + '%).');
        return;
      }
    }
    setSaving(true);
    setMessage('');
    const { error } = await supabase
      .from('sites')
      .update({
        name: site.name,
        slogan: site.slogan,
        type: site.type,
        about: site.about,
        hero_title: site.hero_title,
        hero_subtitle: site.hero_subtitle,
        primary_color: site.primary_color,
        hero_image: site.hero_image,
        theme: site.theme,
        cj_margin_percent: site.cj_margin_percent,
        cj_round_mode: site.cj_round_mode,
        pod_designs: podDesigns.length > 0
          ? podDesigns.map((d: any, i: number) => i === 0 ? { ...d, selected_products: selectedProducts } : d)
          : podDesigns,
      })
      .eq('slug', slug);
    setSaving(false);
    if (error) {
      setMessage('Error: ' + error.message);
    } else {
      setMessage('Saved!');
      // Enregistre un point d'historique du score (non bloquant)
      try {
        const { score, passed } = computeAiScore(site as any);
        const gained = passed.filter((p) => !initialPassed.current.includes(p));
        const reason = gained.length > 0 ? gained.join(', ') : t('edit.score.contentUpdate');
        await supabase.from('score_history').insert({ slug, score, reason });
        initialPassed.current = passed;
      } catch (e) {
        console.error('score_history insert failed:', e);
      }
      setTimeout(() => setMessage(''), 3000);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen nexiora-bg text-white flex items-center justify-center">
        <div className="text-slate-400">Loading…</div>
      </main>
    );
  }

  if (!site) {
    return (
      <main className="min-h-screen nexiora-bg text-white">
        <Navbar />
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <h1 className="text-3xl font-bold mb-4">Site not found</h1>
          <Link href="/dashboard" className="text-[#FA5D1E] hover:underline">← Back to Dashboard</Link>
        </div>
        <Footer />
      </main>
    );
  }

  const isError = message.toLowerCase().startsWith('error') || message.toLowerCase().startsWith('upload error');

  return (
    <main className="min-h-screen nexiora-bg text-white">
      <Navbar />
      <div className="grid-bg fixed inset-0 pointer-events-none z-0" aria-hidden="true" />

      <section className="max-w-3xl mx-auto px-6 pt-12 pb-24">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10">
          <div>
            <Link href="/dashboard" className="text-sm text-slate-400 hover:text-white transition-all duration-200 mb-2 inline-block hover:-translate-x-1">
              ← Dashboard
            </Link>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight">
              Edit <span className="text-nexiora">{site.name}</span>
            </h1>
            <div className="mt-3">
              <HealthBadge aiScore={computeAiScore(site as any).score} />
            </div>
          </div>
          <Link
            href={`/preview/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start sm:self-auto px-5 py-2.5 rounded-xl text-sm font-semibold bg-white/5 border border-white/10 hover:bg-white/10 transition whitespace-nowrap"
          >
            View Site →
          </Link>
        </div>


        {/* Bloc Visibilite IA */}
        {(() => {
          const { score, missing } = computeAiScore(site as any);
          const color = score >= 80 ? '#34d399' : score >= 50 ? '#FA5D1E' : '#f87171';
          const data = history.length >= 1 ? history : [{ score, date: "Aujourd'hui", reason: '' }];
          return (
            <div className="glass glass-hover rounded-3xl p-6 md:p-8 mb-8">
              <div className="flex flex-col md:flex-row md:items-stretch gap-6">
                <div className="md:w-1/3 flex flex-col justify-center">
                  <p className="text-sm font-semibold text-white/60 mb-1">{t('edit.aivis.title')}</p>
                  <p className="text-5xl font-black leading-none" style={{ color }}>{score}<span className="text-white/30 text-2xl font-medium">/100</span></p>
                  <p className="text-xs text-white/40 mt-2">{missing.length === 0 ? t('edit.aivis.max') : t('edit.aivis.actionsToReach').replace('{count}', String(missing.length))}</p>
                </div>
                <div className="md:w-2/3">
                  <div style={{ width: '100%', height: 160 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={color} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                        <Tooltip
                          contentStyle={{ background: '#1a0e22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff', fontSize: 12 }}
                          labelStyle={{ color: 'rgba(255,255,255,0.5)' }}
                          content={({ active, payload, label }: any) => {
                            if (!active || !payload || !payload.length) return null;
                            const p = payload[0].payload;
                            return (
                              <div style={{ background: '#1a0e22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '8px 12px', fontSize: 12, color: '#fff', maxWidth: 220 }}>
                                <div style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</div>
                                <div style={{ fontWeight: 700, color }}>{p.score}/100</div>
                                {p.reason && <div style={{ color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{p.reason}</div>}
                              </div>
                            );
                          }}
                        />
                        <Area type="monotone" dataKey="score" stroke={color} strokeWidth={2.5} fill="url(#scoreGrad)" dot={{ fill: color, r: 4 }} activeDot={{ r: 6 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[11px] text-white/30 mt-1 text-center">{t('edit.aivis.scoreEvolution')}</p>
                </div>
              </div>
              {missing.length > 0 && (
                <div className="mt-6 pt-6 border-t border-white/10">
                  <p className="text-sm font-semibold text-white/70 mb-3">{t('edit.aivis.improve')}</p>
                  <ul className="space-y-2">
                    {missing.map((m, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-white/60">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })()}

        {/* Form card */}
        <div className="glass glass-hover rounded-3xl p-6 md:p-8 space-y-6">

          <ThemeSelector currentTheme={site.theme || "editorial"} onThemeChange={(t) => updateField("theme", t)} />

          <FieldSection label="Hero Image">
            {site.hero_image && (
              <img src={site.hero_image} alt="hero" className="w-full max-h-48 object-cover rounded-xl mb-3 border border-white/10" />
            )}
            <label className="block w-full text-center bg-[#FA5D1E]/10 hover:bg-[#FA5D1E]/20 text-[#FA5D1E] py-3 rounded-xl cursor-pointer font-semibold transition border border-[#FA5D1E]/20">
              {uploading ? 'Uploading…' : 'Upload an image'}
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
          </FieldSection>

          <Field label="Business Name" value={site.name} onChange={(v) => updateField('name', v)} />
          <Field label="Type" value={site.type} onChange={(v) => updateField('type', v)} />
          <Field label="Slogan" value={site.slogan} onChange={(v) => updateField('slogan', v)} />
          <Field label="Hero Title" value={site.hero_title} onChange={(v) => updateField('hero_title', v)} />
          <Field label="Hero Subtitle" value={site.hero_subtitle} onChange={(v) => updateField('hero_subtitle', v)} />
          <TextAreaField label="About" value={site.about} onChange={(v) => updateField('about', v)} rows={4} />

          <FieldSection label="Primary Color">
            <input
              type="color"
              value={site.primary_color || '#FA5D1E'}
              onChange={(e) => updateField('primary_color', e.target.value)}
              className="w-24 h-12 rounded-xl border border-white/10 bg-transparent cursor-pointer"
            />
          </FieldSection>

          {/* Margin control — visible for mode 3 reseller & pod_custom */}
          {site?.mode === 3 && (site?.dropship_type === 'reseller' || site?.dropship_type === 'pod_custom' || site?.dropship_type === 'pod_brand') && (
            <FieldSection label={t('edit.margin.label')}>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={MIN_MARGIN_PERCENT}
                  value={site.cj_margin_percent ?? DEFAULT_MARGIN_PERCENT}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    updateField('cj_margin_percent', Number.isNaN(v) ? MIN_MARGIN_PERCENT : v);
                  }}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isNaN(v) || v < MIN_MARGIN_PERCENT) {
                      updateField('cj_margin_percent', MIN_MARGIN_PERCENT);
                    }
                  }}
                  className="w-24 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-center focus:outline-none focus:border-[#FA5D1E] transition"
                />
                <span className="text-slate-400 text-lg">%</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {t('edit.margin.formula')}
              </p>
              {(() => {
                const m = site.cj_margin_percent ?? DEFAULT_MARGIN_PERCENT;
                const round = site.cj_round_mode || 'off';
                const profit10 = merchantProfit(10, m, round);
                if (m < MIN_MARGIN_PERCENT) {
                  return (
                    <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3">
                      <p className="text-sm text-red-300 font-medium">{t('edit.margin.insufficientTitle')}</p>
                      <p className="text-xs text-red-200/80 mt-1">
                        {t('edit.margin.insufficientBody').replace('{margin}', String(m)).replace('{profit}', profit10.toFixed(2)).replace('{commission}', String(NEXIORA_COMMISSION_PERCENT)).replace('{min}', String(MIN_MARGIN_PERCENT))}
                      </p>
                    </div>
                  );
                }
                if (m < LOW_MARGIN_PERCENT) {
                  return (
                    <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                      <p className="text-sm text-amber-300 font-medium">{t('edit.margin.lowTitle')}</p>
                      <p className="text-xs text-amber-200/80 mt-1">
                        {t('edit.margin.lowBody').replace('{commission}', String(NEXIORA_COMMISSION_PERCENT)).replace('{profit}', profit10.toFixed(2))}
                      </p>
                    </div>
                  );
                }
                return (
                  <p className="text-xs text-emerald-400/80 mt-2">
                    {t('edit.margin.netProfit').replace('{profit}', profit10.toFixed(2)).replace('{commission}', String(NEXIORA_COMMISSION_PERCENT))}
                  </p>
                );
              })()}
            </FieldSection>
          )}

          {/* Round .99 — visible for mode 3 reseller & pod_custom */}
          {site?.mode === 3 && (site?.dropship_type === 'reseller' || site?.dropship_type === 'pod_custom' || site?.dropship_type === 'pod_brand') && (
            <FieldSection label={t('edit.round.label')}>
              <div className="flex gap-2 flex-wrap">
                {[
                  { value: 'off', label: t('edit.round.off') },
                  { value: 'down', label: t('edit.round.down') },
                  { value: 'up', label: t('edit.round.up') },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => updateField('cj_round_mode', opt.value)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${
                      (site.cj_round_mode || 'off') === opt.value
                        ? 'bg-[#FA5D1E]/20 border-[#FA5D1E] text-[#FA5D1E]'
                        : 'border-white/10 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {t('edit.round.help')}
              </p>
            </FieldSection>
          )}

          {/* POD Designs — pod_brand only (in pod_custom the visitor uploads at checkout) */}
          {(site as any).dropship_type === 'pod_brand' && (
            <FieldSection label="Mes Designs POD">
              <div className="space-y-3">
                {podDesigns.map((d, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white/[0.03] border border-white/10 rounded-xl p-3">
                    <img src={d.url} alt={d.name} className="w-14 h-14 rounded-lg object-cover border border-white/10" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate">{d.name}</p>
                      <p className="text-xs text-slate-500">{new Date(d.created_at).toLocaleDateString('fr-CA')}</p>
                    </div>
                    <button
                      onClick={() => {
                        const updated = podDesigns.filter((_, j) => j !== i);
                        setPodDesigns(updated);
                        updateField('pod_designs', updated);
                      }}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-white/20 text-sm text-slate-400 hover:border-[#FA5D1E] hover:text-slate-200 cursor-pointer transition">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/svg+xml,image/webp,image/tiff,application/pdf"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingDesign(true);
                      try {
                        const ext = (file.name.split('.').pop() || 'png').toLowerCase();
                        const path = `${slug}/${Date.now()}.${ext}`;
                        const { error } = await supabase.storage.from('pod-designs').upload(path, file);
                        if (error) throw error;
                        const { data } = supabase.storage.from('pod-designs').getPublicUrl(path);
                        const newDesign = { url: data.publicUrl, name: file.name, created_at: new Date().toISOString() };
                        const updated = [...podDesigns, newDesign];
                        setPodDesigns(updated);
                        updateField('pod_designs', updated);
                        setMessage('Design uploaded!');
                      } catch (err: any) {
                        setMessage('Upload error: ' + (err.message || err));
                      } finally {
                        setUploadingDesign(false);
                        e.target.value = '';
                      }
                    }}
                  />
                  {uploadingDesign ? 'Uploading…' : '+ Ajouter un design'}
                </label>
                <p className="text-xs text-slate-500">{t('edit.upload.formats')}</p>
                {podDesigns.length > 0 && (
                  <div className="space-y-3">
                    <button
                      onClick={async () => {
                        setLoadingCatalog(true);
                        try {
                          const res = await fetch('/api/pod/catalog');
                          const data = await res.json();
                          setPodCatalog(data.products || []);
                        } catch (e) { console.error(e); }
                        setLoadingCatalog(false);
                      }}
                      disabled={loadingCatalog}
                      className="w-full py-2 rounded-xl border border-white/20 text-sm text-slate-300 hover:border-[#FA5D1E] transition disabled:opacity-40"
                    >
                      {loadingCatalog ? t('edit.catalog.loading') : podCatalog.length > 0 ? t('edit.catalog.loaded').replace('{count}', String(podCatalog.length)) : t('edit.catalog.choose')}
                    </button>
                    {podCatalog.length > 0 && (
                      <div className="space-y-2 border border-white/10 rounded-xl p-3">
                        <input
                          type="text"
                          placeholder="Rechercher un produit…"
                          value={catalogSearch}
                          onChange={(e) => setCatalogSearch(e.target.value)}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 mb-2"
                        />
                        <div className="max-h-72 overflow-y-auto space-y-2">
                        {podCatalog.filter((p: any) => !catalogSearch || p.name.toLowerCase().includes(catalogSearch.toLowerCase())).map((p: any) => {
                          const sel = selectedProducts[p.product_id];
                          return (
                            <div key={p.product_id} className={`flex items-center gap-3 p-2 rounded-lg transition ${sel?.selected ? 'bg-[#FA5D1E]/10 border border-[#FA5D1E]/30' : 'bg-white/5 border border-transparent'}`}>
                              <input
                                type="checkbox"
                                checked={!!sel?.selected}
                                onChange={(e) => setSelectedProducts(prev => ({
                                  ...prev,
                                  [p.product_id]: {
                                    selected: e.target.checked,
                                    sellPrice: prev[p.product_id]?.sellPrice || Math.ceil(p.price * 2),
                                    variantId: prev[p.product_id]?.variantId,
                                    variants: p.variants || [],
                                  }
                                }))}
                                className="accent-[#FA5D1E]"
                              />
                              {p.image ? <img src={p.image} alt="" className="w-10 h-10 rounded object-cover" /> : <div className="w-10 h-10 rounded bg-white/10 flex items-center justify-center text-lg">{p.name?.charAt(0)}</div>}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-white truncate">{p.name}</div>
                                <div className="text-xs text-slate-400">Coût: {p.price} {p.currency}</div>
                              </div>
                              {sel?.selected && (
                                <div className="flex items-center gap-2 flex-wrap">
                                  {p.variants?.length > 1 && (
                                    <select
                                      value={sel.variantId || p.variants[0]?.variant_id}
                                      onChange={(e) => setSelectedProducts(prev => ({
                                        ...prev,
                                        [p.product_id]: { ...prev[p.product_id], variantId: e.target.value }
                                      }))}
                                      className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-xs text-white max-w-[120px]"
                                    >
                                      {p.variants.map((v: any) => (
                                        <option key={v.variant_id} value={v.variant_id}>{v.label}</option>
                                      ))}
                                    </select>
                                  )}
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-slate-400">Vente:</span>
                                    <input
                                      type="number"
                                      value={sel.sellPrice}
                                      onChange={(e) => setSelectedProducts(prev => ({
                                        ...prev,
                                        [p.product_id]: { ...prev[p.product_id], sellPrice: Number(e.target.value) }
                                      }))}
                                      className="w-16 bg-white/10 border border-white/20 rounded px-1 py-0.5 text-sm text-white text-right"
                                    />
                                    <span className="text-xs text-slate-400">{p.currency}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div className="text-xs text-slate-400 pt-1">
                          {t('edit.catalog.selected').replace('{count}', String(Object.values(selectedProducts).filter((v: any) => v.selected).length))}
                        </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {podDesigns.length > 0 && Object.values(selectedProducts).some((v: any) => v.selected) && (
                  <button
                    onClick={async () => {
                      setGeneratingMockups(true);
                      setMessage(t('edit.catalog.saving'));
                      try {
                        // Auto-save selected_products before generating
                        const updatedDesigns = podDesigns.length > 0
                          ? podDesigns.map((d: any, i: number) => i === 0 ? { ...d, selected_products: selectedProducts } : d)
                          : podDesigns;
                        await supabase.from('sites').update({ pod_designs: updatedDesigns }).eq('slug', slug);
                        setPodDesigns(updatedDesigns);

                        const selectedCount = Object.values(selectedProducts).filter((v: any) => v.selected).length;
                        const allErrors: string[] = [];
                        let totalGenerated = 0;
                        // Passes: launch remaining -> poll -> repeat until nothing left or no progress
                        for (let pass = 0; pass < 6; pass++) {
                          const passTasks: any[] = [];
                          for (let i = 0; i < selectedCount; i++) {
                            setMessage(t('edit.mockups.pass').replace('{pass}', String(pass + 1)).replace('{i}', String(i + 1)).replace('{total}', String(totalGenerated)));
                            const res = await fetch('/api/pod/generate-mockups', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ slug, index: i }),
                            });
                            const data = await res.json();
                            if (data.status === 'all_done') break;
                            if (data.task) passTasks.push(data.task);
                            if (Array.isArray(data.errors) && data.errors.length > 0) allErrors.push(...data.errors);
                            await new Promise(r => setTimeout(r, 5000));
                          }
                          if (passTasks.length === 0) break; // all done or nothing launchable

                          setMessage(t('edit.mockups.passLaunched').replace('{pass}', String(pass + 1)).replace('{count}', String(passTasks.length)));
                          let pollData: any = null;
                          for (let p = 0; p < 12; p++) {
                            await new Promise(r => setTimeout(r, 10000));
                            const pollRes = await fetch('/api/pod/generate-mockups', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ slug, action: 'poll', task_keys: passTasks }),
                            });
                            pollData = await pollRes.json();
                            if (pollData.status === 'done') break;
                            setMessage(`Passe ${pass + 1} — mockups en cours… (${pollData.generated ?? 0}/${passTasks.length})`);
                          }
                          totalGenerated += pollData?.generated ?? 0;
                          if (Array.isArray(pollData?.errors) && pollData.errors.length > 0) allErrors.push(...pollData.errors);
                          if ((pollData?.generated ?? 0) === 0) break; // no progress -> stop
                        }
                        const okMsg = t('edit.mockups.done').replace('{total}', String(totalGenerated));
                        setMessage(allErrors.length > 0 ? t('edit.mockups.doneWithErrors').replace('{total}', String(totalGenerated)).replace('{count}', String(allErrors.length)).replace('{details}', allErrors.map(e => e.split(':')[0]).join(', ')) : okMsg);
                        const { data: updated } = await supabase.from('sites').select('pod_designs').eq('slug', slug).single();
                        if (updated?.pod_designs) setPodDesigns(updated.pod_designs);
                      } catch (err: any) {
                        setMessage('Erreur: ' + (err.message || err));
                      } finally {
                        setGeneratingMockups(false);
                      }
                    }}
                    disabled={generatingMockups}
                    className="w-full py-3 rounded-xl border border-white/20 text-sm font-medium text-slate-200 hover:border-[#FA5D1E] hover:text-white transition disabled:opacity-40"
                  >
                    {generatingMockups ? t('edit.mockups.generating') : t('edit.mockups.generate')}
                  </button>
                )}
              </div>
            </FieldSection>
          )}

          <button
            onClick={handleSave}
            disabled={saving || (site?.mode === 3 && (site?.dropship_type === 'reseller' || site?.dropship_type === 'pod_custom' || site?.dropship_type === 'pod_brand') && Number(site.cj_margin_percent ?? DEFAULT_MARGIN_PERCENT) < MIN_MARGIN_PERCENT)}
            className="w-full btn-nexiora py-4 rounded-2xl font-semibold text-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>

          {message && (
            <div
              className={`p-4 rounded-xl text-sm font-medium ${
                isError
                  ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                  : 'bg-green-500/10 border border-green-500/20 text-green-400'
              }`}
            >
              {message}
            </div>
          )}
        </div>

        {(site?.mode === 2 || site?.mode === 3) && <div className="mt-8"><ProductManager slug={slug} /></div>}

        {(site?.mode === 2 || site?.mode === 3) && <PaymentConnect slug={slug} mode={site?.mode} />}
        {site?.mode === 3 && site?.dropship_type === 'reseller' && <CatalogSelections slug={slug} marginPercent={site.cj_margin_percent ?? DEFAULT_MARGIN_PERCENT} roundMode={site.cj_round_mode || undefined} />}

        {(site?.mode === 2 || site?.mode === 3) && <OrderManager slug={slug} />}

        {site?.mode === 3 && <FinanceDashboard slug={slug} />}
      </section>

      <Footer />
      <AIAgentChat slug={slug} onSiteUpdated={setSite} lang={site?.lang} />
    </main>
  );
}

function FieldSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">{label}</span>
      {children}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <FieldSection label={label}>
      <input
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#FA5D1E] transition"
      />
    </FieldSection>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <FieldSection label={label}>
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#FA5D1E] transition resize-y"
      />
    </FieldSection>
  );
}
