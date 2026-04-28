'use client';

// Single, consistent loading screen used during cold-start (RootPage,
// AppLayout pre-init, wall-redirects). Reads `preferred_guide` from
// localStorage SYNCHRONOUSLY so the mascot shown matches the user's
// guide even before the Supabase profile round-trip completes. If no
// guide is cached, renders a minimal logo-less spinner instead of
// flashing a default guide that isn't theirs.
//
// Why a shared component:
//   The cold-start sequence used to render three different loading
//   UIs back-to-back (RootPage's "Loading" text → AppLayout's
//   GuideMascot+Loading with a wrong guide → same UI with the right
//   guide). Centralizing fixes both the visual jank and the
//   "wrong-guide flash" reported by users in 04/2026.

import Mascot from '@/components/mascot/Mascot';
import type { GuideId } from '@/lib/guideConfigs';
import { t } from '@/lib/translations';

const VALID_GUIDES: GuideId[] = ['ben', 'quinn', 'sage', 'bodhi'];

function readCachedGuide(): GuideId | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem('preferred_guide');
    if (v && (VALID_GUIDES as string[]).includes(v)) return v as GuideId;
  } catch {
    /* ignore */
  }
  return null;
}

export default function LoadingScreen() {
  // Synchronous read — runs once during initial render, no useEffect.
  const guide = readCachedGuide();
  return (
    // `loading-screen-root` is the CSS hook for the iOS PWA bfcache
    // mitigation in globals.css. When `<html>` has `wall-pending`, the
    // body's content is visibility:hidden — but this element overrides
    // it back to visibility:visible so the user sees the mascot/spinner
    // during the brief window before React's wall guard redirects.
    <div className="loading-screen-root flex items-center justify-center min-h-screen bg-bg">
      <div className="flex flex-col items-center gap-3">
        {guide ? (
          <Mascot guide={guide} pose="meditate" size="lg" glow animate />
        ) : (
          // No cached guide → don't pick one. Show a soft, generic
          // pulsing dot. Prevents flashing a guide the user didn't
          // pick. The mascot will appear on the next cold-start once
          // fetchProfile has cached it.
          <div className="w-16 h-16 rounded-full bg-primary/20 animate-pulse" />
        )}
        <span className="text-xs text-text-tertiary">{t('common.loading')}</span>
      </div>
    </div>
  );
}
