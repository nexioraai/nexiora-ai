'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ThemeSelector from '@/components/edit/ThemeSelector';
import AIAgentChat from '@/components/edit/AIAgentChat';
import ProductManager from '@/components/edit/ProductManager';
import PaymentConnect from '@/components/edit/PaymentConnect';
import { supabase } from '@/lib/supabase';
import { computeAiScore } from '@/app/lib/aiScore';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function EditPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [site, setSite] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
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
        if (siteData) initialPassed.current = computeAiScore(siteData as any).passed;
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

  const updateField = (field: string, value: string) => {
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
        const reason = gained.length > 0 ? gained.join(', ') : 'Mise à jour du contenu';
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
          <Link href="/dashboard" className="text-[#E07040] hover:underline">← Back to Dashboard</Link>
        </div>
        <Footer />
      </main>
    );
  }

  const isError = message.toLowerCase().startsWith('error') || message.toLowerCase().startsWith('upload error');

  return (
    <main className="min-h-screen nexiora-bg text-white">
      <Navbar />

      <section className="max-w-3xl mx-auto px-6 pt-12 pb-24">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10">
          <div>
            <Link href="/dashboard" className="text-sm text-slate-400 hover:text-white transition mb-2 inline-block">
              ← Dashboard
            </Link>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight">
              Edit <span className="text-nexiora">{site.name}</span>
            </h1>
          </div>
          <Link
            href={`/sites/${slug}`}
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
          const color = score >= 80 ? '#34d399' : score >= 50 ? '#E07040' : '#f87171';
          const data = history.length >= 1 ? history : [{ score, date: "Aujourd'hui", reason: '' }];
          return (
            <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-sm mb-8">
              <div className="flex flex-col md:flex-row md:items-stretch gap-6">
                <div className="md:w-1/3 flex flex-col justify-center">
                  <p className="text-sm font-semibold text-white/60 mb-1">Visibilité IA</p>
                  <p className="text-5xl font-black leading-none" style={{ color }}>{score}<span className="text-white/30 text-2xl font-medium">/100</span></p>
                  <p className="text-xs text-white/40 mt-2">{missing.length === 0 ? 'Visibilité maximale atteinte 🎯' : `${missing.length} action${missing.length > 1 ? 's' : ''} pour atteindre 100`}</p>
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
                  <p className="text-[11px] text-white/30 mt-1 text-center">Évolution du score dans le temps</p>
                </div>
              </div>
              {missing.length > 0 && (
                <div className="mt-6 pt-6 border-t border-white/10">
                  <p className="text-sm font-semibold text-white/70 mb-3">Pour améliorer ta visibilité :</p>
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
        <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-sm space-y-6">

          <ThemeSelector currentTheme={site.theme || "EditorialTheme"} onThemeChange={(t) => updateField("theme", t)} />

          <FieldSection label="Hero Image">
            {site.hero_image && (
              <img src={site.hero_image} alt="hero" className="w-full max-h-48 object-cover rounded-xl mb-3 border border-white/10" />
            )}
            <label className="block w-full text-center bg-[#E07040]/10 hover:bg-[#E07040]/20 text-[#E07040] py-3 rounded-xl cursor-pointer font-semibold transition border border-[#E07040]/20">
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
              value={site.primary_color || '#E07040'}
              onChange={(e) => updateField('primary_color', e.target.value)}
              className="w-24 h-12 rounded-xl border border-white/10 bg-transparent cursor-pointer"
            />
          </FieldSection>

          <button
            onClick={handleSave}
            disabled={saving}
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

        <ProductManager slug={slug} />

        <PaymentConnect slug={slug} />
      </section>

      <Footer />
      <AIAgentChat slug={slug} onSiteUpdated={setSite} />
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
        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#E07040] transition"
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
        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#E07040] transition resize-y"
      />
    </FieldSection>
  );
}
