// Morning-intention → discrete items parser.
//
// The morning pulse stores the user's raw spoken/typed intention as a
// single string in metadata.intention. Voice transcripts often contain
// fillers ("um", "today I want to") and compound multi-intent phrases
// ("finish the proposal and call mom and exercise"). When the evening
// pulse asks "how did your morning intention go?" the user wants to
// see and evaluate each distinct intention separately, not re-read the
// raw transcript.
//
// This module produces a clean array of imperative phrases. Result is
// cached on the morning pulse's metadata.intention_items so we only
// parse once per pulse (Gemini call is ~3s and we don't want to spend
// it every time the evening card mounts).

import { callGemini, parseJsonResponse } from './geminiClient';

const MODEL = 'gemini-2.5-flash';

const FILLER_PHRASES: ReadonlyArray<RegExp> = [
  /^(um+|uh+|er+|ahh*|hmm+),?\s+/i,
  /^(okay|ok|so|like|well|right|alright)[,\s]+/i,
  /^(today|this morning|right now|currently)[,\s]+/i,
  /^(i\s+(want|need|plan|hope|am going|'m going|am gonna|'m gonna|'d like|would like|will|'ll)\s+to)\s+/i,
  /^(my\s+intention\s+is\s+to)\s+/i,
];

function stripLeadingFillers(s: string): string {
  let out = s.trim();
  // Apply each pattern up to a couple of times to peel chained fillers.
  for (let i = 0; i < 3; i++) {
    let changed = false;
    for (const rx of FILLER_PHRASES) {
      const next = out.replace(rx, '');
      if (next !== out) {
        out = next.trim();
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}

/** Lightweight regex-based fallback used when Gemini is unavailable
 *  or rate-limited. Splits on common conjunctions / punctuation, then
 *  strips fillers. Good enough that the user is never stuck with a
 *  wall of voice transcript. */
function regexFallback(raw: string): string[] {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  // Split on sentence-ish boundaries and common spoken connectors.
  // Keep `also` and `then` as connectors but remove them from the
  // resulting phrase.
  const pieces = cleaned
    .split(/(?:[.!?;]+|,\s+(?=and|then|also)|,\s+(?:and|then|also)\s+|\s+(?:and|then|also)\s+|\bthen\s+)/i)
    .map((p) => stripLeadingFillers(p))
    .filter((p) => p.length > 0);

  // Fold any sub-3-word fragments back into the previous item — those
  // are usually conjunction crumbs ("and exercise"). Capitalize first
  // letter for a cleaner UI.
  const out: string[] = [];
  for (const p of pieces) {
    const wc = p.split(/\s+/).length;
    if (wc < 3 && out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1]} ${p}`.trim();
    } else {
      out.push(p);
    }
  }
  return out
    .map((s) => s.replace(/^(\w)/, (m) => m.toUpperCase()))
    .filter((s) => s.length > 0);
}

const PROMPT_TEMPLATE = `Parse this morning intention into a clean, concise JSON array of distinct things the user said they would do today.

Rules:
- Each array element is one short imperative phrase (e.g. "Finish the proposal", NOT "I want to finish the proposal today um okay").
- Strip filler words: "um", "uh", "okay so", "today I want to", "I'm going to", "I'd like to", "right now", etc.
- Preserve every distinct intention. Do NOT merge two separate goals into one. Do NOT drop any goal because it sounds minor.
- If the raw text contains only one intention, return an array with one item.
- Do NOT add commentary, explanation, or wrapping prose. Return ONLY the JSON array.
- Each phrase should start with a capital letter.

Raw morning intention:
"""
__RAW__
"""

JSON array:`;

/**
 * Parse the user's raw morning intention into a tidy array of items.
 * Tries Gemini first; falls back to a regex splitter on any failure
 * so the evening recall UI is never blocked by an API outage.
 */
export async function parseIntentionToItems(raw: string): Promise<string[]> {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return [];

  try {
    const prompt = PROMPT_TEMPLATE.replace('__RAW__', trimmed.slice(0, 4000));
    const text = await callGemini(MODEL, prompt);
    const arr = parseJsonResponse<string[]>(text, []);
    if (Array.isArray(arr)) {
      const cleaned = arr
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (cleaned.length > 0) return cleaned;
    }
  } catch (err) {
    console.warn('[intentionParser] Gemini failed; falling back to regex split', err);
  }

  // Either Gemini failed or returned an empty/invalid response. Use
  // the regex fallback so the user still gets a structured view.
  const fallback = regexFallback(trimmed);
  return fallback.length > 0 ? fallback : [trimmed];
}
