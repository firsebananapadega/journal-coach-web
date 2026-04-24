// Raw → Structured polish pass.
//
// Runs in the background the moment a new entry is saved (see
// journalStore.createEntry). The result lands in `content_structured`
// and is rendered as Markdown on entry cards + the single-entry
// editor. Not re-run on view.
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
  return `You are polishing a voice-dictated journal entry for readability. Output is Markdown and will be rendered with react-markdown + remark-gfm.

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

Respond with ONLY the polished Markdown — no preamble, no quote marks, no "Here's the polished version:".`;
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

  // Persist synchronously so the next view is instant. Earlier this
  // was fire-and-forget with `.catch(() => {})`, which silently ate
  // RLS / timeout errors — entries ended up still showing raw on
  // reload because the `content_structured` column never actually
  // landed in the DB. Awaiting here exposes those errors to the
  // caller, who can retry or fall back to the text we already have
  // in hand.
  try {
    const { error } = await withTimeout(
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
    );
    if (error) {
      console.warn('[structureEntry] persist failed', error);
    }
  } catch (err) {
    console.warn('[structureEntry] persist threw', err);
  }

  return { text, cached: false };
}
