'use client';
import { useState, useEffect } from 'react';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';
import Sidebar from '@/components/Sidebar';
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
    <div className="min-h-screen nexiora-bg text-white flex">
      <Sidebar />
      <main className="flex-1 min-w-0 px-6 lg:pl-40 lg:pr-12">
        <div className="pt-60 pb-8" />
        <OnboardingFlow />
      </main>
    </div>
  );
}
