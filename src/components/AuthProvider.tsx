'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/lib/theme';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);
  const loadTheme = useTheme((s) => s.loadTheme);

  useEffect(() => {
    initialize();
    loadTheme();
    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, [initialize, loadTheme]);

  return <>{children}</>;
}
