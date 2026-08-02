'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { useTranslation } from '@/lib/translations';

const STORAGE_KEY = 'woorri-cookie-consent';

export default function CookieConsent() {
  const { t, lang } = useTranslation();
  const [choice, setChoice] = useState<'accepted' | 'declined' | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as 'accepted' | 'declined' | null;
    if (stored === 'accepted' || stored === 'declined') {
      setChoice(stored);
    } else {
      // Petit délai pour ne pas gêner le premier rendu
      const tmr = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(tmr);
    }
  }, []);

  const decide = (value: 'accepted' | 'declined') => {
    localStorage.setItem(STORAGE_KEY, value);
    setChoice(value);
    setVisible(false);
  };

  return (
    <>
      {/* Les traceurs ne se chargent QUE si l'utilisateur a accepté (Loi 25) */}
      {choice === 'accepted' && (
        <>
          <Analytics />
          <SpeedInsights />
        </>
      )}

      {visible && (
        <div
          role="dialog"
          aria-live="polite"
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-[100] glass rounded-2xl p-5 text-white"
          style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
        >
          <p className="text-sm text-slate-200 leading-relaxed mb-4">
            {t('cookieBanner.message')}{' '}
            <Link href="/cookies" className="underline text-[#FA5D1E] hover:text-white transition-colors">
              {t('cookieBanner.learnMore')}
            </Link>
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => decide('accepted')}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #4F6EF5 0%, #FA5D1E 60%, #C9A84C 100%)' }}
            >
              {t('cookieBanner.accept')}
            </button>
            <button
              onClick={() => decide('declined')}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              {t('cookieBanner.decline')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
