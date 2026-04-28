'use client';

// /auth/forgot-password — users who can't remember their password
// arrive here from the Sign In page. We trigger Supabase's built-in
// `resetPasswordForEmail` which emails a recovery link; the user
// clicks it and lands on /auth/reset-password with an active recovery
// session to set a new password.
//
// UI states: compose → sent confirmation. We never reveal whether an
// email is registered (Supabase also doesn't leak that signal).

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { t } from '@/lib/translations';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { resetPassword } = useAuthStore();

  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    const res = await resetPassword(email.trim());
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSent(true);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-bg">
      <div className="max-w-sm w-full space-y-6">
        <div>
          <button
            onClick={() => router.back()}
            className="text-text-secondary hover:text-text-primary text-sm mb-4"
          >
            &larr; {t('common.back')}
          </button>
          <h1 className="text-2xl font-bold text-text-primary">
            {sent ? t('forgotPassword.sentTitle') : t('forgotPassword.title')}
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            {sent ? t('forgotPassword.sentBody') : t('forgotPassword.subtitle')}
          </p>
        </div>

        {!sent ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">
                {t('forgotPassword.email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:border-primary outline-none"
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            {error && <p className="text-error text-sm">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !email.trim()}
              className="w-full py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {submitting ? t('forgotPassword.loading') : t('forgotPassword.button')}
            </button>
          </form>
        ) : (
          <Link
            href="/auth/sign-in"
            className="block w-full text-center py-3 bg-surface border border-border text-text-primary font-medium rounded-2xl hover:bg-surface-elevated transition-colors"
          >
            {t('forgotPassword.backToSignIn')}
          </Link>
        )}

        {!sent && (
          <p className="text-sm text-text-secondary text-center">
            <Link href="/auth/sign-in" className="text-primary hover:underline">
              {t('forgotPassword.backToSignIn')}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
