// Phase 5C — quarterly narrative-arc letter.
//
// McAdams' research on narrative identity (Sage, 2013) ties
// psychological well-being to "redemption sequences" — the
// narrative arcs the person tells about their own life that
// transition from a low to a high. People who construct redemptive
// narratives report more well-being than those whose stories stay
// in the negative or stay flat.
//
// The quarterly letter prompt asks Gemini to:
//   1. Identify 1-3 redemptive arcs (turning points where something
//      hard became something the person grew through).
//   2. Write a 600-800 word letter in the guide's voice that
//      surfaces those arcs back to the user — without being
//      saccharine or pasting a hero's-journey structure on top of
//      a ordinary week.
//   3. Cite specific entries (by id) that give rise to each arc so
//      the UI can later show "the entries this letter is built
//      from."
//
// Output: { letter, themes, arcEntryIds }.

export interface QuarterlyLetterData {
  quarterKey: string;       // "2026-Q2"
  letter: string;           // 600-800 words, plain text, paragraph breaks
  themes: string[];         // 3-5 short labels for the chip row
  arcEntryIds: string[];    // entry ids the model cited as turning points
  generatedAt: string;
}

/** Quarter-key from a date — "2026-Q2" style. Uses calendar quarters
 *  for the display label; per-user 85-day gate handles real cadence. */
export function getQuarterKey(date?: Date): string {
  const d = date ? new Date(date) : new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}

interface EntryInput {
  id: string;
  created_at: string;
  mood_label?: string | null;
  entry_type: string;
  content_text?: string | null;
}

export interface InvokerOptions {
  responseMimeType?: 'application/json' | 'text/plain';
  responseSchema?: Record<string, unknown>;
}

export type GeminiInvoker = (
  model: string,
  prompt: string,
  opts?: InvokerOptions,
) => Promise<string>;

// JSON schema constraint for Gemini response — guarantees JSON.parse-
// clean output and removes the raw-control-char failure mode that
// silently dumped 5KB of unparsed JSON into letter_text.
const QUARTERLY_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    themes: { type: 'array', items: { type: 'string' } },
    arc_entry_ids: { type: 'array', items: { type: 'string' } },
    letter: { type: 'string' },
  },
  required: ['themes', 'arc_entry_ids', 'letter'],
};

const MIN_LETTER_CHARS = 1500; // 600-800 words ≈ 3000+ chars; 1500 is the floor

export interface BuildQuarterlyLetterInput {
  entries: EntryInput[];
  userName: string;
  guideName: string;
  /** Optional pre-formatted signal block (90-day version of the
   *  weekly signals — habit %, pulse averages, intention follow-
   *  through, task completion, notebook spread). Pasted into the
   *  prompt for grounding. */
  signalsBlock?: string;
  callGemini: GeminiInvoker;
  quarterKey?: string;
  /** Optional: the past quarterly letter so the new one can reference
   *  what was written then ("you wrote ___ three months ago — here's
   *  what shifted"). Caller passes empty string for first-ever
   *  quarterly. */
  priorLetterText?: string;
}

export const QUARTERLY_LETTER_MODEL = 'gemini-2.5-flash';

function buildPrompt(input: BuildQuarterlyLetterInput): string {
  const summaries = input.entries.map((e) => {
    const date = new Date(e.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const mood = e.mood_label || 'unspecified';
    const snippet = (e.content_text || '').slice(0, 350);
    return `- id="${e.id}" date=${date} mood=${mood}\n  ${snippet}`;
  });

  const priorBlock = input.priorLetterText
    ? `\n\nPrior quarterly letter (you wrote this last time — DON'T repeat it; reference it sparingly only if there's an arc that connects):\n"""\n${input.priorLetterText.slice(0, 1500)}\n"""`
    : '';

  return `You are ${input.guideName}, a warm and observant journaling guide writing a QUARTERLY narrative-arc letter to ${input.userName || 'your journaler'}.

This is the longest letter you write — about 90 days of reflection condensed into one piece. The user has been reading shorter weekly + monthly notes from you all along; this is the long-arc one.

Your output is a JSON object with this exact shape:

{
  "themes": ["3-5 short labels for the chip row, ≤4 words each"],
  "arc_entry_ids": ["id1", "id2", ...],
  "letter": "600-800 words of plain text, paragraph breaks via \\n\\n. NO markdown, NO headers, NO bullets."
}

CONTENT RULES (non-negotiable):
- Identify 1-3 REDEMPTION ARCS — moments that started hard and grew into something. McAdams' research connects redemptive narratives to higher well-being. Don't manufacture arcs that aren't there; if the quarter was relatively flat, write about steady ground instead.
- Cite specific entries by id when an arc references them. arc_entry_ids should list the 3-8 most pivotal entries.
- Write 600-800 words. Long enough to feel like a real letter, short enough that the user actually reads it.
- Use the user's name once near the opening and once near the close, not in every paragraph.
- Use cognitive/causal language ("you've been making sense of X by…") more than emotion words. Pennebaker's mechanism — narrative coherence is built through "because", "I notice", "the reason."
- Do NOT use markdown formatting in the letter — no **bold**, no *italics*, no headers, no bullet points. Plain prose with \\n\\n paragraph breaks.
- Do NOT moralize. Do NOT prescribe. Reflect, name, ask one closing question.
- Sign with your first name on the final line.

Behavioral signals over the past 90 days (use to ground specific observations — don't list mechanically):
${input.signalsBlock || '(none)'}

${priorBlock}

Journal entries (last 90 days, oldest first):
${summaries.join('\n\n')}

Respond with ONLY the JSON object — no preamble, no code fences.`;
}

interface RawResponse {
  themes?: unknown;
  arc_entry_ids?: unknown;
  letter?: unknown;
}

function parseResponse(text: string, validIds: Set<string>): {
  themes: string[];
  arcEntryIds: string[];
  letter: string;
} {
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  // With responseMimeType='application/json' set on the Gemini call,
  // this should always succeed. If it doesn't, the caller catches and
  // marks the user as generate-failed — far better than silently
  // storing 5KB of raw JSON in letter_text.
  const raw = JSON.parse(cleaned) as RawResponse;

  const themes = Array.isArray(raw.themes)
    ? (raw.themes as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 6)
    : [];
  const arcEntryIds = Array.isArray(raw.arc_entry_ids)
    ? (raw.arc_entry_ids as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .filter((s) => validIds.has(s))
        .slice(0, 12)
    : [];
  const letter = typeof raw.letter === 'string' ? raw.letter.trim() : '';
  if (letter.length < MIN_LETTER_CHARS) {
    throw new Error(
      `Quarterly letter too short (${letter.length} chars; need ≥${MIN_LETTER_CHARS})`,
    );
  }
  return { themes, arcEntryIds, letter };
}

/**
 * Pure builder. Caller passes the Gemini invoker so this works from
 * either the client or the server cron.
 */
export async function buildQuarterlyLetter(
  input: BuildQuarterlyLetterInput,
): Promise<QuarterlyLetterData> {
  const quarterKey = input.quarterKey ?? getQuarterKey();
  if (input.entries.length < 30) {
    throw new Error('Need at least 30 entries to generate a quarterly letter');
  }

  const prompt = buildPrompt(input);
  const responseText = await input.callGemini(QUARTERLY_LETTER_MODEL, prompt, {
    responseMimeType: 'application/json',
    responseSchema: QUARTERLY_RESPONSE_SCHEMA,
  });
  const validIds = new Set(input.entries.map((e) => e.id));
  const { themes, arcEntryIds, letter } = parseResponse(responseText, validIds);

  return {
    quarterKey,
    letter,
    themes,
    arcEntryIds,
    generatedAt: new Date().toISOString(),
  };
}
