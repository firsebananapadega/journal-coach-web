'use client';

// /auth/reset-password — landing page for the recovery link emailed
// by `supabase.auth.resetPasswordForEmail`. When the user clicks the
// link they arrive here with a short-lived "recovery" session already
// attached (detectSessionInUrl=true in supabase.ts lifts the hash
// tokens into the client automatically, and onAuthStateChange fires
// `PASSWORD_RECOVERY`).
//
// From the user's perspective: type a new password, confirm, submit.
// We call `updateUser({ password })` which both persists the new
// password and keeps the session alive — so the user is dropped into
// /home already signed in.
//
// If someone hits this URL directly (no recovery session), we show
// an "invalid link" message with a link back to Forgot Password.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/translations';

type Mode = 'checking' | 'ready' | 'invalid' | 'success';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    // The recovery session is attached via detectSessionInUrl on the
    // supabase client. onAuthStateChange fires PASSWORD_RECOVERY when
    // that happens. We ALSO check getSession() directly because if the
    // user refreshes this page the event has already fired and won't
    // re-fire — but the session is still present.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setMode('ready');
      }
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setMode('ready');
      } else {
        // Give detectSessionInUrl a brief window to process the hash
        // before we conclude the link is bad. 800ms is plenty on
        // first load and unnoticeable to the user.
        setTimeout(async () => {
          if (cancelled) return;
          const { data: retry } = await supabase.auth.getSession();
          if (retry.session) {
            setMode('ready');
          } else {
            setMode('invalid');
          }
        }, 800);
      }
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError(t('resetPassword.tooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('resetPassword.mismatch'));
      return;
    }
    setSubmitting(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    setMode('success');
    // Give the toast a beat, then route into the app. The user is
    // signed in already — /home will re-route to onboarding if their
    // profile isn't finished.
    setTimeout(() => router.replace('/home'), 900);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-bg">
      <div className="max-w-sm w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            {t('resetPassword.title')}
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            {t('resetPassword.subtitle')}
          </p>
        </div>

        {mode === 'checking' && (
          <p className="text-sm text-text-tertiary italic">
            {t('confirm.loading')}
          </p>
        )}

        {mode === 'invalid' && (
          <div className="space-y-4">
            <p className="text-sm text-error">{t('resetPassword.invalidLink')}</p>
            <Link
              href="/auth/forgot-password"
              className="block w-full text-center py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors"
            >
              {t('forgotPassword.title')}
            </Link>
          </div>
        )}

        {mode === 'ready' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">
                {t('resetPassword.newPassword')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:border-primary outline-none"
                required
                autoComplete="new-password"
                autoFocus
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">
                {t('resetPassword.confirmPassword')}
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:border-primary outline-none"
                required
                autoComplete="new-password"
                minLength={6}
              />
            </div>

            {error && <p className="text-error text-sm">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !password || !confirm}
              className="w-full py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {submitting ? t('resetPassword.loading') : t('resetPassword.button')}
            </button>
          </form>
        )}

        {mode === 'success' && (
          <p className="text-sm text-success">{t('resetPassword.success')}</p>
        )}
      </div>
    </div>
  );
}
