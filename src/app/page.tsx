'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { t } from '@/lib/translations';

// Per-wall path maps. Mirrors wallState's lastTabPerWall keys so the
// root redirect can return the user to whichever tab they last viewed
// on whichever wall they last had active.
const TASKS_PATHS: Record<string, string> = {
  today: '/today',
  lists: '/lists',
  upcoming: '/upcoming',
  groceries: '/groceries',
};
const JOURNAL_PATHS: Record<string, string> = {
  pulse: '/pulse',
  notebooks: '/notebooks',
  journal: '/journal',
  intentions: '/intentions',
  patterns: '/patterns',
};

interface PersistedWallState {
  activeWall?: 'tasks' | 'journal';
  lastTabPerWall?: { tasks?: string; journal?: string };
}

/** Decide where a returning, onboarded user should land. Reads
 *  wallState.v1 localStorage; falls back to profile.primary_use; final
 *  fallback is /home. Exported so /auth/sign-up can reuse it. */
export function lastWallDestination(primaryUse?: string | null): string {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('wallState.v1');
      if (raw) {
        const p = JSON.parse(raw) as PersistedWallState;
        if (p.activeWall === 'tasks') {
          const tab = p.lastTabPerWall?.tasks ?? 'today';
          return TASKS_PATHS[tab] ?? '/today';
        }
        if (p.activeWall === 'journal') {
          const tab = p.lastTabPerWall?.journal ?? 'pulse';
          return JOURNAL_PATHS[tab] ?? '/home';
        }
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

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg">
      <div className="animate-pulse text-primary text-lg">{t('common.loading')}</div>
    </div>
  );
}
