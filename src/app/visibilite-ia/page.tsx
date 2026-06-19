'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Sidebar from '@/components/Sidebar';
import ScoreChart from '@/components/ScoreChart';
import { computeAiScore } from '@/app/lib/aiScore';
import { useTranslation } from '@/lib/translations';

type Point = { score: number; date: string; reason: string };

export default function VisibiliteIaPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [sites, setSites] = useState<any[]>([]);
  const [history, setHistory] = useState<Record<string, Point[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return; }
      supabase.from('sites').select('*').eq('owner_email', data.user.email)
        .order('created_at', { ascending: false })
        .then(({ data: sitesData }) => {
          const list = sitesData || [];
          setSites(list);
          setLoading(false);
          if (list.length > 0) setSelected(list[0].slug);
          const slugs = list.map((s: any) => s.slug);
          if (slugs.length > 0) {
            supabase.from('score_history')
              .select('slug, score, created_at, reason')
              .in('slug', slugs)
              .order('created_at', { ascending: true })
              .then(({ data: hist }) => {
                const grouped: Record<string, Point[]> = {};
                (hist || []).forEach((h: any) => {
                  if (!grouped[h.slug]) grouped[h.slug] = [];
                  grouped[h.slug].push({
                    score: h.score,
                    reason: h.reason || '',
                    date: new Date(h.created_at).toLocaleString('fr-CA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
                  });
                });
                setHistory(grouped);
              });
            supabase.from('ai_visibility_checks')
              .select('slug, ai_provider, appears, position, excerpt, checked_at')
              .in('slug', slugs)
              .order('checked_at', { ascending: false })
              .then(({ data: chk }) => {
                const latest: Record<string, any[]> = {};
                (chk || []).forEach((row: any) => {
                  if (!latest[row.slug]) latest[row.slug] = [];
                  if (!latest[row.slug].some((r: any) => r.ai_provider === row.ai_provider)) {
                    latest[row.slug].push(row);
                  }
                });
                setChecks(latest);
              });
          }
        });
    });
  }, []);

  if (loading) return (
    <div className="min-h-screen nexiora-bg flex items-center justify-center">
      <div className="text-white/40 text-lg">{t('aivis.loading')}</div>
    </div>
  );

  const selSite = sites.find(s => s.slug === selected);
  const selScore = selSite ? computeAiScore(selSite) : null;
  const selColor = selScore ? (selScore.score >= 80 ? '#34d399' : selScore.score >= 50 ? '#E07040' : '#f87171') : '#E07040';
  const selData: Point[] = selected && history[selected]?.length
    ? history[selected]
    : (selScore ? [{ score: selScore.score, date: t('aivis.today'), reason: '' }] : []);
  const selChecks = selected ? (checks[selected] || []) : [];

  return (
    <div className="min-h-screen nexiora-bg text-white flex">
      <Sidebar />
      <div className="flex-1 min-w-0 max-w-6xl mx-auto px-6 py-12">
        <div className="mb-10">
          <div className="text-xs uppercase tracking-[0.2em] font-medium mb-2" style={{ color: '#E07040' }}>{t('aivis.eyebrow')}</div>
          <h1 className="text-4xl font-black tracking-tight">{t('aivis.title')}</h1>
        </div>

        {sites.length === 0 ? (
          <div className="text-center py-24 border border-white/8 rounded-3xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <p className="text-white/40 text-xl">{t('aivis.empty')}</p>
          </div>
        ) : (
          <>
            {selSite && selScore && (
              <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-sm mb-8">
                <div className="flex flex-col md:flex-row md:items-stretch gap-6">
                  <div className="md:w-1/3 flex flex-col justify-center">
                    <p className="text-sm font-semibold text-white/60 mb-1">{selSite.name}</p>
                    <p className="text-5xl font-black leading-none" style={{ color: selColor }}>{selScore.score}<span className="text-white/30 text-2xl font-medium">/100</span></p>
                    <p className="text-xs text-white/40 mt-2">{selScore.missing.length === 0 ? t('aivis.maxReached') : t('aivis.actionsToReach').replace('{n}', String(selScore.missing.length))}</p>
                  </div>
                  <div className="md:w-2/3">
                    <ScoreChart data={selData} color={selColor} />
                    <p className="text-[11px] text-white/30 mt-1 text-center">{t('aivis.evolution')}</p>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-white/10">
                  <p className="text-sm font-semibold text-white/70 mb-4">{t('aivis.presence')}</p>
                  {selChecks.length === 0 ? (
                    <p className="text-xs text-white/40">{t('aivis.preparing')}</p>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-4">
                      {selChecks.map((chk: any) => {
                        const label = chk.ai_provider === 'perplexity' ? 'Perplexity' : chk.ai_provider === 'chatgpt' ? 'ChatGPT' : chk.ai_provider;
                        return (
                          <div key={chk.ai_provider} className="border border-white/10 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-bold text-white">{label}</span>
                              {chk.appears ? (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#34d39920', color: '#34d399' }}>
                                  {chk.position ? t('aivis.position').replace('{n}', String(chk.position)) : t('aivis.mentioned')}
                                </span>
                              ) : (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#f8717120', color: '#f87171' }}>{t('aivis.notMentioned')}</span>
                              )}
                            </div>
                            {chk.excerpt && <p className="text-xs text-white/50 leading-relaxed">"{chk.excerpt}"</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {sites.map((site) => {
                const { score } = computeAiScore(site);
                const color = score >= 80 ? '#34d399' : score >= 50 ? '#E07040' : '#f87171';
                const active = site.slug === selected;
                return (
                  <button key={site.slug} onClick={() => setSelected(site.slug)}
                    className={`text-left border rounded-2xl p-5 transition-all ${active ? 'border-white/30' : 'border-white/8 hover:border-white/20'}`}
                    style={{ background: active ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)' }}>
                    <h2 className="text-lg font-black text-white mb-3">{site.name}</h2>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-white/60">{t('aivis.cardVisibility')}</span>
                      <span className="text-sm font-black" style={{ color }}>{score}<span className="text-white/30 text-xs font-medium">/100</span></span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${score}%`, background: color }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
