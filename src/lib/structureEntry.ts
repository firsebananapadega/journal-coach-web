// Sprint 2: Raw → Structured polish pass.
//
// On first view of the "Structured" tab for a journal entry, we call
// Gemini to add paragraph breaks, numbering, and light spelling fixes
// to the raw transcript. Result is cached to `content_structured`
// column so subsequent toggles are instant. Cache invalidates
// automatically in journalStore.updateEntry when `content_text`
// changes.
//
// Strict rules (baked into the prompt):
//   - Do NOT summarize or omit content.
//   - Preserve the author's voice and word choice.
//   - Fix only obvious spelling/punctuation.
//   - Respect user's voice_dictionary — words listed there always
//     land with that exact spelling.

import { callGemini } from './geminiClient';
import { supabase } from './supabase';
import { withTimeout } from './withTimeout';

const STRUCTURE_MODEL = 'gemini-2.5-flash';
const TIMEOUT_MS = 25_000;

function buildPrompt(raw: string, dictionary: string[]): string {
  const dictBlock =
    dictionary.length > 0
      ? `\n\nDICTIONARY (preserve these spellings exactly; correct the transcript to match when it's obviously the same word mis-transcribed):\n${dictionary.map((w) => `- ${w}`).join('\n')}`
      : '';
  return `You are polishing a voice-dictated journal entry for readability.

STRICT RULES:
- Do NOT summarize, condense, or omit ANY content. Every idea in the raw must be present in the output.
- Preserve the author's voice and word choice. This is not a rewrite — it's light formatting.
- Add paragraph breaks where the author shifts topic. Short entries may stay as a single paragraph.
- If the author clearly enumerates ("first… second… third…" or "one thing is… another…"), render as a numbered list. Otherwise keep prose.
- Fix only obvious spelling/punctuation/capitalization from dictation errors. Do not "improve" phrasing.
- Do not add greetings, salutations, or closing lines.
- Plain text output. No markdown headers, no bold, no italics.${dictBlock}

RAW ENTRY:
${raw.trim()}

Respond with only the polished text — no preamble, no quote marks, no "Here's the polished version:"`;
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
}

/**
 * Fetches (or generates + persists) the structured version of an entry.
 * Returns `text` plus a `cached` flag the UI can use to skip the
 * "thinking" spinner when the call was instant.
 */
export async function getStructured(entry: {
  id: string;
  content_text: string | null;
  content_structured: string | null;
}): Promise<StructureResult> {
  if (entry.content_structured && entry.content_structured.trim()) {
    return { text: entry.content_structured, cached: true };
  }
  const raw = (entry.content_text ?? '').trim();
  if (!raw) {
    return { text: '', cached: false };
  }

  const dict = await loadVoiceDictionary();
  const prompt = buildPrompt(raw, dict);
  const text = (await callGemini(STRUCTURE_MODEL, prompt, TIMEOUT_MS)).trim();

  // Persist in the background so the next view is instant. Don't
  // block the UI on this — if the write fails, we just regenerate
  // next time.
  withTimeout(
    supabase
      .from('journal_entries')
      .update({
        content_structured: text,
        structured_generated_at: new Date().toISOString(),
        structured_gemini_model: STRUCTURE_MODEL,
      })
      .eq('id', entry.id),
    15_000,
    'persist-structured',
  ).catch(() => {});

  return { text, cached: false };
}
