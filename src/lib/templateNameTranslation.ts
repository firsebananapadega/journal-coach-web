// Translates template names for display on home screen and template management
// Uses cached translations from templateTranslation.ts if available,
// otherwise falls back to a batch Gemini call with caching.

import { callGemini, parseJsonResponse } from './geminiClient';
import { getLocale } from './language';

const NAMES_CACHE_KEY = 'tmpl_names_';

interface NameMap {
  [id: string]: { name: string; description: string };
}

function getCached(locale: string): NameMap | null {
  try {
    const raw = localStorage.getItem(NAMES_CACHE_KEY + locale);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function setCache(locale: string, data: NameMap): void {
  try {
    localStorage.setItem(NAMES_CACHE_KEY + locale, JSON.stringify(data));
  } catch {}
}

export function getTranslatedTemplateName(
  templateId: string,
  originalName: string,
  locale?: string
): string {
  const loc = locale || getLocale();
  if (loc === 'en') return originalName;

  // Check individual template cache first (from full template translation)
  try {
    const fullCache = localStorage.getItem(`tmpl_translation_${loc}_${templateId}`);
    if (fullCache) {
      const parsed = JSON.parse(fullCache);
      if (parsed.name) return parsed.name;
    }
  } catch {}

  // Check batch names cache
  const cached = getCached(loc);
  if (cached && cached[templateId]) return cached[templateId].name;

  return originalName;
}

export function getTranslatedTemplateDescription(
  templateId: string,
  originalDesc: string,
  locale?: string
): string {
  const loc = locale || getLocale();
  if (loc === 'en') return originalDesc;

  try {
    const fullCache = localStorage.getItem(`tmpl_translation_${loc}_${templateId}`);
    if (fullCache) {
      const parsed = JSON.parse(fullCache);
      if (parsed.description) return parsed.description;
    }
  } catch {}

  const cached = getCached(loc);
  if (cached && cached[templateId]) return cached[templateId].description;

  return originalDesc;
}

export async function translateTemplateNames(
  templates: { id: string; name: string; description: string }[]
): Promise<void> {
  const locale = getLocale();
  if (locale === 'en' || templates.length === 0) return;

  // Check what we already have cached
  const cached = getCached(locale) || {};
  const untranslated = templates.filter((t) => {
    // Check both caches
    if (cached[t.id]) return false;
    try {
      const fullCache = localStorage.getItem(`tmpl_translation_${locale}_${t.id}`);
      if (fullCache) return false;
    } catch {}
    return true;
  });

  if (untranslated.length === 0) return;

  // Batch translate all untranslated names
  const items = untranslated.map((t) => ({ id: t.id, name: t.name, description: t.description }));

  const prompt = `Translate these journaling template names and descriptions from English to Mexican Spanish (español mexicano).
Use warm, natural language. Never use Spain Spanish.

${JSON.stringify(items, null, 2)}

Return ONLY a JSON array with the same structure:
[{"id": "original_id", "name": "translated name", "description": "translated description"}]

Return ONLY the JSON array, nothing else.`;

  try {
    const text = await callGemini('gemini-2.0-flash', prompt, 15000);
    const parsed = parseJsonResponse<{ id: string; name: string; description: string }[]>(text, []);

    if (Array.isArray(parsed) && parsed.length > 0) {
      const updated = { ...cached };
      for (const item of parsed) {
        if (item.id && item.name) {
          updated[item.id] = { name: item.name, description: item.description || '' };
        }
      }
      setCache(locale, updated);
    }
  } catch {
    // Silent fail — English names will be shown
  }
}
