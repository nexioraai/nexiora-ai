'use client';

import OnboardingChat from '@/components/onboarding/OnboardingChat';
import Sidebar from '@/components/Sidebar';

export default function OnboardingChatPage() {
  return (
    <div className="min-h-screen nexiora-bg text-white flex">
      <Sidebar />
      <main className="flex-1 min-w-0 px-6 lg:pl-40 lg:pr-12">
        <div className="pt-24 pb-4" />
        <OnboardingChat />
      </main>
    </div>
  );
}
