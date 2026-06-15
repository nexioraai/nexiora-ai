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

      <div className="hidden"><Footer /></div>
    </main>
  );
}
