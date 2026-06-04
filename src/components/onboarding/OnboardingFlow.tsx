'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LANGUAGES, DEFAULT_LANGUAGE } from '@/lib/languages';
import { supabase } from '@/lib/supabase';

type Step = 1 | 2 | 3;
type Language = string;

export default function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [prompt, setPrompt] = useState('');
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE);
  const [moreDetails, setMoreDetails] = useState('');
  const [error, setError] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);

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
    setStep(3);
    setError('');

    const fullMessage = moreDetails.trim()
      ? `${prompt}\n\n[Additional details from user]: ${moreDetails}`
      : prompt;

    try {
      // Token frais au moment de la requête (au cas où l'utilisateur aurait pris du temps sur l'étape 2)
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        throw new Error('Session expirée — veuillez vous reconnecter');
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({
          message: fullMessage,
          location: '',
          language,
        }),
      });

      let data;
      try { data = await res.json(); } catch { throw new Error('Réponse serveur invalide'); }
      if (!res.ok) throw new Error(data.error || 'Échec de la génération');
      if (!data.slug) throw new Error('Slug manquant dans la réponse');

      router.push(`/sites/${data.slug}`);
    } catch (err: any) {
      setError(err.message || 'Échec de la génération');
      setStep(2);
    }
  };

  return (
    <section className="max-w-3xl mx-auto px-6 pb-24">
      <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-8 md:p-12 backdrop-blur-sm shadow-2xl">
        {/* ────── ÉTAPE 1 — Prompt principal ────── */}
        {step === 1 && (
          <>
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-3 tracking-tight">
              Generate Your Business
            </h2>
            <p className="text-slate-400 text-center mb-10 text-base md:text-lg">
              Describe your business idea — AI does the rest.
            </p>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Build a modern coffee shop website named COFA in Montréal…"
              maxLength={1000}
              autoFocus
              className="w-full h-44 bg-black/40 border border-white/10 rounded-2xl p-5 text-white text-lg placeholder-slate-500 resize-none focus:outline-none focus:border-[#E07040] transition"
            />

            <div className="flex items-center gap-3 mt-4">
              <span className="text-xs text-slate-500 uppercase tracking-wider">🌐 Language</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#E07040]"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={goToDetails}
              disabled={!authLoaded || !canContinue}
              className="w-full mt-8 btn-nexiora py-4 rounded-2xl font-semibold text-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {!authLoaded
                ? 'Loading…'
                : !userEmail
                ? 'Sign in to Generate'
                : 'Generate My Business →'}
            </button>

            {!userEmail && authLoaded && (
              <p className="text-center mt-4 text-sm text-slate-400">
                <Link href="/login" className="text-[#E07040] hover:underline">
                  Sign in
                </Link>{' '}
                or{' '}
                <Link href="/signup" className="text-[#E07040] hover:underline">
                  create an account
                </Link>{' '}
                to generate your site.
              </p>
            )}
          </>
        )}

        {/* ────── ÉTAPE 2 — More details (optionnel) ────── */}
        {step === 2 && (
          <>
            <button
              onClick={() => setStep(1)}
              className="text-slate-400 hover:text-white text-sm mb-6 inline-flex items-center gap-1 transition"
            >
              ← Back
            </button>

            <h2 className="text-3xl md:text-4xl font-bold text-center mb-3 tracking-tight">
              More details
            </h2>
            <p className="text-slate-400 text-center mb-10 text-base md:text-lg">
              Add anything specific — services, audience, style. <span className="text-slate-500">(optional)</span>
            </p>

            <textarea
              value={moreDetails}
              onChange={(e) => setMoreDetails(e.target.value)}
              placeholder="We focus on specialty coffee, organic pastries, modern minimalist style…"
              maxLength={2000}
              autoFocus
              className="w-full h-44 bg-black/40 border border-white/10 rounded-2xl p-5 text-white text-lg placeholder-slate-500 resize-none focus:outline-none focus:border-[#E07040] transition"
            />

            {error && (
              <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={generate}
              className="w-full mt-6 btn-nexiora py-4 rounded-2xl font-semibold text-lg transition"
            >
              Generate My Business →
            </button>
            <p className="text-center mt-3 text-xs text-slate-500">
              Leave blank and click to skip — AI will figure it out.
            </p>
          </>
        )}

        {/* ────── ÉTAPE 3 — Loading ────── */}
        {step === 3 && (
          <div className="text-center py-16">
            <div className="inline-block w-16 h-16 border-4 border-[#E07040]/30 border-t-[#E07040] rounded-full animate-spin mb-6"></div>
            <h2 className="text-3xl md:text-4xl font-bold mb-3 tracking-tight">
              Generating your business…
            </h2>
            <p className="text-slate-400 text-lg">
              Takes 10–20 seconds. Hang tight.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
