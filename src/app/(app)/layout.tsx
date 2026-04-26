'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import Link from 'next/link';
import { t } from '@/lib/translations';
import GuideMascot from '@/components/mascot/GuideMascot';
import UIOverlayRoot from '@/components/ui/UIOverlayRoot';
import { useTheme } from '@/lib/theme';
import { WallShell } from '@/components/WallShell';
import { WallNav } from '@/components/WallNav';
import { wallForPath } from '@/lib/wallState';
import GuideTour from '@/components/tour/GuideTour';

// Wall-home destinations used when redirecting a user who has
// scoped to a single wall but landed on the other side.
const TASKS_HOME = '/today';
const JOURNAL_HOME = '/home';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useAuthStore((s) => s.session);
  const initialized = useAuthStore((s) => s.initialized);
  const profile = useAuthStore((s) => s.profile);
  const guideTheme = useTheme((s) => s.guideTheme);

  useEffect(() => {
    if (!initialized) return;
    if (!session) {
      router.replace('/auth/welcome');
      return;
    }
    // Force users through onboarding if they haven't completed it —
    // covers the case where a user lands on /home or any (app) route
    // directly (e.g. via a deep link) while onboarding_completed is
    // still false. RootPage has a mirror check for '/'.
    if (profile && !profile.onboarding_completed) {
      router.replace('/auth/onboarding');
      return;
    }

    // Wall-scope guard. When the user has narrowed primary_use to
    // 'tasks' or 'journal' (via onboarding or the Settings toggle)
    // and the current path belongs to the OTHER wall, redirect to
    // their wall's home. 'both' and null users are unaffected — the
    // edge tab handles their wall switching naturally.
    if (profile?.primary_use === 'tasks' || profile?.primary_use === 'journal') {
      const currentWall = wallForPath(pathname);
      if (
        (profile.primary_use === 'tasks' && currentWall === 'journal') ||
        (profile.primary_use === 'journal' && currentWall === 'tasks')
      ) {
        router.replace(profile.primary_use === 'tasks' ? TASKS_HOME : JOURNAL_HOME);
      }
    }
  }, [initialized, session, profile, pathname, router]);

  // Guide-matched theme — applies [data-guide-theme="{id}"] to the
  // document root only when (a) toggle is on AND (b) user has a guide
  // picked. Removing the attribute reverts to the default warm-gold
  // palette.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (guideTheme && profile?.preferred_guide) {
      root.setAttribute('data-guide-theme', profile.preferred_guide);
    } else {
      root.removeAttribute('data-guide-theme');
    }
  }, [guideTheme, profile?.preferred_guide]);

  // Timezone backfill. The legacy default is 'UTC' for a lot of
  // existing rows; the pulse-reminder cron needs the user's actual
  // local tz to fire morning/evening reminders at their picked
  // times. Update only when the stored value is empty/UTC AND the
  // browser reports a different value — never overwrites a user
  // who explicitly picked their tz somewhere.
  useEffect(() => {
    if (!profile) return;
    const browserTz = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        return null;
      }
    })();
    if (!browserTz) return;
    if (profile.timezone && profile.timezone !== 'UTC') return;
    if (browserTz === profile.timezone) return;
    void useAuthStore.getState().updateProfile({ timezone: browserTz });
  }, [profile]);

  if (!initialized || !session) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="flex flex-col items-center gap-3">
          <GuideMascot pose="meditate" size="lg" glow animate />
          <span className="text-xs text-text-tertiary">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  // Full-screen pages bypass both the wall flip wrapper AND the wall
  // nav — they take the entire screen. The center action buttons on the
  // wall nav point AT some of these pages (e.g. /voice for Tasks mic,
  // /guided for Journal chat) so the flow is: tap center → push to a
  // hideNav route → save/cancel returns the user to their wall.
  //
  // /intentions itself is a tab now (Journal wall slot 3) — it MUST
  // show the nav. Only the gallery sub-page (/intentions/gallery) is
  // a modal-style full-screen route that hides nav.
  const hideNav =
    ['/guided', '/voice', '/write', '/ask', '/journal', '/habits', '/templates'].includes(pathname) ||
    pathname.startsWith('/template/') ||
    pathname.startsWith('/entry/') ||
    pathname.startsWith('/practice/') ||
    pathname.startsWith('/intentions/');

  // Settings is its own thing — show nav (so users can flip back to a
  // wall) but the page itself owns its layout. We only suppress the
  // settings gear icon on settings page itself to avoid a redundant
  // self-link.
  const isSettings = pathname === '/settings';

  // The gear icon is context-aware. On a specific notebook view
  // (/notebooks/<slug>) we hand off to the BookPage header, which
  // renders its own gear that opens *notebook* settings (rename,
  // color, icon) instead of app settings. The global gear would
  // both overlap the composer card AND be the wrong destination for
  // "edit this notebook" — so suppress it here.
  const isInsideNotebook = /^\/notebooks\/[^/]+/.test(pathname);
  // Same pattern for /lists/[id] — the list-detail page renders its
  // own gear that opens list-scoped settings (rename, icon, delete).
  const isInsideList = /^\/lists\/[^/]+/.test(pathname);

  // Pages without a wall (e.g. /settings) skip the flip animation so
  // they don't visually flip in/out when the user taps the gear from
  // a wall page. Render them inline.
  const isOnWall = wallForPath(pathname) !== null;

  // For hideNav (full-screen) routes, the outer must match the
  // VISIBLE viewport so iOS doesn't pan the document when an input
  // is focused. `min-h-screen` resolves to `min-height: 100vh` which
  // on iOS Safari = LARGE viewport (doesn't shrink with the
  // keyboard) — body would overflow and iOS would scroll the page
  // to bring the focused input into view, hiding the header.
  // `h-[100dvh] overflow-hidden` glues the layout to the visible
  // viewport so there's nothing to scroll.
  //
  // For nav (regular) routes, keep `min-h-screen` so long content
  // (e.g. /history, /patterns) can grow and scroll normally; the
  // bottom WallNav is `position: fixed` so it doesn't depend on
  // this height anyway.
  const outerClass = hideNav
    ? 'flex flex-col h-[100dvh] overflow-hidden bg-bg'
    : 'flex flex-col min-h-screen bg-bg';

  return (
    <div className={outerClass}>
      <UIOverlayRoot />
      <GuideTour />

      {/* Settings gear — fixed top-right, hidden on full-screen and
          settings itself. Also hidden inside a specific notebook —
          BookPage renders its own context-aware gear there. Sits
          above page content so any page can reserve top padding
          (the existing pages already do). */}
      {!hideNav && !isSettings && !isInsideNotebook && !isInsideList && (
        <Link
          href="/settings"
          aria-label={t('settings.title') || 'Settings'}
          className="fixed top-4 right-4 z-40 w-9 h-9 rounded-full bg-surface/80 backdrop-blur border border-border flex items-center justify-center text-text-secondary hover:text-text-primary"
          style={{ marginTop: 'env(safe-area-inset-top)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      )}

      <main className={`flex-1 ${hideNav ? '' : 'pb-36'}`}>
        {hideNav || !isOnWall ? children : <WallShell>{children}</WallShell>}
      </main>

      {!hideNav && <WallNav />}
    </div>
  );
}
