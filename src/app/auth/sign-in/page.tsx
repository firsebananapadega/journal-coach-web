'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import Link from 'next/link';
import { t } from '@/lib/translations';
import { safeNextPath } from '@/lib/safeNextPath';

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}

function SignInInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Same-origin path only — blocks open-redirect attacks like
  // ?next=https://evil.com or ?next=//evil.com.
  const next = safeNextPath(searchParams.get('next'));
  const { signIn, signInWithGoogle, loading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const result = await signIn(email, password);
    if (result.error) {
      setError(result.error);
    } else {
      router.replace(next ?? '/home');
    }
  };

  const handleGoogle = async () => {
    const result = await signInWithGoogle(next ?? undefined);
    if (result.error) setError(result.error);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-bg">
      <div className="max-w-sm w-full space-y-6">
        <div>
          <button onClick={() => router.back()} className="text-text-secondary hover:text-text-primary text-sm mb-4">
            &larr; {t('common.back')}
          </button>
          <h1 className="text-2xl font-bold text-text-primary">{t('signIn.title')}</h1>
          <p className="text-text-secondary text-sm mt-1">{t('signIn.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t('signIn.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:border-primary outline-none"
              required
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm text-text-secondary">
                {t('signIn.password')}
              </label>
              <Link
                href="/auth/forgot-password"
                className="text-xs text-primary hover:underline"
              >
                {t('signIn.forgotPassword')}
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:border-primary outline-none"
              required
            />
          </div>

          {error && <p className="text-error text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {loading ? t('signIn.loading') : t('signIn.button')}
          </button>
        </form>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-text-tertiary">{t('common.or')}</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <button
          onClick={handleGoogle}
          className="w-full py-3 px-6 bg-surface border border-border text-text-primary font-medium rounded-2xl hover:bg-surface-elevated transition-colors"
        >
          {t('welcome.continueGoogle')}
        </button>

        <p className="text-sm text-text-secondary text-center">
          {t('signIn.noAccount')}{' '}
          <Link
            href={next ? `/auth/sign-up?next=${encodeURIComponent(next)}` : '/auth/sign-up'}
            className="text-primary hover:underline"
          >
            {t('signIn.signUp')}
          </Link>
        </p>
      </div>
    </div>
  );
}
