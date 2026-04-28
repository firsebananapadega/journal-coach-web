'use client';

// Tracks online/offline state via the browser's `online` / `offline`
// events. `navigator.onLine` is famously unreliable in the `true`
// direction (browsers report online when only loopback is up) — but
// `false` is authoritative across all major browsers, which is the
// direction we care about for showing the OfflineIndicator and
// gating AI features.
//
// Phase 3 of the offline-first rollout will replace this with a HEAD
// probe to defeat false positives. For Phase 1 the consumers
// (drainOutbox in particular) handle fetch failures gracefully even
// when this hook says "online", so the lying-true case just means
// the drainer harmlessly retries on the next event.

import { useEffect, useState } from 'react';

let cached: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
const subscribers = new Set<(online: boolean) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    cached = true;
    subscribers.forEach((fn) => fn(true));
  });
  window.addEventListener('offline', () => {
    cached = false;
    subscribers.forEach((fn) => fn(false));
  });
}

/** Synchronous read. Module-level cache; no React subscription. */
export function isOnline(): boolean {
  return cached;
}

/** React hook. Re-renders the component on online/offline transitions.
 *  Returns `true` during SSR / static prerender so server-rendered HTML
 *  doesn't flash an offline banner. Hydration corrects to actual state
 *  on first client render. */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(true);
  useEffect(() => {
    setOnline(cached);
    const fn = (next: boolean) => setOnline(next);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);
  return online;
}
