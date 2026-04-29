'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/lib/theme';
import { installPromptBridge } from '@/hooks/usePwaInstall';
import { refreshSubscription } from '@/lib/push';
import { drainOutbox } from '@/lib/syncQueue';
import { useTaskStore } from '@/stores/taskStore';
import { useListStore } from '@/stores/listStore';
import { useGroceryStore } from '@/stores/groceryStore';
import { useJournalStore } from '@/stores/journalStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { useLettersStore } from '@/stores/lettersStore';

// Arm the install-prompt bridge at module load so we catch the event
// even if it fires before any UI mounts.
installPromptBridge.arm();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);
  const loadTheme = useTheme((s) => s.loadTheme);
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    initialize();
    loadTheme();
    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, [initialize, loadTheme]);

  // Silently re-sync the push subscription once a session exists.
  // If the user previously granted permission but the /api/push/
  // subscribe POST failed (e.g., the route was misconfigured at
  // the time), the browser has the subscription but the server
  // doesn't. This pushes the existing browser sub back to the
  // server on every authenticated boot so reminders self-heal.
  useEffect(() => {
    if (!session) return;
    const id = window.setTimeout(() => {
      refreshSubscription().catch(() => {});
    }, 1500);
    return () => window.clearTimeout(id);
  }, [session]);

  // Offline-first hooks for authed users:
  //   1. Request persistent storage so iOS Safari doesn't evict
  //      Dexie / Cache Storage after 7 days of no interaction. Daily
  //      users are safe regardless; this just hardens the corner case.
  //   2. Drain any outbox rows queued during a previous offline
  //      session as soon as auth is ready.
  //   3. Pre-warm all the stores that have offline mirrors so Dexie
  //      populates even if the user never visits the corresponding
  //      tab. Without this, opening a fresh install online and
  //      jumping straight to airplane mode left every tab the user
  //      hadn't yet visited showing empty data.
  useEffect(() => {
    if (!session) return;
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {});
    }
    void drainOutbox();
    refetchAllStores();
  }, [session]);

  // Re-fetch when the device transitions back to online. Dropped the
  // visibilitychange listener that used to fire here too — it was
  // firing during ordinary in-app interactions (wall flip animations,
  // iOS PWA quirks) and racing with other visibility-handlers in the
  // grocery store, occasionally clobbering cached state. The
  // `online` event only fires on a true offline→online transition,
  // which is exactly when we want a refresh.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => {
      if (useAuthStore.getState().session) refetchAllStores();
    };
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return <>{children}</>;
}

// Fire-and-forget refetch of every offline-cached store. Each store's
// fetch path now bails out early when navigator.onLine is false, so
// calling this when offline is a safe no-op.
function refetchAllStores(): void {
  void useTaskStore.getState().fetchAll();
  void useListStore.getState().fetchLists();
  void useGroceryStore.getState().loadActive();
  void useJournalStore.getState().fetchEntries();
  void useNotebookStore.getState().fetchNotebooks();
  void useLettersStore.getState().fetchLetters();
}
