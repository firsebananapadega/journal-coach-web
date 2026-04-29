// Rotating morning Pulse prompt pool.
//
// One question per day, picked deterministically from a YYYY-MM-DD hash
// so every device + every shared user sees the same question on the
// same day (easier to talk about with your partner, easier to reason
// about). The first entry is the historical single question we used
// before rotation existed; preserved so users who liked it keep seeing
// it once every ~12 days. Translation keys are the source of truth for
// the actual EN/ES text — see src/lib/translations.ts.
//
// To extend the pool: add a new translation key (e.g. pulse.morning.q13)
// in translations.ts and append it to MORNING_PROMPT_KEYS below.

import { t } from './translations';
import { toLocalDateStr } from './dateUtils';

export const MORNING_PROMPT_KEYS: string[] = [
  'pulse.morning.q1',
  'pulse.morning.q2',
  'pulse.morning.q3',
  'pulse.morning.q4',
  'pulse.morning.q5',
  'pulse.morning.q6',
  'pulse.morning.q7',
  'pulse.morning.q8',
  'pulse.morning.q9',
  'pulse.morning.q10',
  'pulse.morning.q11',
  'pulse.morning.q12',
];

// FNV-1a-ish 32-bit hash. Tiny and dependency-free; we only need a
// well-distributed integer, not crypto-strength. Date-string input means
// hash collisions across days that map to the same pool index are fine
// (just means two distant days share a question, which is the desired
// behavior anyway).
function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function getMorningPromptKey(date: Date = new Date()): string {
  const day = toLocalDateStr(date);
  const idx = hashString(day) % MORNING_PROMPT_KEYS.length;
  return MORNING_PROMPT_KEYS[idx]!;
}

/** Localized morning prompt text for a given date. Uses the active
 *  language (read inside `t()`) — callers don't need to pass a locale. */
export function getMorningPrompt(date: Date = new Date()): string {
  return t(getMorningPromptKey(date));
}
