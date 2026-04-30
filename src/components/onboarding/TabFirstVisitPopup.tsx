'use client';

// First-visit tab popups — light contextual one-liners for the
// secondary tabs (Notebooks / Patterns / Guided / Lists / Upcoming /
// Groceries). Pulse and Today are skipped because the linear tour
// already covers them.
//
// Mechanics:
//   - Reads pathname; matches against TAB_COPY map.
//   - Suppressed when the linear tour is still running (don't stack).
//   - Suppressed when the path is already in profile.tour_seen_tabs.
//   - On dismiss: appends path to tour_seen_tabs (DB + localStorage
//     mirror), unmounts.
//   - localStorage cache reads instantly on cold-open so the popup
//     doesn't flicker into view before the profile has loaded.
//
// Design: bottom-sheet card (not a spotlight tour). Easier to dismiss,
// doesn't fight other UI, doesn't require an anchor.

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useTourStore } from '@/lib/tourStore';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';

// Map of path → translation key. Only paths in this map can fire a
// popup. Paths covered by the linear tour (/pulse, /today) are
// intentionally absent.
const TAB_COPY: Record<string, string> = {
  '/notebooks': 'tabPopup.notebooks',
  '/patterns': 'tabPopup.patterns',
  '/guided': 'tabPopup.guided',
  '/upcoming': 'tabPopup.upcoming',
  '/lists': 'tabPopup.lists',
  '/groceries': 'tabPopup.groceries',
};

// localStorage key for the seen-tabs set, mirroring profile.tour_seen_tabs.
// Reads instantly on cold-open so the popup doesn't flash before the
// profile arrives over the network.
const LS_KEY = 'tour_seen_tabs.v1';

function readLocalSeen(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeLocalSeen(s: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(Array.from(s)));
  } catch {}
}

export default function TabFirstVisitPopup() {
  const pathname = usePathname();
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const tourActive = useTourStore((s) => s.active);

  const [localSeen, setLocalSeen] = useState<Set<string>>(() => readLocalSeen());
  const [dismissedThisSession, setDismissedThisSession] = useState<Set<string>>(() => new Set());

  // Sync localStorage seen with profile.tour_seen_tabs whenever the
  // profile changes. Profile is the source of truth — localStorage is
  // a faster-read mirror.
  useEffect(() => {
    if (!profile) return;
    const dbSeen = new Set(profile.tour_seen_tabs ?? []);
    const merged = new Set([...localSeen, ...dbSeen]);
    if (
      merged.size !== localSeen.size ||
      [...merged].some((x) => !localSeen.has(x))
    ) {
      writeLocalSeen(merged);
      setLocalSeen(merged);
    }
  }, [profile, localSeen]);

  const copyKey = pathname ? TAB_COPY[pathname] : undefined;
  const shouldShow = useMemo(() => {
    if (!copyKey) return false;
    if (!profile) return false;
    if (tourActive) return false;
    if (!profile.tour_completed) return false; // wait for tour to finish
    if (localSeen.has(pathname)) return false;
    if (dismissedThisSession.has(pathname)) return false;
    return true;
  }, [copyKey, profile, tourActive, localSeen, dismissedThisSession, pathname]);

  const dismiss = () => {
    if (!profile || !pathname) return;
    // Optimistic: mark dismissed in this session immediately so the
    // popup unmounts on the next render even if the DB write is slow.
    setDismissedThisSession((s) => new Set(s).add(pathname));
    const nextSeen = new Set(localSeen).add(pathname);
    setLocalSeen(nextSeen);
    writeLocalSeen(nextSeen);
    // Persist the merged seen list to the DB. Drop into the profile
    // update — the existing updateProfile path already handles
    // partial updates.
    const merged = Array.from(new Set([...(profile.tour_seen_tabs ?? []), pathname]));
    updateProfile({ tour_seen_tabs: merged }).catch(() => {
      // localStorage already saved — survives reload on this device.
    });
  };

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          key={pathname}
          initial={prefersReducedMotion ? undefined : { y: 80, opacity: 0 }}
          animate={prefersReducedMotion ? undefined : { y: 0, opacity: 1 }}
          exit={prefersReducedMotion ? undefined : { y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed inset-x-3 z-[55] pointer-events-none"
          style={{
            // Sit above the wall nav (which is bottom-fixed at z-50
            // with safe-area bottom). pb-36 in the layout gives us the
            // strip; we anchor at calc(safe-area + ~88px) to clear it.
            bottom: 'calc(env(safe-area-inset-bottom) + 96px)',
          }}
          role="dialog"
          aria-live="polite"
        >
          <div
            className="pointer-events-auto max-w-md mx-auto bg-surface border border-border rounded-2xl shadow-warm-md p-4 space-y-3"
          >
            <p className="text-sm text-text-primary leading-relaxed">
              {copyKey && t(copyKey)}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={dismiss}
                className="text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-full px-4 py-1.5 shadow-warm-sm"
              >
                {t('tabPopup.gotIt')}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
