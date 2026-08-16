'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Megaphone, FileText, Share2, Mail, Sparkles, Copy, Check, Lock, Download } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/translations';
import type { TranslationKey } from '@/lib/translations/fr';

const ACCENT = '#FA5D1E';

type Format = 'article' | 'social' | 'email';

const FORMATS: { id: Format; icon: any; titleKey: TranslationKey; descKey: TranslationKey }[] = [
  { id: 'article', icon: FileText, titleKey: 'marketing.article.title', descKey: 'marketing.article.desc' },
  { id: 'social', icon: Share2, titleKey: 'marketing.social.title', descKey: 'marketing.social.desc' },
  { id: 'email', icon: Mail, titleKey: 'marketing.email.title', descKey: 'marketing.email.desc' },
];

function CopyBlock({ label, text }: { label: string; text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="border border-white/8 rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
        <span className="text-sm font-semibold text-white/80">{label}</span>
        <button onClick={copy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition-all">
          {copied ? <><Check className="w-3.5 h-3.5" />{t('mk.copied')}</> : <><Copy className="w-3.5 h-3.5" />{t('mk.copy')}</>}
        </button>
      </div>
      <pre className="px-5 py-4 text-sm text-white/70 whitespace-pre-wrap font-sans leading-relaxed">{text}</pre>
    </div>
  );
}

function ContentResult({ format, content }: { format: Format; content: any }) {
  const { t } = useTranslation();
  if (format === 'article') {
    const structure = Array.isArray(content.structure)
      ? content.structure.map((h: any) => `${h.niveau?.toUpperCase() || ''} — ${h.texte || ''}`).join('\n')
      : '';
    return (
      <div className="flex flex-col gap-4">
        {content.cover && (
          <div className="border border-white/8 rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
              <span className="text-sm font-semibold text-white/80">Image de couverture</span>
              <a href={content.cover} target="_blank" rel="noopener noreferrer" download
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition-all">
                <Download className="w-3.5 h-3.5" />{t('mk.download')}
              </a>
            </div>
            <div className="p-5">
              <img src={content.cover} alt="Couverture de l'article" className="rounded-xl w-full object-cover" style={{ maxHeight: '320px' }} />
            </div>
          </div>
        )}
        <CopyBlock label={t('mk.title')} text={content.titre || ''} />
        <CopyBlock label={t('mk.metaDescription')} text={content.meta_description || ''} />
        {Array.isArray(content.mots_cles) && content.mots_cles.length > 0 && (
          <CopyBlock label={t('mk.keywords')} text={content.mots_cles.join(', ')} />
        )}
        {structure && <CopyBlock label="Structure (Hn)" text={structure} />}
        <CopyBlock label="Article complet" text={content.contenu || ''} />
      </div>
    );
  }
  if (format === 'social') {
    const ig = content.instagram || {};
    const igText = `${ig.texte || ''}${Array.isArray(ig.hashtags) ? '\n\n' + ig.hashtags.join(' ') : ''}`;
    return (
      <div className="flex flex-col gap-4">
        {content.image && (
          <div className="border border-white/8 rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
              <span className="text-sm font-semibold text-white/80">{t('mk.visualGenerated')}</span>
              <a href={content.image} download="deribfy-visuel.png"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition-all">
                <Download className="w-3.5 h-3.5" />{t('mk.download')}
              </a>
            </div>
            <div className="p-5 flex justify-center">
              <img src={content.image} alt="Visuel du post" className="rounded-xl max-w-full w-full sm:w-[420px]" />
            </div>
          </div>
        )}
        <CopyBlock label="Instagram" text={igText} />
        <CopyBlock label="LinkedIn" text={content.linkedin?.texte || ''} />
        <CopyBlock label="Facebook" text={content.facebook?.texte || ''} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <CopyBlock label="Objet" text={content.objet || ''} />
      <CopyBlock label={t('mk.preheader')} text={content.preheader || ''} />
      <CopyBlock label="Corps de l'email" text={content.corps || ''} />
      <CopyBlock label="Bouton CTA" text={content.bouton_cta || ''} />
    </div>
  );
}

export default function MarketingPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<any[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [format, setFormat] = useState<Format>('social');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return; }
      supabase.from('sites').select('*')
        .eq('owner_email', data.user.email)
        .eq('published', true)
        .order('created_at', { ascending: false })
        .then(({ data: sitesData }) => {
          const published = sitesData || [];
          setSites(published);
          if (published.length > 0) setSelectedSlug(published[0].slug);
          setLoading(false);
        });
    });
  }, []);

  const handleGenerate = async () => {
    if (!selectedSlug) return;
    setGenerating(true);
    setError('');
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { router.push('/login'); return; }
      const res = await fetch('/api/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slug: selectedSlug, format }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('mk.genFailed'));
      } else {
        setResult({ format: data.format, content: data.content });
      }
    } catch (e) {
      setError(t('mk.genError'));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen nexiora-bg flex items-center justify-center">
      <div className="text-white/40 text-lg">{t('dashboard.loading')}</div>
    </div>
  );

  return (
    <div className="min-h-screen nexiora-bg text-white flex">
      <Sidebar />
      <div className="flex-1 min-w-0 max-w-5xl mx-auto px-6 py-12">
        <div className="mb-10">
          <div className="text-xs uppercase tracking-[0.2em] font-medium mb-2" style={{ color: ACCENT }}>{t('marketing.eyebrow')}</div>
          <h1 className="text-4xl font-black tracking-tight flex items-center gap-3">
            <Megaphone className="w-8 h-8" style={{ color: ACCENT }} />
            {t('marketing.title')}
          </h1>
          <p className="text-white/50 mt-3 max-w-2xl">{t('marketing.subtitle')}</p>
        </div>

        {sites.length === 0 ? (
          <div className="text-center py-20 border border-white/8 rounded-3xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="w-14 h-14 mx-auto mb-6 rounded-2xl flex items-center justify-center" style={{ background: `${ACCENT}20` }}>
              <Lock className="w-7 h-7" style={{ color: ACCENT }} />
            </div>
            <p className="text-white/80 text-xl font-semibold mb-2">{t('marketing.locked.title')}</p>
            <p className="text-white/40 mb-6 max-w-md mx-auto">{t('marketing.locked.desc')}</p>
            <Link href="/dashboard" className="btn-nexiora inline-flex items-center gap-2 px-8 py-3 rounded-full text-white font-semibold">
              {t('marketing.locked.cta')}
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <label className="block text-sm font-semibold text-white/60 mb-2">{t('marketing.selectSite')}</label>
              <select
                value={selectedSlug}
                onChange={(e) => { setSelectedSlug(e.target.value); setResult(null); }}
                className="w-full sm:w-auto min-w-[260px] px-4 py-3 rounded-xl border border-white/10 text-white text-sm font-medium focus:outline-none focus:border-white/30 transition-all"
                style={{ background: 'rgba(255,255,255,0.04)' }}>
                {sites.map((s) => (
                  <option key={s.slug} value={s.slug} style={{ background: '#0a050e' }}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 mb-8">
              {FORMATS.map((f) => {
                const Icon = f.icon;
                const active = format === f.id;
                return (
                  <button key={f.id}
                    onClick={() => { setFormat(f.id); setResult(null); }}
                    className={`text-left p-5 rounded-2xl border transition-all ${active ? 'border-white/30' : 'border-white/8 hover:border-white/20'}`}
                    style={{ background: active ? `${ACCENT}12` : 'rgba(255,255,255,0.03)' }}>
                    <Icon className="w-6 h-6 mb-3" style={{ color: active ? ACCENT : 'rgba(255,255,255,0.5)' }} />
                    <div className="font-semibold text-white mb-1">{t(f.titleKey)}</div>
                    <div className="text-xs text-white/40 leading-relaxed">{t(f.descKey)}</div>
                  </button>
                );
              })}
            </div>

            <button onClick={handleGenerate} disabled={generating}
              className="btn-nexiora inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed mb-8">
              <Sparkles className="w-4 h-4" />
              {generating ? t('marketing.generating') : t('marketing.generate')}
            </button>

            {error && (
              <div className="mb-8 px-5 py-4 rounded-2xl border border-red-500/20 text-red-300 text-sm" style={{ background: 'rgba(248,113,113,0.08)' }}>
                {error}
              </div>
            )}

            {generating && (
              <div className="flex items-center gap-3 text-white/50 text-sm mb-8">
                <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                {t('marketing.generatingHint')}
              </div>
            )}

            {result && !generating && (
              <div className="animate-in fade-in duration-500">
                <ContentResult format={result.format} content={result.content} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
