'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useEffect, useState } from 'react';
import { t } from '@/lib/translations';

export default function WelcomePage() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (session) router.replace('/home');
  }, [session, router]);

  const handleGoogle = async () => {
    setGoogleLoading(true);
    const result = await signInWithGoogle();
    if (result.error) setGoogleLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-bg">
      <div className="max-w-sm w-full space-y-8 text-center">
        <div className="space-y-3">
          <h1 className="text-4xl font-bold text-text-primary">JournalCoach</h1>
          <p className="text-text-secondary text-lg">
            {t('welcome.tagline')}
          </p>
        </div>

        <div className="space-y-3 pt-4">
          <button
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full py-3 px-6 bg-white text-gray-800 font-semibold rounded-2xl hover:bg-gray-100 transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {googleLoading ? t('welcome.connectingGoogle') : t('welcome.continueGoogle')}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-text-tertiary">{t('common.or')}</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <button
            onClick={() => router.push('/auth/sign-in')}
            className="w-full py-3 px-6 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors"
          >
            {t('welcome.signInEmail')}
          </button>
          <button
            onClick={() => router.push('/auth/sign-up')}
            className="w-full py-3 px-6 bg-surface border border-border text-text-primary font-semibold rounded-2xl hover:bg-surface-elevated transition-colors"
          >
            {t('welcome.createAccount')}
          </button>
        </div>

        <p className="text-xs text-text-tertiary pt-4 whitespace-pre-line">
          {t('welcome.footer')}
        </p>
      </div>
    </div>
  );
}
