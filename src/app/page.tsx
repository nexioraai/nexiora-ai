'use client';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';

export default function Home() {
  return (
    <main className="min-h-screen nexiora-bg text-white">
      <Navbar />
      <OnboardingFlow />
      <Footer />
    </main>
  );
}
