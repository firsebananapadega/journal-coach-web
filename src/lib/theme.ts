import { create } from 'zustand';
import { darkColors, lightColors, type ThemeColors } from './colors';

type ThemeMode = 'dark' | 'light';

interface ThemeState {
  mode: ThemeMode;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  loadTheme: () => void;
}

export const useTheme = create<ThemeState>((set) => ({
  mode: 'dark',
  colors: darkColors,

  setMode: (mode: ThemeMode) => {
    const colors = mode === 'dark' ? darkColors : lightColors;
    set({ mode, colors });
    if (typeof window !== 'undefined') {
      localStorage.setItem('app_theme', mode);
    }
  },

  loadTheme: () => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('app_theme');
    if (stored === 'light' || stored === 'dark') {
      set({
        mode: stored,
        colors: stored === 'dark' ? darkColors : lightColors,
      });
    }
  },
}));
