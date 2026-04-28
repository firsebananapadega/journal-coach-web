'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { safeNextPath } from '@/lib/safeNextPath';

// OAuth landing page. Supabase JS reads the `#access_token=...` hash
// (because `detectSessionInUrl: true`), establishes a session, then
// fires SIGNED_IN. Once we have a session, redirect to the validated
// `?next=` path — this is how share links survive a Google sign-in
// round-trip.
function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get('next')) ?? '/home';

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        router.replace(next);
        return;
      }
      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (cancelled) return;
        if (event === 'SIGNED_IN' && session) {
          router.replace(next);
        }
      });
      return () => sub.subscription.unsubscribe();
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [router, next]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg">
      <p className="text-text-secondary text-sm">Signing you in…</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-screen bg-bg">
          <p className="text-text-secondary text-sm">Signing you in…</p>
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
