import { create } from 'zustand';
import { darkColors, lightColors, type ThemeColors } from './colors';

type ThemeMode = 'dark' | 'light';

const MODE_KEY = 'app_theme';
const GUIDE_THEME_KEY = 'guide_theme_enabled';

interface ThemeState {
  mode: ThemeMode;
  colors: ThemeColors;
  guideTheme: boolean;
  setMode: (mode: ThemeMode) => void;
  setGuideTheme: (enabled: boolean) => void;
  loadTheme: () => void;
}

function applyMode(mode: ThemeMode) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', mode);
  }
}

// Guide-theme attribute is applied/removed from the document root in
// a separate effect in the (app) layout, since it depends on both the
// toggle and the live profile.preferred_guide. This store owns the
// toggle state; the sync effect lives where profile is available.

export const useTheme = create<ThemeState>((set) => ({
  mode: 'dark',
  colors: darkColors,
  guideTheme: false,

  setMode: (mode: ThemeMode) => {
    const colors = mode === 'dark' ? darkColors : lightColors;
    set({ mode, colors });
    applyMode(mode);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MODE_KEY, mode);
    }
  },

  setGuideTheme: (enabled: boolean) => {
    set({ guideTheme: enabled });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(GUIDE_THEME_KEY, enabled ? '1' : '0');
      if (!enabled) {
        // Remove any guide-theme attribute immediately so the
        // default warm-gold palette returns on the next paint.
        document.documentElement.removeAttribute('data-guide-theme');
      }
    }
  },

  loadTheme: () => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(MODE_KEY);
    if (stored === 'light' || stored === 'dark') {
      set({
        mode: stored,
        colors: stored === 'dark' ? darkColors : lightColors,
      });
      applyMode(stored);
    } else {
      applyMode('dark');
    }

    const gt = window.localStorage.getItem(GUIDE_THEME_KEY) === '1';
    set({ guideTheme: gt });
  },
}));
