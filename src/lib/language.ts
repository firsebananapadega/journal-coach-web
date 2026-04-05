const STORAGE_KEY = 'app_language';
export type AppLanguage = 'en-US' | 'es-ES';

export function getLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'en-US';
  return (localStorage.getItem(STORAGE_KEY) as AppLanguage) || 'en-US';
}

export function setLanguage(lang: AppLanguage) {
  localStorage.setItem(STORAGE_KEY, lang);
}

export const LANGUAGES = [
  { code: 'en-US' as const, label: 'English', flag: '\uD83C\uDDFA\uD83C\uDDF8' },
  { code: 'es-ES' as const, label: 'Espa\u00f1ol', flag: '\uD83C\uDDEA\uD83C\uDDF8' },
];
