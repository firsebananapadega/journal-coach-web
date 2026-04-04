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
  }, [initialize, loadTheme]);

  return <>{children}</>;
}
