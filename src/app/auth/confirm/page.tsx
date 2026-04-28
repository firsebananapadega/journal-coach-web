'use client';

// /auth/confirm — landing page for the email-verification redirect.
// Supabase's default signup confirmation link targets this URL (set
// via `emailRedirectTo` in authStore.signUp). By the time the user
// arrives, `detectSessionInUrl=true` on the Supabase client has
// already lifted the verification hash tokens and set the session.
//
// There's nothing for the user to do here. We briefly show a
// "confirming..." state, then route based on whether their profile
// onboarding is complete:
//   - fresh signup, no onboarding  → /auth/onboarding
//   - onboarding done              → /home
//   - session failed to attach     → /auth/sign-in with an error
//
// This page exists primarily so Supabase has a sane redirect target
// that isn't localhost. The real auth work is already done.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/translations';

export default function ConfirmPage() {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const decide = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        setError(true);
        return;
      }
      // Check whether the user has finished onboarding. Profiles are
      // auto-created by a DB trigger on signup, so the row exists but
      // `onboarding_completed` may still be false.
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', data.session.user.id)
        .maybeSingle();
      if (cancelled) return;
      const needsOnboarding = !profile || !profile.onboarding_completed;
      router.replace(needsOnboarding ? '/auth/onboarding' : '/home');
    };

    // Give detectSessionInUrl a beat to process the hash before we
    // decide the link was bad. 600ms is enough on a cold load.
    const id = window.setTimeout(decide, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-bg">
      <div className="max-w-sm w-full text-center space-y-4">
        {!error ? (
          <p className="text-sm text-text-tertiary italic">{t('confirm.loading')}</p>
        ) : (
          <>
            <p className="text-sm text-error">{t('confirm.error')}</p>
            <button
              onClick={() => router.replace('/auth/sign-in')}
              className="w-full py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors"
            >
              {t('signIn.button')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
