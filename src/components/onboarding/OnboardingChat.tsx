'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Msg = { role: 'user' | 'assistant'; content: string };

const LOADING_BY_LANG: Record<string, string[]> = {
  fr: [
    'Analyse de votre activité…',
    'Conception des modules métier…',
    'Création des relations entre données…',
    'Configuration des agents IA…',
    'Mise en place des automatisations…',
    'Finalisation de votre système…',
  ],
  en: [
    'Analyzing your business…',
    'Designing your modules…',
    'Building data relationships…',
    'Configuring AI agents…',
    'Setting up automations…',
    'Finalizing your system…',
  ],
  es: [
    'Analizando tu negocio…',
    'Diseñando los módulos…',
    'Creando las relaciones de datos…',
    'Configurando los agentes IA…',
    'Preparando las automatizaciones…',
    'Finalizando tu sistema…',
  ],
  ar: [
    'تحليل نشاطك التجاري…',
    'تصميم وحدات العمل…',
    'إنشاء العلاقات بين البيانات…',
    'إعداد وكلاء الذكاء الاصطناعي…',
    'تجهيز الأتمتة…',
    'إنهاء نظامك…',
  ],
};

const PLACEHOLDER_BY_LANG: Record<string, string[]> = {
  fr: [
    'Créer mon site web…',
    'Ma marque de vêtements, sans un sou…',
    'Vendre sans stock ni argent…',
    'Ma boutique, zéro risque…',
    'Vendre mes créations, sans avancer d\'argent…',
    'Mes clients créent, je vends…',
  ],
  en: [
    'Build my website…',
    'My clothing brand, $0 down…',
    'Sell with no stock, no cash…',
    'My shop, zero risk…',
    'Sell my creations, nothing upfront…',
    'My customers design, I sell…',
  ],
  es: [
    'Crear mi sitio web…',
    'Lanzar mi marca de ropa, sin un peso…',
    'Vender sin stock ni dinero…',
    'Abrir mi tienda, cero riesgo…',
    'Mi tienda, cero riesgo…',
    'Mis clientes crean, yo vendo…',
  ],
  ar: [
    'أنشئ موقعي الإلكتروني…',
    'أطلق علامة ملابسي، بدون أي مال…',
    'بِع بدون مخزون، بدون استثمار…',
    'افتح متجري، دون أي مخاطرة…',
    'بِع إبداعاتي، دون دفع مقدمًا…',
    'عملائي يصممون، وأنا أبيع…',
  ],
};

/** Detecte la langue depuis le texte saisi par l'utilisateur. */
function detectUILang(text: string): string {
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  if (/\b(hola|gracias|tienda|quiero|negocio|vender)\b/i.test(text)) return 'es';
  if (/\b(bonjour|merci|boutique|je veux|entreprise|vendre)\b/i.test(text)) return 'fr';
  if (/\b(hello|thanks|shop|i want|business|sell)\b/i.test(text)) return 'en';
  return 'fr';
}

const GREETING = "Bonjour ! Décrivez-moi votre activité et je crée votre site sur mesure. Quel type de business souhaitez-vous lancer ?";

// Rendu markdown minimal et sur : uniquement le gras **...**.
// On echappe d'abord le HTML (securite), puis on transforme les paires **.
function renderBold(text: string) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const html = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return { __html: html };
}

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
  const typedText = messages.filter((m) => m.role === 'user').map((m) => m.content).join(' ');
  const browserLang = typeof navigator !== 'undefined'
    ? (navigator.language || 'fr').slice(0, 2).toLowerCase()
    : 'fr';
  const supportedLang = ['fr', 'en', 'es', 'ar'].includes(browserLang) ? browserLang : 'fr';
  const uiLang = typedText.trim() ? detectUILang(typedText) : supportedLang;
  const LOADING_STEPS = LOADING_BY_LANG[uiLang] || LOADING_BY_LANG.fr;
  const PLACEHOLDERS = PLACEHOLDER_BY_LANG[uiLang] || PLACEHOLDER_BY_LANG.fr;
  const [typed, setTyped] = useState('');
  const twPhrase = useRef(0);
  const twChar = useRef(0);
  const twPhase = useRef<'typing' | 'pausing' | 'deleting'>('typing');
  useEffect(() => {
    if (input) { setTyped(''); return; } // fige l'animation des que l'utilisateur tape
    // reinit propre a chaque changement de langue (evite un index invalide sur l'ancienne liste)
    twPhrase.current = 0;
    twChar.current = 0;
    twPhase.current = 'typing';
    setTyped('');
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const phrases = PLACEHOLDERS;
      const full = phrases[twPhrase.current % phrases.length];
      if (twPhase.current === 'typing') {
        twChar.current += 1;
        setTyped(full.slice(0, twChar.current));
        if (twChar.current >= full.length) { twPhase.current = 'pausing'; timer = setTimeout(tick, 1500); }
        else { timer = setTimeout(tick, 55); }
      } else if (twPhase.current === 'pausing') {
        twPhase.current = 'deleting';
        timer = setTimeout(tick, 400);
      } else {
        twChar.current -= 1;
        setTyped(full.slice(0, Math.max(twChar.current, 0)));
        if (twChar.current <= 0) {
          twPhase.current = 'typing';
          twPhrase.current = (twPhrase.current + 1) % phrases.length;
          timer = setTimeout(tick, 250);
        } else { timer = setTimeout(tick, 28); }
      }
    };
    timer = setTimeout(tick, 250);
    return () => clearTimeout(timer);
  }, [input, uiLang]);
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
          body: JSON.stringify({ message: finalMessage, location: '', ...(data.detectedLang ? { language: data.detectedLang } : {}), ...(effectiveDsType ? { dropshipType: effectiveDsType } : {}) }),
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
        <Sparkles size={18} className="text-[#FA5D1E]" />
        <span className="text-sm font-medium tracking-wide" translate="no">Woorri — Création sur mesure</span>
      </div>

      {messages.length === 1 && !loading && !generating ? (
        <div className="flex flex-col items-center justify-center text-center px-4 mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3 bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
            Donnez vie à votre idée
          </h1>
          <p className="text-slate-400 text-base sm:text-lg mb-10 max-w-md">
            Décrivez votre activité en quelques mots. Woorri conçoit en quelques secondes.
          </p>
          <div className="flex flex-wrap gap-3 justify-center max-w-lg">
            {!showDropshipPicker ? (
              <>
              {[
                { label: 'Site web', mode: 1 },
                { label: 'Boutique en ligne', mode: 2 },
                { label: 'Dropshipping', mode: 3 },
              ].map(({ label, mode }) => (
                <button
                  key={label}
                  onClick={() => {
                    if (mode === 3) {
                      setShowDropshipPicker(true);
                    } else {
                      setSiteMode(mode);
                      sendText(label);
                    }
                  }}
                  className="px-5 py-2.5 rounded-full border text-sm transition bg-white/[0.04] border-white/12 text-slate-200 hover:border-[#FA5D1E] hover:text-white hover:bg-white/[0.07]"
                >
                  {label}
                </button>
              ))}
              </>
            ) : (
              <>
              <p className="w-full text-center text-sm text-slate-400 mb-2">Quel type de dropshipping ?</p>
              {[
                { label: 'Revente de catalogue', type: 'reseller' },
                { label: 'Votre marque', type: 'pod_brand' },
                { label: 'Personnalisation client', type: 'pod_custom' },
              ].map(({ label, type }) => (
                <button
                  key={type}
                  onClick={() => {
                    setSiteMode(3);
                    setDropshipType(type);
                    setShowDropshipPicker(false);
                    sendText(`Dropshipping — ${label}`);
                  }}
                  className="px-5 py-2.5 rounded-full bg-white/[0.04] border border-white/12 text-sm text-slate-200 hover:border-[#FA5D1E] hover:text-white hover:bg-white/[0.07] transition"
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
                  ? 'bg-gradient-to-br from-[#FA5D1E] to-[#FA5D1E] text-white rounded-[22px] rounded-br-md'
                  : 'bg-white/[0.06] border border-white/10 text-slate-100 rounded-[22px] rounded-bl-md'
              }`}
            >
              <span dangerouslySetInnerHTML={renderBold(m.content)} />
            </div>
          </div>
        ))}

        {(loading || generating) && (
          <div className="flex justify-start">
            <div className="bg-white/[0.06] border border-white/10 rounded-[22px] rounded-bl-md px-5 py-4">
              {generating ? (
                <div className="py-2">
                  <div className="text-center mb-6">
                    <div className="inline-block w-12 h-12 border-4 border-[#FA5D1E]/30 border-t-[#FA5D1E] rounded-full animate-spin mb-4"></div>
                    <h3 className="text-lg font-bold mb-1 tracking-tight">Création de votre {siteMode === 2 ? 'boutique' : siteMode === 3 ? 'boutique dropshipping' : 'site'} sur mesure…</h3>
                    <p className="text-sm text-slate-400">Cela peut prendre un moment, patientez.</p>
                  </div>
                  <div className="flex flex-col gap-3">
                    {LOADING_STEPS.map((label, i) => {
                      const done = i < loadingStep;
                      const active = i === loadingStep;
                      return (
                        <div key={i} className="flex items-center gap-3 transition-all duration-500" style={{ opacity: i <= loadingStep ? 1 : 0.35 }}>
                          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500" style={{ background: done ? '#FA5D1E' : active ? 'rgba(224,112,64,0.2)' : 'rgba(255,255,255,0.06)', border: active ? '2px solid #FA5D1E' : '2px solid transparent' }}>
                            {done ? (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                            ) : active ? (
                              <div className="w-2 h-2 rounded-full bg-[#FA5D1E] animate-pulse" />
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
              className="text-left px-5 py-4 rounded-2xl bg-white/[0.04] border border-white/12 hover:border-[#FA5D1E] hover:bg-white/[0.07] transition group"
            >
              <span className="block text-[15px] font-semibold text-white mb-0.5 group-hover:text-[#FA5D1E] transition">
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
          placeholder={typed}
          aria-label="Décrivez votre activité"
          maxLength={1000}
          disabled={generating}
          rows={1}
          className="w-full bg-black/40 border border-white/10 rounded-[24px] pl-6 pr-16 py-4 text-white text-[15px] placeholder-slate-500 resize-none focus:outline-none transition shadow-xl min-h-[56px] max-h-40"
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading || generating}
          aria-label="Envoyer"
          className="absolute bottom-3 right-3 w-11 h-11 rounded-full flex items-center justify-center bg-white border-2 border-[#FA5D1E] shadow-lg transition disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105"
        >
          <ArrowUp size={22} strokeWidth={2.5} className="text-[#FA5D1E]" />
        </button>
      </div>

      {messages.length === 1 && !loading && !generating && !showDropshipPicker && (
        <div className="mt-5 max-w-lg mx-auto text-left space-y-2 text-[13px] leading-relaxed text-slate-400">
          <p><span className="text-slate-200 font-medium">Site web</span> — présenter votre activité en ligne (sans vente).</p>
          <p><span className="text-slate-200 font-medium">Boutique en ligne</span> — vendre vos propres produits (vous gérez le stock).</p>
          <p><span className="text-slate-200 font-medium">Dropshipping</span> — vendre sans stock ni capital : tout est automatisé, un fournisseur expédie directement à vos clients.</p>
        </div>
      )}
    </section>
  );
}
