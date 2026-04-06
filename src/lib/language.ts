const STORAGE_KEY = 'app_language';
export type AppLanguage = 'en-US' | 'es-MX';
export type Locale = 'en' | 'es';

export function getLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'en-US';
  const stored = localStorage.getItem(STORAGE_KEY) as AppLanguage | null;
  // Migrate old es-ES to es-MX
  if (stored === 'es-ES' as string) {
    localStorage.setItem(STORAGE_KEY, 'es-MX');
    return 'es-MX';
  }
  return stored || 'en-US';
}

export function getLocale(): Locale {
  return getLanguage().startsWith('es') ? 'es' : 'en';
}

export function setLanguage(lang: AppLanguage) {
  localStorage.setItem(STORAGE_KEY, lang);
}

export const LANGUAGES = [
  { code: 'en-US' as const, label: 'English', flag: '🇺🇸' },
  { code: 'es-MX' as const, label: 'Español', flag: '🇲🇽' },
];
