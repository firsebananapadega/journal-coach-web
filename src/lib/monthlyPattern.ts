// Monthly pattern digest builder.
//
// Where the weekly letter is a warm one-paragraph note from the
// guide, the monthly pattern is a step out from one week to thirty
// days. Gemini reads the user's last ~30 days of reflective entries
// and clusters them into 3 named themes — each with a one-sentence
// summary and a list of example entry ids — followed by a 200-word
// "what I noticed about you this month" narrative. Same delivery
// mechanism as the weekly letter (cron → DB → push → /letters), but
// the payload is richer so the user can see longitudinal shape, not
// just a one-week snapshot.

export interface MonthlyTheme {
  name: string;
  summary: string;
  /** Up to ~5 entry ids that drove this theme. UI uses them for
   *  "examples like…" tooltips on demand. */
  entry_ids: string[];
}

export interface MonthlyPatternData {
  monthKey: string;        // "2026-04"
  narrative: string;       // ~200-word free-text from the guide
  themes: MonthlyTheme[];  // exactly 3 (best-effort; degrades to ≥1)
  generatedAt: string;
}

/** Returns a calendar month key like "2026-04". The cron uses this
 *  for idempotency — the same month_key on a rerun finds the existing
 *  row and skips. */
export function getMonthKey(date?: Date): string {
  const d = date ? new Date(date) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
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

const MONTHLY_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          summary: { type: 'string' },
          entry_ids: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'summary', 'entry_ids'],
      },
    },
    narrative: { type: 'string' },
  },
  required: ['themes', 'narrative'],
};

const MIN_NARRATIVE_CHARS = 400; // 150-220 words ≈ 800-1100 chars; 400 floor

export interface BuildMonthlyPatternInput {
  entries: EntryInput[];
  userName: string;
  guideName: string;
  /** Optional behavioral signal block, same shape used by the weekly
   *  letter — habit completion %, pulse averages, task rate, etc. */
  signalsBlock?: string;
  callGemini: GeminiInvoker;
  monthKey?: string;
  /** 'en' | 'es' — drives the prompt's output language. 'es' adds
   *  an explicit Mexican-Spanish instruction (tú form, no Spain
   *  vocabulary) and switches date formatting to Spanish abbreviations. */
  locale?: 'en' | 'es';
}

export const MONTHLY_PATTERN_MODEL = 'gemini-2.5-flash';

function buildPrompt(input: BuildMonthlyPatternInput): string {
  const isSpanish = input.locale === 'es';
  const dateLocale = isSpanish ? 'es-MX' : 'en-US';
  const summaries = input.entries.map((e) => {
    const date = new Date(e.created_at).toLocaleDateString(dateLocale, {
      month: 'short',
      day: 'numeric',
    });
    const mood = e.mood_label || (isSpanish ? 'no especificado' : 'unspecified');
    const snippet = (e.content_text || '').slice(0, 400);
    return `- id="${e.id}" date=${date} mood=${mood}\n  ${snippet}`;
  });

  const signalsBlock = input.signalsBlock ?? '';
  const langInstruction = isSpanish
    ? '\n- Write the entire narrative AND theme names/summaries in Mexican Spanish (español mexicano). Use "tú" form. Never use Spain Spanish vocabulary.'
    : '';

  return `You are ${input.guideName}, a warm and observant journaling guide writing a MONTHLY pattern digest for ${input.userName || 'your journaler'}.

You will read 30 days of journal entries and identify recurring themes. Your output is a JSON object with this exact shape:

{
  "themes": [
    {
      "name": "Short theme title (3-5 words)",
      "summary": "One sentence (≤25 words) describing the theme.",
      "entry_ids": ["id1", "id2", "id3"]
    },
    ...
  ],
  "narrative": "..."
}

Rules:
- Identify exactly 3 themes when possible. If the entries cluster into fewer, return 1 or 2 themes — do NOT pad.
- Theme names should be specific and human ("Wrestling with rest", "Building Wellbloom"), NOT generic ("Productivity", "Wellness").
- Each theme.entry_ids should list 2-5 entry ids that BEST exemplify that theme. Use ONLY ids from the input. Don't invent.
- The narrative is a 150-220 word reflection in your warm voice. Address ${input.userName || 'the journaler'} directly. Use cognitive/causal language ("you've been noticing X because…") rather than pure emotion words.
- The narrative should reference 1-2 of the themes by name, NOT all three (so each one feels like its own discovery).
- Sign the narrative with your first name only on the final line.
- Use plain text in the narrative — no markdown, no headers, no bullet points.${langInstruction}

Behavioral signals from the past 30 days (use to ground specific observations — don't list mechanically):
${signalsBlock || '(none)'}

Journal entries (last 30 days):
${summaries.join('\n\n')}

Respond with ONLY the JSON object — no preamble, no code fences.`;
}

interface RawResponse {
  themes?: Array<{ name?: unknown; summary?: unknown; entry_ids?: unknown }>;
  narrative?: unknown;
}

function parseResponse(text: string, validIds: Set<string>): {
  themes: MonthlyTheme[];
  narrative: string;
} {
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  // JSON mode is enforced by the Gemini call; parse failure here is
  // a real bug, not a fallback path.
  const raw = JSON.parse(cleaned) as RawResponse;

  const themes: MonthlyTheme[] = [];
  if (Array.isArray(raw.themes)) {
    for (const t of raw.themes) {
      if (!t || typeof t !== 'object') continue;
      const name = typeof t.name === 'string' ? t.name.trim() : '';
      const summary = typeof t.summary === 'string' ? t.summary.trim() : '';
      const ids = Array.isArray(t.entry_ids)
        ? (t.entry_ids as unknown[])
            .filter((x): x is string => typeof x === 'string')
            .filter((x) => validIds.has(x))
            .slice(0, 6)
        : [];
      if (name && summary) themes.push({ name, summary, entry_ids: ids });
    }
  }

  const narrative = typeof raw.narrative === 'string' ? raw.narrative.trim() : '';
  if (narrative.length < MIN_NARRATIVE_CHARS) {
    throw new Error(
      `Monthly narrative too short (${narrative.length} chars; need ≥${MIN_NARRATIVE_CHARS})`,
    );
  }
  return { themes, narrative };
}

/**
 * Pure builder. Caller passes the Gemini invoker so this works from
 * either the client (/api/gemini auth'd) or the server cron
 * (api-key'd via callGeminiServer).
 */
export async function buildMonthlyPattern(
  input: BuildMonthlyPatternInput,
): Promise<MonthlyPatternData> {
  const monthKey = input.monthKey ?? getMonthKey();
  if (input.entries.length < 5) {
    throw new Error('Need at least 5 entries to generate a monthly pattern');
  }

  const prompt = buildPrompt(input);
  const responseText = await input.callGemini(MONTHLY_PATTERN_MODEL, prompt, {
    responseMimeType: 'application/json',
    responseSchema: MONTHLY_RESPONSE_SCHEMA,
  });
  const validIds = new Set(input.entries.map((e) => e.id));
  const { themes, narrative } = parseResponse(responseText, validIds);

  return {
    monthKey,
    narrative,
    themes,
    generatedAt: new Date().toISOString(),
  };
}
