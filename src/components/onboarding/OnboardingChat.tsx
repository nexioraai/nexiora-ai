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
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [skippable, setSkippable] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
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

  const sendText = async (text: string) => {
    if (!text || loading || generating) return;
    setError('');
    const newMessages: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setSkippable(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Session expirée, reconnectez-vous.');

      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ history: newMessages }),
      });

      let data;
      try { data = await res.json(); } catch { throw new Error('Réponse invalide.'); }
      if (!res.ok) throw new Error(data.error || 'Une erreur est survenue.');

      if (data.type === 'done' && data.slug) {
        setLoading(false);
        setGenerating(true);
        router.push(`/edit/${data.slug}`);
        return;
      }
      if (data.type === 'ask' && data.reply) {
        setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
        setSkippable(data.skippable === true);
      } else {
        throw new Error('Réponse inattendue.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <section className="max-w-2xl mx-auto px-4 sm:px-6 pb-10 flex flex-col h-[calc(100vh-120px)]">
      <div className="flex items-center gap-2 justify-center mb-6 text-white/60">
        <Sparkles size={18} className="text-[#FF5500]" />
        <span className="text-sm font-medium tracking-wide">Nexiora — Création sur mesure</span>
      </div>

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
                    <h3 className="text-lg font-bold mb-1 tracking-tight">Création de votre site sur mesure…</h3>
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

      {error && <p className="text-sm text-red-400 mt-3 text-center">{error}</p>}

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
