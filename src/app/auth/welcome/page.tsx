'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useEffect } from 'react';

export default function WelcomePage() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (session) router.replace('/home');
  }, [session, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6 bg-bg">
      <div className="max-w-sm w-full space-y-8 text-center">
        <div className="space-y-3">
          <h1 className="text-4xl font-bold text-text-primary">JournalCoach</h1>
          <p className="text-text-secondary text-lg">
            Tap and talk. Science-backed journaling with AI guidance.
          </p>
        </div>

        <div className="space-y-3 pt-4">
          <button
            onClick={() => router.push('/auth/sign-in')}
            className="w-full py-3 px-6 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors"
          >
            Sign In
          </button>
          <button
            onClick={() => router.push('/auth/sign-up')}
            className="w-full py-3 px-6 bg-surface border border-border text-text-primary font-semibold rounded-2xl hover:bg-surface-elevated transition-colors"
          >
            Create Account
          </button>
        </div>

        <p className="text-xs text-text-tertiary pt-4">
          Voice-first journaling. Your guide asks the questions.<br />
          You do the thinking.
        </p>
      </div>
    </div>
  );
}
