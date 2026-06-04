'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';
import { supabase } from '@/lib/supabase';

export default function Home() {
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

      {/* Hero compact */}
      <section className="text-center px-6 pt-20 pb-8">
        <div className="inline-block px-4 py-1.5 rounded-full bg-[#E07040]/20 text-[#E07040] text-sm mb-5">
          AI Website &amp; App Builder
        </div>
        <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-4">
          Build your business <span className="text-nexiora">with AI</span>
        </h1>
        <p className="text-slate-400 text-base md:text-lg max-w-2xl mx-auto mb-4">
          Nexiora automatically creates websites, dashboards, and apps for entrepreneurs.
        </p>
        {authLoaded && userEmail && (
          <Link
            href="/dashboard"
            className="inline-block text-sm text-slate-400 hover:text-white transition"
          >
            Go to My Dashboard →
          </Link>
        )}
      </section>

      {/* Onboarding = élément dominant */}
      <OnboardingFlow />

      <Footer />
    </main>
  );
}
