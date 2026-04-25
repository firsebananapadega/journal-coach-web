'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { t } from '@/lib/translations';

export default function SignUpPage() {
  const router = useRouter();
  const { signUp, loading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError(t('signUp.passwordMin'));
      return;
    }
    const result = await signUp(email, password);
    if (result.error) {
      setError(result.error);
      return;
    }
    // Autoconfirm path: Supabase returned a session immediately. Skip
    // the check-email screen and route into the app — onboarding for
    // first-time users, /home if a profile already exists. Mirrors
    // /auth/confirm's branching so the two entry points behave the
    // same. If confirmation gets re-enabled later, hasSession is
    // false and we fall back to the original screen.
    if (result.hasSession) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', user.id)
          .maybeSingle();
        const needsOnboarding = !profile || !profile.onboarding_completed;
        router.replace(needsOnboarding ? '/auth/onboarding' : '/home');
        return;
      }
    }
    setSuccess(true);
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-bg">
        <div className="max-w-sm w-full space-y-4 text-center">
          <h1 className="text-2xl font-bold text-text-primary">{t('signUp.checkEmail')}</h1>
          <p className="text-text-secondary">
            {t('signUp.confirmationSent')} <strong>{email}</strong>{t('signUp.clickToActivate')}
          </p>
          <button
            onClick={() => router.push('/auth/sign-in')}
            className="mt-4 py-3 px-6 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors"
          >
            {t('signUp.goToSignIn')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-bg">
      <div className="max-w-sm w-full space-y-6">
        <div>
          <button onClick={() => router.back()} className="text-text-secondary hover:text-text-primary text-sm mb-4">
            &larr; {t('common.back')}
          </button>
          <h1 className="text-2xl font-bold text-text-primary">{t('signUp.title')}</h1>
          <p className="text-text-secondary text-sm mt-1">{t('signUp.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t('signUp.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:border-primary outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t('signUp.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:border-primary outline-none"
              required
              minLength={6}
            />
          </div>

          {error && <p className="text-error text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {loading ? t('signUp.loading') : t('signUp.button')}
          </button>
        </form>

        <p className="text-sm text-text-secondary text-center">
          {t('signUp.hasAccount')}{' '}
          <Link href="/auth/sign-in" className="text-primary hover:underline">
            {t('signUp.signIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}
