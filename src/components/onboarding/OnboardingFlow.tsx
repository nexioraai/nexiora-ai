'use client';

import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LANGUAGES } from '@/lib/languages';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/translations';

type Step = 1 | 2 | 3;
type Language = string;

export default function OnboardingFlow() {
  const router = useRouter();
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>(1);
  const [prompt, setPrompt] = useState('');
  const [language, setLanguage] = useState<Language>('auto');
  const [moreDetails, setMoreDetails] = useState('');
  const [error, setError] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);

  const LOADING_STEPS = [
    'Analyse de votre activité…',
    'Conception des modules métier…',
    'Création des relations entre données…',
    'Configuration des agents IA…',
    'Mise en place des automatisations…',
    'Finalisation de votre système…',
  ];

  useEffect(() => {
    if (step !== 3) { setLoadingStep(0); return; }
    const id = setInterval(() => {
      setLoadingStep((s) => (s < LOADING_STEPS.length - 1 ? s + 1 : s));
    }, 8000);
    return () => clearInterval(id);
  }, [step]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user?.email || null);
      setAuthLoaded(true);
    });
  }, []);

  const canContinue = prompt.trim().length > 0 && !!userEmail;

  const goToDetails = () => {
    if (!canContinue) return;
    setError('');
    setStep(2);
  };

  const generate = async () => {
    const fromStep = step;
    setStep(3);
    setError('');

    const fullMessage = moreDetails.trim()
      ? `${prompt}\n\n${t('onboarding.additionalDetailsTag')}: ${moreDetails}`
      : prompt;

    try {
      // --- AIGUILLAGE : détection d'intention (site web vs systeme de gestion/ERP) ---
      // En cas de doute ou d'erreur, l'API renvoie 'website' (flux par defaut sur).
      try {
        const intentRes = await fetch('/api/detect-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: fullMessage }),
        });
        const intentData = await intentRes.json();
        if (intentData?.type === 'erp') {
          const { data: erpSession } = await supabase.auth.getSession();
          const erpToken = erpSession.session?.access_token;
          if (!erpToken) throw new Error(t('onboarding.error.sessionExpired'));
          const erpRes = await fetch('/api/generator', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + erpToken,
            },
            body: JSON.stringify({ prompt: fullMessage }),
          });
          const erpData = await erpRes.json();
          if (!erpRes.ok || !erpData.slug) {
            throw new Error(erpData.error || t('onboarding.error.generationFailed'));
          }
          router.push(`/erp/${erpData.slug}`);
          return;
        }
      } catch {
        // si la detection echoue, on continue simplement en mode site web
      }
      // --- FIN AIGUILLAGE ---

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        throw new Error(t('onboarding.error.sessionExpired'));
      }

      const body: Record<string, string> = {
        message: fullMessage,
        location: '',
      };
      if (language !== 'auto') {
        body.language = language;
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify(body),
      });

      let data;
      try { data = await res.json(); } catch { throw new Error(t('onboarding.error.invalidResponse')); }
      if (!res.ok) throw new Error(data.error || t('onboarding.error.generationFailed'));
      if (!data.slug) throw new Error(t('onboarding.error.missingSlug'));

      router.push(`/sites/${data.slug}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('onboarding.error.generationFailed');
      setError(msg);
      setStep(fromStep);
    }
  };

  return (
    <section className="max-w-3xl mx-auto px-6 pb-24">
      <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-8 md:p-12 backdrop-blur-sm shadow-2xl">
        {step === 1 && (
          <>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('onboarding.step1.placeholder')}
              maxLength={1000}
              autoFocus
              className="w-full h-44 bg-black/40 border border-white/10 rounded-2xl p-5 text-white text-lg placeholder-slate-500 resize-none focus:outline-none focus:border-[#E07040] transition"
            />

            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#E07040]"
              >
                <option value="auto">✨ {t('onboarding.step1.languageAuto')}</option>
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="mt-6 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0 shadow-lg" style={{ background: 'linear-gradient(135deg, #4F6EF5 0%, #E07040 100%)' }}>
                  <Sparkles size={16} />
                </div>
                <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm p-4 text-white/90 text-sm leading-relaxed">
                  {error}
                </div>
              </div>
            )}

            <button
              onClick={generate}
              disabled={!authLoaded || !canContinue}
              className="w-full mt-6 btn-nexiora py-4 rounded-2xl font-semibold text-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {!authLoaded
                ? t('onboarding.step1.btnLoading')
                : !userEmail
                ? t('onboarding.step1.btnNotLoggedIn')
                : t('onboarding.step1.btnReady')}
            </button>

            {!userEmail && authLoaded && (
              <p className="text-center mt-4 text-sm text-slate-400">
                <Link href="/login" className="text-[#E07040] hover:underline">
                  {t('onboarding.step1.signinLink')}
                </Link>{' '}
                {t('onboarding.step1.signinOr')}{' '}
                <Link href="/signup" className="text-[#E07040] hover:underline">
                  {t('onboarding.step1.signupLink')}
                </Link>{' '}
                {t('onboarding.step1.signinSuffix')}
              </p>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <button
              onClick={() => setStep(1)}
              className="text-slate-400 hover:text-white text-sm mb-6 inline-flex items-center gap-1 transition"
            >
              {t('onboarding.step2.back')}
            </button>

            <h2 className="text-3xl md:text-4xl font-bold text-center mb-3 tracking-tight">
              {t('onboarding.step2.title')}
            </h2>
            <p className="text-slate-400 text-center mb-10 text-base md:text-lg">
              {t('onboarding.step2.subtitle')} <span className="text-slate-500">{t('onboarding.step2.optional')}</span>
            </p>

            <textarea
              value={moreDetails}
              onChange={(e) => setMoreDetails(e.target.value)}
              placeholder={t('onboarding.step2.placeholder')}
              maxLength={2000}
              autoFocus
              className="w-full h-44 bg-black/40 border border-white/10 rounded-2xl p-5 text-white text-lg placeholder-slate-500 resize-none focus:outline-none focus:border-[#E07040] transition"
            />

            <button
              onClick={generate}
              className="w-full mt-6 btn-nexiora py-4 rounded-2xl font-semibold text-lg transition"
            >
              {t('onboarding.step2.btn')}
            </button>
            <p className="text-center mt-3 text-xs text-slate-500">
              {t('onboarding.step2.skip')}
            </p>
          </>
        )}

        {step === 3 && (
          <div className="py-12">
            <div className="text-center mb-10">
              <div className="inline-block w-14 h-14 border-4 border-[#E07040]/30 border-t-[#E07040] rounded-full animate-spin mb-5"></div>
              <h2 className="text-2xl md:text-3xl font-bold mb-2 tracking-tight">
                {t('onboarding.step3.title')}
              </h2>
              <p className="text-slate-400">
                {t('onboarding.step3.subtitle')}
              </p>
            </div>
            <div className="max-w-md mx-auto flex flex-col gap-3">
              {LOADING_STEPS.map((label, i) => {
                const done = i < loadingStep;
                const active = i === loadingStep;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 transition-all duration-500"
                    style={{ opacity: i <= loadingStep ? 1 : 0.35 }}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500"
                      style={{
                        background: done
                          ? '#E07040'
                          : active
                          ? 'rgba(224,112,64,0.2)'
                          : 'rgba(255,255,255,0.06)',
                        border: active ? '2px solid #E07040' : '2px solid transparent',
                      }}
                    >
                      {done ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      ) : active ? (
                        <div className="w-2 h-2 rounded-full bg-[#E07040] animate-pulse" />
                      ) : null}
                    </div>
                    <span
                      className="text-sm md:text-base transition-colors duration-500"
                      style={{ color: active ? '#fff' : done ? '#cbbfae' : '#6f6456' }}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
