'use client';

// Client half of /share/grocery/[token]. Server page handles OG meta;
// this component does the auth check + accept_grocery_invite RPC, then
// shows a tiny success screen with a "Open from your home screen"
// banner — the only actionable hint we can give iOS users since PWAs
// can't claim Universal Links. After a few seconds (or on tap of the
// CTA), bounces to /groceries?joined=1.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useGroceryStore } from '@/stores/groceryStore';
import { t } from '@/lib/translations';

type State =
  | { kind: 'pending' }
  | { kind: 'redirecting' }
  | { kind: 'joined' }
  | { kind: 'invalid' }
  | { kind: 'error'; message: string };

export default function AcceptInviteClient({ token }: { token: string }) {
  const router = useRouter();
  const initialized = useAuthStore((s) => s.initialized);
  const user = useAuthStore((s) => s.user);
  const [state, setState] = useState<State>({ kind: 'pending' });

  useEffect(() => {
    if (!initialized) return;

    const next = `/share/grocery/${token}`;

    if (!user) {
      router.replace(`/auth/sign-in?next=${encodeURIComponent(next)}`);
      setState({ kind: 'redirecting' });
      return;
    }

    let cancelled = false;
    void (async () => {
      const { error } = await supabase.rpc('accept_grocery_invite', { p_token: token });
      if (cancelled) return;
      if (!error) {
        // Drop any cached grocery state from the user's pre-accept
        // list so the /groceries page doesn't briefly hydrate the
        // OLD list before the active_grocery_list_id pointer change
        // takes effect.
        try {
          useGroceryStore.getState().purgeCache();
        } catch {}
        setState({ kind: 'joined' });
        return;
      }
      if (/invite_invalid|expired|exhausted|revoked/i.test(error.message)) {
        setState({ kind: 'invalid' });
      } else {
        setState({ kind: 'error', message: error.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialized, user, token, router]);

  if (state.kind === 'invalid') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-bg px-6 text-center">
        <h1 className="text-xl font-bold text-text-primary mb-2">
          {t('share.acceptInvalidTitle')}
        </h1>
        <p className="text-sm text-text-secondary mb-6 max-w-sm">
          {t('share.acceptInvalidBody')}
        </p>
        <Link
          href="/groceries"
          className="px-5 py-2.5 rounded-2xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark"
        >
          {t('share.acceptInvalidCta')}
        </Link>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-bg px-6 text-center">
        <p className="text-sm text-error">{state.message}</p>
      </div>
    );
  }

  if (state.kind === 'joined') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-bg px-6 text-center">
        <div className="text-5xl mb-4" aria-hidden>
          ✓
        </div>
        <h1 className="text-xl font-bold text-text-primary mb-2">
          {t('share.acceptSuccessTitle')}
        </h1>
        <p className="text-sm text-text-secondary mb-6 max-w-sm">
          {t('share.acceptHomeScreenBanner')}
        </p>
        <Link
          href="/groceries?joined=1"
          className="px-5 py-2.5 rounded-2xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark"
        >
          {t('share.acceptOpenList')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg">
      <p className="text-text-secondary text-sm">{t('common.loading')}</p>
    </div>
  );
}
