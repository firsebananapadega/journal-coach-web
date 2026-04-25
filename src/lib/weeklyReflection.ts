// Weekly letter from the guide.
//
// Two call paths share this file:
//   * CLIENT — `generateWeeklyReflection(...)` is the legacy client-side
//     generator. It hits `/api/gemini` (user-auth'd) and caches the
//     result in localStorage. Kept so the on-demand /patterns path
//     still works for users whose device predates push delivery.
//   * SERVER — `buildWeeklyLetter({ entries, userName, guideName,
//     locale, callGemini })` is a pure function that takes a caller-
//     supplied Gemini invoker. The weekly cron route at
//     /api/cron/generate-weekly-letters passes `callGeminiServer` so
//     the letter can be generated without an end-user JWT.
//
// The canonical storage location is the `weekly_letters` table — see
// supabase/migrations/20260428_weekly_letters.sql. localStorage is now
// a soft cache for the client path; DB is the source of truth.

import { callGemini } from '@/lib/geminiClient';
import { getLanguage, getLocale } from '@/lib/language';

export interface WeeklyReflectionData {
  weekKey: string;
  letter: string;
  themes: string[];
  generatedAt: string;
}

/** Returns ISO week string like "2026-W14" */
export function getWeekKey(date?: Date): string {
  const d = date ? new Date(date) : new Date();
  d.setHours(0, 0, 0, 0);
  // ISO week: Thursday determines the week
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

interface EntryInput {
  created_at: string;
  mood_label?: string | null;
  entry_type: string;
  content_text?: string | null;
}

/**
 * Generic caller signature compatible with both `callGemini`
 * (client, user-auth'd via /api/gemini) and `callGeminiServer`
 * (server, API-key'd via REST).
 */
export type GeminiInvoker = (model: string, prompt: string) => Promise<string>;

export interface BuildWeeklyLetterInput {
  entries: EntryInput[];
  userName: string;
  guideName: string;
  /** 'en' | 'es' — Spanish triggers Mexican Spanish post-pass. */
  locale?: string;
  /** Override when running server-side; defaults to the client caller. */
  callGemini?: GeminiInvoker;
  /** Optional — pin the week_key (cron passes the exact key it's generating for). */
  weekKey?: string;
  /** Dateformat locale for entry date stamps inside the prompt. */
  dateLocale?: string;
  /**
   * Optional pre-formatted block of behavioral signals (habit
   * completion %, pulse averages, intention practice counts, task
   * completion %, notebook distribution). Pasted verbatim into the
   * prompt to ground the letter in actual behavior, not just text.
   * Server cron path generates this via gatherWeeklySignals +
   * formatSignalsForPrompt; client path leaves it undefined.
   */
  signalsBlock?: string;
}

// Switched from 2.0 → 2.5 on 2026-04-24 after the 2.0 free-tier key
// hit quota. 2.5-flash is what pulseAnalysis.ts already uses.
const DEFAULT_MODEL = 'gemini-2.5-flash';

function buildPrompt(
  entries: EntryInput[],
  userName: string,
  guideName: string,
  dateLocale: string,
  signalsBlock: string,
): { letterPrompt: string; themesPrompt: string } {
  const summaries = entries.map((e) => {
    const date = new Date(e.created_at).toLocaleDateString(dateLocale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const mood = e.mood_label || 'unspecified';
    const snippet = (e.content_text || '').substring(0, 500);
    return `- ${date} | mood: ${mood} | type: ${e.entry_type}\n  "${snippet}"`;
  });

  const summaryBlock = summaries.join('\n\n');
  const langHint = dateLocale === 'es-MX' || dateLocale === 'es'
    ? '\n- Write the entire letter in Mexican Spanish (español mexicano). Use "tú" form. Never use Spain Spanish vocabulary.'
    : '';
  const themesLang = dateLocale === 'es-MX' || dateLocale === 'es'
    ? ' Return the themes in Mexican Spanish.'
    : '';

  const letterPrompt = `You are ${guideName}, a warm and encouraging journaling guide. Write a personal weekly reflection letter to ${userName || 'your journaler'}.

Here are their journal entries from the past week:
${summaryBlock}${signalsBlock}

Instructions:
- Write a warm, personal letter identifying patterns and growth you notice
- Where the behavioral signals above support a specific observation, ground the letter in that data (e.g. "you ran 4 days this week" rather than "you've been moving more")
- Use cognitive/causal language ("because", "I notice", "the reason") more than pure emotion words — Pennebaker's research shows readers benefit from the why, not just the what
- Sign the letter as ${guideName}
- End with one reflective question
- Keep under 200 words
- Do NOT use markdown formatting, just plain text with line breaks${langHint}`;

  const themesPrompt = `Extract 3-5 key themes (single words or short phrases) from these journal entries. Return ONLY a JSON array of strings, nothing else.${themesLang}

Entries:
${summaryBlock}`;

  return { letterPrompt, themesPrompt };
}

function parseThemes(text: string): string[] {
  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    const arr = JSON.parse(cleaned);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  } catch {
    return [];
  }
}

/**
 * Pure letter generator — no side effects. Safe to call from the
 * server cron (passing `callGeminiServer`) or from the client path
 * (passing the default `callGemini` that goes through /api/gemini).
 */
export async function buildWeeklyLetter(
  input: BuildWeeklyLetterInput,
): Promise<WeeklyReflectionData> {
  const {
    entries,
    userName,
    guideName,
    locale = 'en',
    weekKey = getWeekKey(),
  } = input;
  if (entries.length < 3) {
    throw new Error('Need at least 3 entries to generate a weekly reflection');
  }

  const invoker = input.callGemini ?? callGemini;
  const dateLocale = input.dateLocale ?? (locale === 'es' ? 'es-MX' : 'en-US');
  const { letterPrompt, themesPrompt } = buildPrompt(
    entries,
    userName,
    guideName,
    dateLocale,
    input.signalsBlock ?? '',
  );

  const [letterText, themesText] = await Promise.all([
    invoker(DEFAULT_MODEL, letterPrompt),
    invoker(DEFAULT_MODEL, themesPrompt),
  ]);

  return {
    weekKey,
    letter: letterText,
    themes: parseThemes(themesText),
    generatedAt: new Date().toISOString(),
  };
}

/** Model name used by `buildWeeklyLetter`. Exposed so the cron can
 *  record it in `weekly_letters.model`. */
export const WEEKLY_LETTER_MODEL = DEFAULT_MODEL;

/**
 * Legacy client-side generator. Kept for the on-demand /patterns path
 * so long-standing users don't lose their in-browser letters while
 * the server cron rolls out. Writes to localStorage. Prefer the DB
 * source when it exists.
 */
export async function generateWeeklyReflection(
  entries: EntryInput[],
  userName: string,
  guideName: string,
): Promise<WeeklyReflectionData> {
  const reflection = await buildWeeklyLetter({
    entries,
    userName,
    guideName,
    locale: getLocale(),
    dateLocale: getLanguage(),
  });

  if (typeof window !== 'undefined') {
    localStorage.setItem(
      `weekly_reflection_${reflection.weekKey}`,
      JSON.stringify(reflection),
    );
  }

  return reflection;
}

export function getCachedReflection(): WeeklyReflectionData | null {
  if (typeof window === 'undefined') return null;
  const weekKey = getWeekKey();
  const cached = localStorage.getItem(`weekly_reflection_${weekKey}`);
  if (!cached) return null;
  try {
    return JSON.parse(cached) as WeeklyReflectionData;
  } catch {
    return null;
  }
}
