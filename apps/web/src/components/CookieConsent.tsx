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
          // Attribut purement presentation-only : permet a globals.css de cibler
          // ce panneau precis par theme actif (voir html[data-storefront-theme])
          // sans toucher au contenu/texte/comportement ci-dessous. Chaque theme
          // storefront pose lui-meme `data-storefront-theme` sur <html> (ex.
          // NoirTheme.tsx) ; par defaut (dashboard, marketing, aucun theme actif)
          // ce composant garde exactement son apparence actuelle.
          data-cookie-consent-panel
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-[100] glass rounded-2xl p-5 text-white"
          // La classe .glass declare elle-meme `position: relative` (contexte de
          // positionnement pour son propre pseudo-element ::before) -- meme
          // specificite qu'une classe utilitaire Tailwind isolee comme `fixed`,
          // donc en collision directe sur CE composant precis. Bug reel et
          // preexistant decouvert en ouvrant reellement la banniere via
          // Playwright (jamais visible en lisant le code/DOM/build) : la
          // banniere n'etait pas fixee au viewport du tout, elle atterrissait
          // en flux normal pres du bas du document entier (hors ecran sur
          // toute page un peu longue) -- potentiellement un vrai probleme de
          // conformite Loi 25, pas seulement un detail visuel. Le style inline
          // a la priorite la plus haute (hors !important) et restaure sans
          // ambiguite l'intention deja ecrite dans la className.
          style={{ position: 'fixed', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
        >
          <p className="text-sm text-slate-200 leading-relaxed mb-4">
            {t('cookieBanner.message')}{' '}
            <Link href="/cookies" className="underline text-[#FA5D1E] hover:text-white transition-colors">
              {t('cookieBanner.learnMore')}
            </Link>
          </p>
          <div className="flex gap-3">
            <button
              data-cookie-accept
              onClick={() => decide('accepted')}
              // Degrade par defaut deplace en classe CSS (cookie-accept-btn,
              // globals.css) plutot qu'en style inline : un style inline gagne
              // toujours sur une regle de feuille de style quelle que soit sa
              // specificite, ce qui rendait la variante Noir totalement
              // ineffective sur ce bouton precis -- verifie via capture reelle
              // (couleur inchangee malgre l'attribut data-storefront-theme
              // correctement pose). Meme degrade officiel par defaut, aucun
              // changement visuel hors theme Noir.
              className="cookie-accept-btn flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              {t('cookieBanner.accept')}
            </button>
            <button
              data-cookie-decline
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
