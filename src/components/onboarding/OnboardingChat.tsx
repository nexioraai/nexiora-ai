'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Msg = { role: 'user' | 'assistant'; content: string };

const GREETING = "Bonjour ! Décrivez-moi votre activité et je crée votre site sur mesure. Quel type de business souhaitez-vous lancer ?";

export default function OnboardingChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([{ role: 'assistant', content: GREETING }]);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email);
    });
  }, []);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [skippable, setSkippable] = useState(false);
  const [modeOptions, setModeOptions] = useState<{ options: number[]; labels: Record<number, string> } | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [siteMode, setSiteMode] = useState<number | null>(null);
  const [dropshipType, setDropshipType] = useState<string | null>(null);
  const [showDropshipPicker, setShowDropshipPicker] = useState(false);
  const LOADING_STEPS = [
    'Analyse de votre activité…',
    'Conception des modules métier…',
    'Création des relations entre données…',
    'Configuration des agents IA…',
    'Mise en place des automatisations…',
    'Finalisation de votre système…',
  ];
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);
  useEffect(() => {
    if (!generating) { setLoadingStep(0); return; }
    const id = setInterval(() => {
      setLoadingStep((s) => (s < LOADING_STEPS.length - 1 ? s + 1 : s));
    }, 8000);
    return () => clearInterval(id);
  }, [generating]);

  const skip = () => { if (!loading && !generating) sendText('passer'); };

  const send = () => sendText(input.trim());

  const sendText = async (text: string, chosenMode?: number) => {
    if ((!text && !chosenMode) || loading || generating) return;
    setError('');
    const newMessages: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setSkippable(false);
    setModeOptions(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Session expirée, reconnectez-vous.');

      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ history: newMessages, ...(chosenMode ? { chosenMode } : {}), ...(dropshipType ? { dropshipType } : {}) }),
      });

      let data;
      try { data = await res.json(); } catch { throw new Error('Réponse invalide.'); }
      if (!res.ok) throw new Error(data.error || 'Une erreur est survenue.');

      if (data.type === 'ready_to_generate' && typeof data.summary === 'string') {
        if (typeof data.mode === 'number') setSiteMode(data.mode);
        setLoading(false);
        setGenerating(true);
        const finalMessage = (data.mode ? `mode: ${data.mode}\n` : '') + data.summary;
        const effectiveDsType = data.dropshipType || dropshipType;
        const genRes = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ message: finalMessage, location: '', ...(effectiveDsType ? { dropshipType: effectiveDsType } : {}) }),
        });
        const genData = await genRes.json();
        if (!genRes.ok || !genData.slug) throw new Error(genData.error || 'Génération échouée.');
        router.push(`/edit/${genData.slug}`);
        return;
      }
      if (data.type === 'choose_mode' && Array.isArray(data.options)) {
        setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
        setModeOptions({ options: data.options, labels: data.labels || {} });
      } else if (data.type === 'ask' && data.reply) {
        setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
        setSkippable(data.skippable === true);
      } else if (data.type === 'need_dropship_type') {
        setShowDropshipPicker(true);
      } else {
        throw new Error('Réponse inattendue.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  const pickMode = (mode: number, label: string) => {
    if (loading || generating) return;
    setSiteMode(mode);
    setModeOptions(null);
    sendText(label.charAt(0).toUpperCase() + label.slice(1), mode);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <section className={`max-w-2xl mx-auto px-4 sm:px-6 pb-10 flex flex-col h-[calc(100vh-120px)] ${messages.length === 1 && !loading && !generating ? 'justify-center' : ''}`}>
      <div className="flex items-center gap-2 justify-center mb-6 text-white/60">
        <Sparkles size={18} className="text-[#FF5500]" />
        <span className="text-sm font-medium tracking-wide" translate="no">Nexiora — Création sur mesure</span>
      </div>

      {messages.length === 1 && !loading && !generating ? (
        <div className="flex flex-col items-center justify-center text-center px-4 mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3 bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
            Donnez vie à votre idée
          </h1>
          <p className="text-slate-400 text-base sm:text-lg mb-10 max-w-md">
            Décrivez votre activité en quelques mots. Nexiora conçoit votre site sur mesure.
          </p>
          <div className="flex flex-wrap gap-3 justify-center max-w-lg">
            {!showDropshipPicker ? (
              <>
              {[
                { label: 'Site vitrine', mode: 1 },
                { label: 'Boutique en ligne', mode: 2 },
                { label: 'Dropshipping', mode: 3 },
              ].map(({ label, mode }) => (
                <button
                  key={label}
                  disabled={mode === 3 && userEmail !== 'issayamiyoussouf@gmail.com'}
                  onClick={() => {
                    if (mode === 3) {
                      if (userEmail === 'issayamiyoussouf@gmail.com') setShowDropshipPicker(true);
                    } else {
                      setSiteMode(mode);
                      sendText(label);
                    }
                  }}
                  className={`px-5 py-2.5 rounded-full border text-sm transition ${mode === 3 ? 'bg-white/[0.02] border-white/5 text-slate-500 cursor-not-allowed' : 'bg-white/[0.04] border-white/12 text-slate-200 hover:border-[#FF5500] hover:text-white hover:bg-white/[0.07]'}`}
                >
                  {mode === 3 && userEmail !== 'issayamiyoussouf@gmail.com' ? `${label} (bientôt)` : label}
                </button>
              ))}
              </>
            ) : (
              <>
              <p className="w-full text-center text-sm text-slate-400 mb-2">Quel type de dropshipping ?</p>
              {[
                { label: 'Ma propre marque (POD)', type: 'pod_brand' },
                { label: 'Personnalisation client (POD)', type: 'pod_custom' },
                { label: 'Revente produits existants', type: 'reseller' },
              ].map(({ label, type }) => (
                <button
                  key={type}
                  onClick={() => {
                    setSiteMode(3);
                    setDropshipType(type);
                    setShowDropshipPicker(false);
                    sendText(`Dropshipping — ${label}`);
                  }}
                  className="px-5 py-2.5 rounded-full bg-white/[0.04] border border-white/12 text-sm text-slate-200 hover:border-[#FF5500] hover:text-white hover:bg-white/[0.07] transition"
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => setShowDropshipPicker(false)}
                className="px-4 py-2 text-xs text-slate-500 hover:text-slate-300 transition"
              >
                ← Retour
              </button>
              </>
            )}
          </div>
        </div>
      ) : (
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[82%] px-5 py-3 text-[15px] leading-relaxed shadow-lg whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-gradient-to-br from-[#FF5500] to-[#E07040] text-white rounded-[22px] rounded-br-md'
                  : 'bg-white/[0.06] border border-white/10 text-slate-100 rounded-[22px] rounded-bl-md'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {(loading || generating) && (
          <div className="flex justify-start">
            <div className="bg-white/[0.06] border border-white/10 rounded-[22px] rounded-bl-md px-5 py-4">
              {generating ? (
                <div className="py-2">
                  <div className="text-center mb-6">
                    <div className="inline-block w-12 h-12 border-4 border-[#E07040]/30 border-t-[#E07040] rounded-full animate-spin mb-4"></div>
                    <h3 className="text-lg font-bold mb-1 tracking-tight">Création de votre {siteMode === 2 ? 'boutique' : siteMode === 3 ? 'boutique dropshipping' : 'site'} sur mesure…</h3>
                    <p className="text-sm text-slate-400">Cela peut prendre un moment, patientez.</p>
                  </div>
                  <div className="flex flex-col gap-3">
                    {LOADING_STEPS.map((label, i) => {
                      const done = i < loadingStep;
                      const active = i === loadingStep;
                      return (
                        <div key={i} className="flex items-center gap-3 transition-all duration-500" style={{ opacity: i <= loadingStep ? 1 : 0.35 }}>
                          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500" style={{ background: done ? '#E07040' : active ? 'rgba(224,112,64,0.2)' : 'rgba(255,255,255,0.06)', border: active ? '2px solid #E07040' : '2px solid transparent' }}>
                            {done ? (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                            ) : active ? (
                              <div className="w-2 h-2 rounded-full bg-[#E07040] animate-pulse" />
                            ) : null}
                          </div>
                          <span className="text-sm transition-colors duration-500" style={{ color: active ? '#fff' : done ? '#cbbfae' : '#6f6456' }}>{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      {error && <p className="text-sm text-red-400 mt-3 text-center">{error}</p>}

      {modeOptions && !loading && !generating && (
        <div className="flex flex-col gap-3 mt-4">
          {modeOptions.options.map((mode) => (
            <button
              key={mode}
              onClick={() => pickMode(mode, modeOptions.labels[mode] || `Mode ${mode}`)}
              className="text-left px-5 py-4 rounded-2xl bg-white/[0.04] border border-white/12 hover:border-[#FF5500] hover:bg-white/[0.07] transition group"
            >
              <span className="block text-[15px] font-semibold text-white mb-0.5 group-hover:text-[#FF5500] transition">
                {mode === 1 ? 'Site vitrine' : mode === 2 ? 'Boutique en ligne' : 'Boutique autonome'}
              </span>
              <span className="block text-sm text-slate-400">{modeOptions.labels[mode]}</span>
            </button>
          ))}
        </div>
      )}

      {skippable && !loading && !generating && (
        <div className="flex justify-center mt-3">
          <button
            onClick={skip}
            className="text-sm text-white/60 hover:text-white border border-white/15 hover:border-white/30 rounded-full px-5 py-1.5 transition"
          >
            Passer cette étape
          </button>
        </div>
      )}

      <div className="relative mt-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Votre réponse…"
          maxLength={1000}
          disabled={generating}
          autoFocus
          rows={1}
          className="w-full bg-black/40 border border-white/10 rounded-[24px] pl-6 pr-16 py-4 text-white text-[15px] placeholder-slate-500 resize-none focus:outline-none focus:border-[#E07040] transition shadow-xl min-h-[56px] max-h-40"
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading || generating}
          aria-label="Envoyer"
          className="absolute bottom-3 right-3 w-11 h-11 rounded-full flex items-center justify-center bg-white border-2 border-[#FF5500] shadow-lg transition disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105"
        >
          <ArrowUp size={22} strokeWidth={2.5} className="text-[#FF5500]" />
        </button>
      </div>
    </section>
  );
}
