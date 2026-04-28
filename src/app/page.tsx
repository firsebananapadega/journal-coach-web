'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import LoadingScreen from '@/components/LoadingScreen';

interface PersistedWallState {
  activeWall?: 'tasks' | 'journal';
}

/** Decide where a returning, onboarded user should land. Returns the
 *  HOME of whichever wall they last had active — Today for tasks,
 *  Pulse (= /home) for journal. We deliberately do NOT restore the
 *  last-visited sub-tab because the user prefers a consistent home-
 *  tab landing per cold-start ("doesn't have to remember the specific
 *  tab"). Falls back to profile.primary_use, then /home. Exported so
 *  /auth/sign-up can reuse it. */
export function lastWallDestination(primaryUse?: string | null): string {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('wallState.v1');
      if (raw) {
        const p = JSON.parse(raw) as PersistedWallState;
        if (p.activeWall === 'tasks') return '/today';
        if (p.activeWall === 'journal') return '/home';
      }
    } catch {
      // localStorage parse failed — fall through.
    }
  }
  if (primaryUse === 'tasks') return '/today';
  return '/home';
}

export default function RootPage() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const initialized = useAuthStore((s) => s.initialized);

  useEffect(() => {
    if (!initialized) return;
    if (!session) {
      router.replace('/auth/welcome');
    } else if (profile && !profile.onboarding_completed) {
      router.replace('/auth/onboarding');
    } else if (profile) {
      router.replace(lastWallDestination(profile.primary_use));
    }
  }, [session, profile, initialized, router]);

  return <LoadingScreen />;
}
