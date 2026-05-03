// Raw → Structured polish pass.
//
// Runs in the background the moment a new entry is saved (see
// journalStore.createEntry). The result lands in `content_structured`
// and is rendered as Markdown on entry cards + the single-entry
// editor.
//
// Edit-the-structured architecture (April 2026):
//   - `content_text` (raw) is FROZEN after creation. The original
//     transcript / draft, kept as a historical record.
//   - `content_structured` (Markdown) is the user's editable working
//     copy. Generated once on create, then ONLY overwritten when the
//     user explicitly hits "Re-polish from raw" (which calls this
//     with `force: true`). Editing an entry through the detail page
//     writes to content_structured directly via journalStore.updateEntry.
//   - This file's job: produce a high-quality first polish, retry
//     transient failures, and never silently corrupt a user-saved
//     structured edit (compare-and-set in the SQL update).
//
// Output is Markdown — bullets, numbered lists, **bold**, *italic*,
// `---` separators, paragraph breaks. The renderer uses react-markdown
// + remark-gfm, so GFM-flavored syntax (task lists, strikethrough) is
// supported too.
//
// Strict rules (baked into the prompt):
//   - Do NOT summarize or omit content.
//   - Preserve the author's voice and word choice.
//   - Fix only obvious spelling/punctuation.
//   - Respect user's voice_dictionary.

import { callGemini, RateLimitError } from './geminiClient';
import { supabase } from './supabase';
import { withTimeout } from './withTimeout';
import { wasTruncated, stripTruncationSentinel } from './geminiTruncation';

const STRUCTURE_MODEL = 'gemini-2.5-flash';
const TIMEOUT_MS = 25_000;
const RETRY_DELAY_MS = 1_000;

function buildPrompt(
  raw: string,
  dictionary: string[],
  language: 'en-US' | 'es-MX',
): string {
  const dictBlock =
    dictionary.length > 0
      ? `\n\nDICTIONARY (preserve these spellings exactly; correct the transcript to match when it's obviously the same word mis-transcribed):\n${dictionary.map((w) => `- ${w}`).join('\n')}`
      : '';
  // Locale instruction is a HARD rule — Gemini has otherwise been
  // observed to translate Spanish entries into English when the rest
  // of the prompt is English-only. Both the polished Markdown AND the
  // [GRATITUDE] excerpts must stay in the user's input language.
  const isSpanish = language === 'es-MX';
  const localeBlock = isSpanish
    ? `\n\nLANGUAGE (HARD RULE): The user writes in Spanish (es-MX). The polished Markdown AND the [GRATITUDE] excerpts MUST be returned in Spanish, verbatim from the author's wording. Do NOT translate to English under any circumstance. Do NOT add English glosses.`
    : `\n\nLANGUAGE (HARD RULE): The user writes in English (en-US). Keep the polished Markdown AND the [GRATITUDE] excerpts in English, in the author's voice.`;
  // Locale-aware gratitude anchors so the detector has Spanish phrases
  // to match against when the entry is in Spanish.
  const gratitudeAnchors = isSpanish
    ? `Sincere expressions to INCLUDE (Spanish, in the author's words):
- "estoy agradecido…" / "estoy agradecida…"
- "qué afortunado…" / "qué afortunada…"
- "qué bonito que…"
- "me alegra mucho que…"
- "me da gusto…"
- "me siento bendecido/a por…"`
    : `Sincere expressions to INCLUDE:
- "I'm thankful…" / "I'm grateful…" / "I'm so glad…" / "I'm happy that…"
- "I'm really glad the trip came together"
- "thankful about my wife today"`;
  return `You are polishing a voice-dictated journal entry for readability. Output is Markdown (followed by a single gratitude-detection footer — see the end of this prompt). Polished output will be rendered with react-markdown + remark-gfm.${localeBlock}

CONTENT RULES (non-negotiable):
- Do NOT summarize, condense, or omit ANY content. Every idea in the raw must appear in the output.
- Preserve the author's voice and word choice. This is light formatting, not a rewrite.
- Fix only obvious spelling / punctuation / capitalization errors from dictation. Do NOT "improve" phrasing.
- Do not add greetings, salutations, sign-offs, or meta commentary ("Here's a polished version...").
- Do not add headings (no \`#\`, \`##\`, etc). Structure comes from paragraphs and lists, not section titles.

FORMATTING RULES (Markdown):
- Paragraph break (blank line) on every clear topic shift. Short entries may remain a single paragraph.
- When the author enumerates ("first… second… third…", "one thing is… another…", step-by-step), render as a numbered list using \`1.\`, \`2.\`, \`3.\`. Indent sub-points with two spaces.
- When the author rattles off unordered items (a to-do-style list, a list of people, a jot list), render as a bullet list using \`- \`.
- Use \`**bold**\` sparingly — at most one phrase per paragraph, only to mark the single most important moment ("I realized **I haven't been honest about this**"). Never bold a whole sentence.
- Use \`*italic*\` for quoted self-talk, the user's own reported speech, or titles of books/songs the author mentions ("she said *I'm done*"). Do not italicize for generic emphasis.
- Use \`---\` on its own line as a separator between clearly distinct topics that each span 2+ paragraphs. Don't use it for every paragraph break.
- Prefer ordinary prose when in doubt. Lists and bolding should feel earned, not decorative.

EXAMPLES (illustrative only — do not copy phrasing):
Raw: "today was rough i had three things to get through first the dentist then a call with mom then groceries"
Polished:
Today was rough. I had three things to get through:

1. The dentist
2. A call with mom
3. Groceries

Raw: "i keep thinking about what dad said i just cant shake it"
Polished:
I keep thinking about what Dad said. *I just can't shake it.*${dictBlock}

RAW ENTRY:
${raw.trim()}

OUTPUT FORMAT (CRITICAL — both parts required, in this order):

1. The polished Markdown — no preamble, no quote marks, no "Here's the polished version:".
2. THEN, on its own line at the very end, this footer exactly:
   [GRATITUDE]: <JSON array>

The JSON array contains 0–2 sincere first-person gratitude expressions from the AUTHOR. Sincere means: the AUTHOR is genuinely thankful FOR something in their own life.

${gratitudeAnchors}

EXCLUDE:
- Sarcasm ("oh great, more traffic", "yeah I'm so thankful for that")
- Third-person ("she said she was grateful")
- Hypotheticals ("I'd be grateful if…")
- Thanks TO someone ("thanks, mom") — gratitude FOR something only

Each excerpt = a clause from the original, ≤120 chars. Quote close to the author's wording. Return [] when truly nothing applies.

The [GRATITUDE]: line is REQUIRED on EVERY response — even when the array is empty. Do not omit it. Do not wrap the array in code fences. Do not add commentary after the array.

Correct footer examples:
[GRATITUDE]: ["I'm really glad the trip came together"]
[GRATITUDE]: ["I'm thankful about my wife today", "grateful I was able to plan a trip with my wife"]
[GRATITUDE]: []`;
}

export async function loadVoiceDictionary(): Promise<string[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from('profiles')
      .select('voice_dictionary')
      .eq('id', user.id)
      .maybeSingle();
    if (error) return [];
    const arr = (data as { voice_dictionary?: string[] } | null)?.voice_dictionary;
    return Array.isArray(arr) ? arr.filter((w) => typeof w === 'string' && w.trim()) : [];
  } catch {
    return [];
  }
}

export interface StructureResult {
  text: string;
  cached: boolean;
  /** Sincere first-person gratitude expressions extracted from the
   *  raw entry (≤2). Empty when none found, or when the response was
   *  served from cache. The journal pages use this to surface a
   *  "save to Gratitude?" suggestion sheet at save time. */
  gratitudeExcerpts?: string[];
}

/** Parse the [GRATITUDE]: footer out of the Gemini response.
 *  Returns the polished Markdown (footer stripped) plus the parsed
 *  excerpt array. Robust to:
 *    - Marker at start, end, or anywhere (uses LAST occurrence)
 *    - Multi-line array (pretty-printed JSON)
 *    - Trailing whitespace / newlines after the array
 *    - Strings containing brackets or escaped quotes
 *    - Nested arrays
 *  Falls back to no excerpts on parse failure so a malformed footer
 *  can't lose the polished text. */
function extractGratitude(rawResponse: string): { polished: string; excerpts: string[] } {
  const marker = '[GRATITUDE]:';
  const markerIdx = rawResponse.lastIndexOf(marker);
  if (markerIdx < 0) {
    return { polished: rawResponse, excerpts: [] };
  }
  // Walk forward from the marker to find the start of the array.
  const after = rawResponse.slice(markerIdx + marker.length);
  const arrayStart = after.indexOf('[');
  if (arrayStart < 0) {
    return { polished: rawResponse, excerpts: [] };
  }
  // Bracket-balance scan, respecting JSON string semantics so a `]`
  // inside a quoted string doesn't close the array prematurely.
  let depth = 0;
  let inString = false;
  let escape = false;
  let endIdx = -1;
  for (let i = arrayStart; i < after.length; i++) {
    const ch = after[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx < 0) {
    console.warn('[structureEntry] gratitude marker found but array unbalanced', {
      preview: after.slice(arrayStart, arrayStart + 200),
    });
    return { polished: rawResponse.slice(0, markerIdx).trimEnd(), excerpts: [] };
  }
  const arrStr = after.slice(arrayStart, endIdx + 1);
  let excerpts: string[] = [];
  try {
    const parsed = JSON.parse(arrStr);
    if (Array.isArray(parsed)) {
      excerpts = parsed
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim())
        .filter((x) => x.length > 0)
        .slice(0, 2);
    }
  } catch (err) {
    console.warn('[structureEntry] failed to parse gratitude array', {
      arrStr,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  // Strip everything from the marker onward — that's the footer.
  const polished = rawResponse.slice(0, markerIdx).trimEnd();
  return { polished, excerpts };
}

export interface GetStructuredOptions {
  /** When true, ignore an existing `content_structured` value and
   *  regenerate from the raw. Used by the "Re-polish from raw" button
   *  in entry detail. */
  force?: boolean;
  /** When true, the persist step uses a compare-and-set guard
   *  (`.is('content_structured', null)`) so a slow background call
   *  can't overwrite a structured edit the user already saved. The
   *  create-time background call sets this to true. Manual / Re-polish
   *  paths leave it false (they want their write to land). */
  guardAgainstUserEdits?: boolean;
  /** User's preferred language. Threaded into the Gemini prompt so
   *  the polished Markdown + the gratitude excerpts come back in that
   *  language. Without this, the English-only prompt was causing
   *  Gemini to translate Spanish entries to English. Defaults to
   *  en-US when omitted. */
  language?: 'en-US' | 'es-MX';
}

/**
 * Sleep helper for the retry pause.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Decide whether an error is worth retrying. Auth + rate-limit are
 * not (a retry will just hit the same wall); network / timeout /
 * unknown errors are.
 */
function isTransientError(err: unknown): boolean {
  if (err instanceof RateLimitError) return false;
  const msg = err instanceof Error ? err.message : String(err);
  if (/not signed in/i.test(msg)) return false;
  if (/4\d\d/.test(msg) && !/429/.test(msg)) return false;
  return true;
}

/**
 * Fetches (or generates + persists) the structured version of an entry.
 * Returns `text` plus a `cached` flag the UI can use to skip the
 * "thinking" spinner when the call was instant.
 */
export async function getStructured(
  entry: {
    id: string;
    content_text: string | null;
    content_structured: string | null;
  },
  options: GetStructuredOptions = {},
): Promise<StructureResult> {
  // Cached short-circuit — unless caller forces a regenerate.
  if (!options.force && entry.content_structured && entry.content_structured.trim()) {
    return { text: entry.content_structured, cached: true };
  }
  const raw = (entry.content_text ?? '').trim();
  if (!raw) {
    return { text: '', cached: false };
  }

  const dict = await loadVoiceDictionary();
  const prompt = buildPrompt(raw, dict, options.language ?? 'en-US');

  // Generation with retry. Up to 2 attempts on transient errors. On
  // truncation (Gemini hit maxOutputTokens) we also retry once — the
  // model sometimes produces a complete response on a fresh attempt
  // even when an earlier one clipped.
  let rawResponse = '';
  let lastTransientErr: unknown = null;
  let truncationRetried = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      rawResponse = (await callGemini(STRUCTURE_MODEL, prompt, TIMEOUT_MS)).trim();
      // If truncated AND we haven't already used our retry slot for
      // truncation, try once more before settling.
      if (wasTruncated(rawResponse) && !truncationRetried && attempt === 0) {
        truncationRetried = true;
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      lastTransientErr = null;
      break;
    } catch (err) {
      lastTransientErr = err;
      if (!isTransientError(err) || attempt >= 1) {
        // Non-retryable, or out of retries.
        break;
      }
      console.warn('[structureEntry] transient error, retrying', err);
      await sleep(RETRY_DELAY_MS);
    }
  }

  if (lastTransientErr) {
    console.warn('[structureEntry] failed after retries', lastTransientErr);
    // Fall back to raw — caller still gets something to render. The
    // feed backfill will retry on a future fetch.
    return { text: raw, cached: false };
  }

  // Detect MAX_TOKENS truncation. The server appends a sentinel to
  // any response that hit the output cap. If the polish came back
  // clipped AND it's materially shorter than the raw entry, refuse
  // to persist — overwriting a complete raw with a truncated
  // structured would erase content the user wrote.
  const truncated = wasTruncated(rawResponse);
  const stripped = stripTruncationSentinel(rawResponse);
  // Pull the [GRATITUDE]: footer out — leaves clean Markdown for the
  // structured field plus an array of gratitude excerpts that the
  // journal pages turn into a "save to Gratitude?" suggestion sheet.
  const { polished: text, excerpts: gratitudeExcerpts } = extractGratitude(stripped);
  if (truncated) {
    const rawWords = raw.split(/\s+/).filter(Boolean).length;
    const polishedWords = text.split(/\s+/).filter(Boolean).length;
    const ratio = rawWords === 0 ? 1 : polishedWords / rawWords;
    console.warn('[structureEntry] truncated response after retry', {
      entryId: entry.id,
      rawWords,
      polishedWords,
      ratio: Math.round(ratio * 100) / 100,
    });
    if (ratio < 0.8) {
      // Materially clipped even on retry — abandon the polish. Caller
      // gets raw back; a future call (with hopefully more headroom)
      // can produce a complete polish.
      return { text: raw, cached: false };
    }
    // Mild truncation only — still persist the polish (better than
    // raw, even if the very last sentence got clipped).
  }

  // Persist. Compare-and-set guard for the create-time background
  // call: if the user has already manually edited `content_structured`
  // by the time this background call resolves (rare race), we don't
  // overwrite their edit. The Re-polish path leaves the guard off so
  // it can intentionally replace whatever's there.
  try {
    let query = supabase
      .from('journal_entries')
      .update({
        content_structured: text,
        structured_generated_at: new Date().toISOString(),
        structured_gemini_model: STRUCTURE_MODEL,
      })
      .eq('id', entry.id);
    if (options.guardAgainstUserEdits) {
      query = query.is('content_structured', null);
    }
    const { error } = await withTimeout(query, 15_000, 'persist-structured');
    if (error) {
      console.warn('[structureEntry] persist failed', error);
    }
  } catch (err) {
    console.warn('[structureEntry] persist threw', err);
  }

  return { text, cached: false, gratitudeExcerpts };
}
