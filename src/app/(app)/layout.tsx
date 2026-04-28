'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import Link from 'next/link';
import { t } from '@/lib/translations';
import LoadingScreen from '@/components/LoadingScreen';
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
  const searchParams = useSearchParams();
  const session = useAuthStore((s) => s.session);
  const initialized = useAuthStore((s) => s.initialized);
  const profile = useAuthStore((s) => s.profile);
  const guideTheme = useTheme((s) => s.guideTheme);

  // ── Wall guard ──────────────────────────────────────────────────
  //
  // Computed during render (synchronously) so the wrong-wall page
  // NEVER paints. Two layers:
  //
  //   (a) primary_use scope (always-on): tasks-only or journal-only
  //       users who land on the other wall via deep-link / restored
  //       URL get bounced immediately.
  //
  //   (b) cold-start / resume wallState restore: when a wall page is
  //       mounted on cold start OR when the PWA is brought back from
  //       background, check wallState.v1.activeWall and redirect if
  //       the incoming URL is on a different wall.
  //
  // Why a useRef + visibility/pageshow listeners instead of the prior
  // sessionStorage flag: iOS keeps PWAs alive in background longer
  // than the user expects. Tap the icon to "reopen" and what actually
  // happens is a resume — the JS context is preserved, sessionStorage
  // is preserved, and the cached cold-start flag from the previous
  // session blocked the guard from re-running. Resulting in a flash
  // of /home (with the weekly-letter banner) before the redirect.
  //
  // The new approach:
  //   - useRef tracks "guard pending". Refs survive renders but reset
  //     on a true JS-context reload (full PWA kill+open).
  //   - pageshow with persisted=true (bfcache restore) AND
  //     visibilitychange→visible (any background→foreground) reset
  //     the ref to true and force a re-render. The guard fires again,
  //     and if URL is on the wrong wall it redirects.
  //   - The mark-consumed effect flips the ref to false AFTER each
  //     wall-aware render, so in-session navigation between walls
  //     (taps on the WallEdgeTab) is unaffected.
  //
  // Both branches always return the wall HOME (/today or /home), not
  // the last-visited sub-tab — per user request.
  const wallCheckPending = useRef(true);
  // Bumping this nonce forces a re-render after pageshow / visibility
  // events flip the ref above. Refs alone don't schedule a render.
  const [resumeNonce, setResumeNonce] = useState(0);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const reCheck = () => {
      wallCheckPending.current = true;
      setResumeNonce((n) => n + 1);
    };
    const onPageShow = (e: PageTransitionEvent) => {
      // Only bfcache restore — initial pageshow is already covered
      // by the mount path. Without this filter we'd fire an extra
      // (harmless) render on every fresh load.
      if (e.persisted) reCheck();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') reCheck();
    };
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const wantedWallRedirect = (() => {
    if (!initialized || !profile) return null;

    const currentWall = wallForPath(pathname);
    if (currentWall === null) return null;

    // (a) primary_use scope — ALWAYS fires (not gated on wallCheckPending).
    //
    // The previous version of this code gated branch (a) on the
    // cold-start ref, which meant a Settings change to primary_use
    // (after cold-start was consumed) didn't trigger a redirect.
    // Result: user toggles "tasks only" while on /home, the
    // WallEdgeTab disappears, but they stay stuck on /home until
    // they manually navigate. Branch (a) is a permanent invariant
    // (scope-only users never belong on the other wall) — gating it
    // on a cold-start flag was a bug.
    if (profile.primary_use === 'tasks' && currentWall === 'journal') return TASKS_HOME;
    if (profile.primary_use === 'journal' && currentWall === 'tasks') return JOURNAL_HOME;

    // Notification deep-link flag — when the SW navigates here from a
    // tapped notification, it appends ?n=1 to the target URL. Skip the
    // wallState restore so the user actually lands on the URL the
    // notification pointed at, instead of being yanked to whichever
    // wall they had open last. Branch (a) above still applies because
    // primary_use is a permanent scope, not session state. The strip
    // effect below removes the param after consumption.
    if (searchParams?.get('n') === '1') return null;

    // (b) wallState restore — only applies on cold-start / resume.
    if (!wallCheckPending.current) return null;
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem('wallState.v1');
      if (!raw) return null;
      const p = JSON.parse(raw) as { activeWall?: string };
      if (p.activeWall === 'tasks' && currentWall === 'journal') return TASKS_HOME;
      if (p.activeWall === 'journal' && currentWall === 'tasks') return JOURNAL_HOME;
    } catch {
      /* parse failure — leave them on whatever URL they landed on */
    }
    return null;
  })();

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

    // Wall guard — fire whatever redirect the synchronous render
    // calculation above asked for (covers both primary_use scope AND
    // cold-start wallState restore).
    if (wantedWallRedirect) {
      router.replace(wantedWallRedirect);
    }
  }, [initialized, session, profile, pathname, router, wantedWallRedirect]);

  // Mark the wall check consumed AFTER the render that may have
  // computed a non-null redirect target. The ref flip happens on
  // commit — refs don't trigger re-renders, so there's no extra
  // paint between the redirect's router.replace firing and the new
  // pathname's render. Subsequent in-session navigations between
  // walls flow through this effect (pathname dep changes) but the
  // guard returns null because the ref is already false. The ref
  // flips back to true only when pageshow/visibilitychange listeners
  // fire (PWA resume) — handled in the effect above.
  useEffect(() => {
    if (!initialized || !profile) return;
    wallCheckPending.current = false;
  }, [initialized, profile, pathname, resumeNonce]);

  // Strip the SW-injected ?n=1 flag once we've consumed it for the
  // wall-restore skip above. Keeping it in the URL would leak it into
  // shared links, the address bar, and back-button history. The ref
  // guard prevents an infinite loop in case searchParams updates
  // mid-pass.
  const stripNotifFlagRef = useRef(false);
  useEffect(() => {
    if (stripNotifFlagRef.current) return;
    if (!searchParams || searchParams.get('n') !== '1') return;
    stripNotifFlagRef.current = true;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('n');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, searchParams, router]);

  // Companion to the inline `wall-pending` script in src/app/layout.tsx.
  // The inline script puts the class on at pagehide so iOS's bfcache
  // snapshot ships with the body hidden by CSS. On resume the inline
  // script removes the class synchronously when the URL is on the
  // correct wall — but when it's NOT, React owns the redirect and the
  // class has to stay until we land on the right wall. This effect
  // performs the removal once the wall guard has resolved and we're
  // about to render real content.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (initialized && !wantedWallRedirect) {
      document.documentElement.classList.remove('wall-pending');
    }
  }, [initialized, wantedWallRedirect, pathname]);

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

  // Language backfill. Pre-this-feature `language` lived only in
  // localStorage. If the stored profile.language is the en-US
  // default but localStorage already says es-MX, the user picked
  // Spanish before the column existed — sync it up so the cron's
  // letter-language check matches what the user sees in the UI.
  useEffect(() => {
    if (!profile) return;
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('app_language');
    if (stored !== 'en-US' && stored !== 'es-MX') return;
    if (stored === profile.language) return;
    // Only auto-sync when we're upgrading FROM the en-US default
    // TO a non-default. We never silently overwrite a user-picked
    // profile language back to en-US even if their localStorage
    // happens to say so (e.g. clearing site data).
    if (profile.language === 'en-US' && stored === 'es-MX') {
      void useAuthStore.getState().updateProfile({ language: stored });
    }
  }, [profile]);

  if (!initialized || !session || wantedWallRedirect) {
    return <LoadingScreen />;
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
