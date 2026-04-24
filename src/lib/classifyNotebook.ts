// Lightweight notebook classifier used by /journal save flow.
//
// classifyCapture() is too heavy for a pure journal save — it
// extracts priorities / groceries / completions / etc which are
// irrelevant for a typed journal entry. This helper asks Gemini a
// single focused question: "which notebook does this belong in?"
// using only the user's actual notebook list.
//
// Prompt stays under ~200 tokens so the round-trip is fast enough
// to show in a bottom sheet without a visible wait.

import { callGemini, parseJsonResponse } from './geminiClient';

const MODEL = 'gemini-2.5-flash';
const TIMEOUT_MS = 10_000;

export interface NotebookOption {
  slug: string;
  name: string;
  hint?: string; // optional "what goes here" nudge for the model
}

export interface ClassifyNotebookResult {
  slug: string;
  confidence: number; // 0..1
}

function buildPrompt(text: string, choices: NotebookOption[]): string {
  const list = choices
    .map((c) => `- "${c.slug}" (${c.name})${c.hint ? ` — ${c.hint}` : ''}`)
    .join('\n');
  return `Classify this journal entry into ONE of these notebooks. Return the slug exactly as written.

Available notebooks:
${list}

Rules:
- "journal" is the default / general catch-all. Use it when nothing else clearly fits.
- "gratitude" — thankfulness, appreciation, naming things the author is grateful for.
- "prompts" — command blocks or instructions for AI (Claude, Gemini, etc.) that the author wants to copy-paste verbatim.
- Project notebooks (if listed) — use when the author explicitly names the project or clearly writes about it.

Journal entry:
"""
${text.trim().slice(0, 4000)}
"""

Respond with ONLY valid JSON of this shape, nothing else:
{"slug": "journal", "confidence": 0.8}`;
}

export async function classifyNotebook(
  text: string,
  choices: NotebookOption[],
): Promise<ClassifyNotebookResult> {
  const fallback: ClassifyNotebookResult = { slug: 'journal', confidence: 0.5 };
  if (!text || text.trim().length === 0 || choices.length === 0) return fallback;

  const validSlugs = new Set(choices.map((c) => c.slug));
  try {
    const prompt = buildPrompt(text, choices);
    const raw = await callGemini(MODEL, prompt, TIMEOUT_MS);
    const parsed = parseJsonResponse<Partial<ClassifyNotebookResult>>(raw, {});
    const slug = typeof parsed.slug === 'string' ? parsed.slug.trim().toLowerCase() : '';
    if (!validSlugs.has(slug)) return fallback;
    const rawConf = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
    return {
      slug,
      confidence: Math.max(0, Math.min(1, rawConf)),
    };
  } catch {
    return fallback;
  }
}
