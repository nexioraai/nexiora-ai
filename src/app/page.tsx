'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/translations';

export default function Home() {
  const { t } = useTranslation();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email || null);
      setAuthLoaded(true);
    });
  }, []);

  return (
    <main className="min-h-screen nexiora-bg text-white">
      <Navbar />

      <section className="text-center px-6 pt-20 pb-8">
        <div className="inline-block px-4 py-1.5 rounded-full bg-[#E07040]/20 text-[#E07040] text-sm mb-5">
          {t('home.badge')}
        </div>
        <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-4">
          {t('home.title.part1')} <span className="text-nexiora">{t('home.title.part2')}</span>
        </h1>
        <p className="text-slate-400 text-base md:text-lg max-w-2xl mx-auto mb-4">
          {t('home.subtitle')}
        </p>

        {authLoaded && userEmail && (
          <Link
            href="/dashboard"
            className="inline-block text-sm text-slate-400 hover:text-white transition"
          >
            {t('home.dashboardLink')}
          </Link>
        )}
      </section>

      <OnboardingFlow />

      <Footer />
    </main>
  );
}
