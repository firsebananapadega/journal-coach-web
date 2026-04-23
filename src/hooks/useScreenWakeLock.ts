'use client';

// Screen Wake Lock — keeps the display on while a recording or other
// long-running user activity is happening, so iOS/Android's auto-lock
// doesn't silently kill an in-progress mic session.
//
// Honest caveats (user-facing):
//   - Only blocks AUTOMATIC screen-off. Pressing the power button
//     still locks the device.
//   - Browser releases the lock whenever the tab/app is backgrounded;
//     we re-acquire on visibilitychange so returning to the app
//     resumes the lock.
//   - iOS Safari PWA supports this from 16.4+ (WebKit). On unsupported
//     browsers the hook is a silent no-op — never throws.
//
// Call sites just toggle `active` true/false and don't have to worry
// about the sentinel lifecycle.

import { useEffect, useRef, useState } from 'react';

interface WakeLockSentinel {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', cb: () => void) => void;
}

interface WakeLockApi {
  request: (type: 'screen') => Promise<WakeLockSentinel>;
}

export function useScreenWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const [supported, setSupported] = useState<boolean>(false);
  const [held, setHeld] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const wl = (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock;
    setSupported(Boolean(wl));
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const wl = (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock;
    if (!wl) return;

    let cancelled = false;

    const acquire = async () => {
      try {
        const sentinel = await wl.request('screen');
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null;
            setHeld(false);
          }
        });
        sentinelRef.current = sentinel;
        setHeld(true);
        setLastError(null);
      } catch (err) {
        setLastError(err instanceof Error ? err.message : 'wakeLock request failed');
        setHeld(false);
      }
    };

    const release = async () => {
      const s = sentinelRef.current;
      sentinelRef.current = null;
      setHeld(false);
      if (s && !s.released) {
        try {
          await s.release();
        } catch {
          // Ignore — release is best-effort.
        }
      }
    };

    if (active) {
      acquire();
      // Browser revokes the lock on backgrounding. Re-acquire on
      // visibility change so returning to the app keeps the mic alive.
      const onVisibility = () => {
        if (document.visibilityState === 'visible' && active && !sentinelRef.current) {
          acquire();
        }
      };
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        cancelled = true;
        document.removeEventListener('visibilitychange', onVisibility);
        release();
      };
    }

    // Inactive path: release any existing lock.
    release();
    return () => {
      cancelled = true;
    };
  }, [active]);

  return { supported, held, lastError };
}
