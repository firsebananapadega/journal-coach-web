// Lightweight notebook classifier used by /journal save flow.
//
// classifyCapture() is too heavy for a pure journal save — it
// extracts priorities / groceries / completions / etc which are
// irrelevant for a typed journal entry. This helper asks Gemini a
// single focused question: "which notebook does this belong in?"
// using only the user's actual notebook list.
//
// Before we even talk to Gemini, we run a deterministic name match:
// if the user explicitly says "working on Arcadia today…" and they
// have an "Arcadia" notebook, that wins immediately. The word
// "journal" is ambiguous (it's also the default notebook + shows
// up in phrases like "journal entry"), so the system notebook
// `journal` is never picked by the prefilter — it stays the
// catch-all.
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
  // System notebooks (journal / gratitude / prompts / pulse) are
  // built-in. Project notebooks are user-created. We only try to
  // pattern-match project notebook names in the text because system
  // slugs/names are generic English words ("journal", "prompts") that
  // show up incidentally.
  kind?: 'system' | 'project';
}

export interface ClassifyNotebookResult {
  slug: string;
  confidence: number; // 0..1
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Walks the text looking for an explicit mention of any project
// notebook's name. Uses a word-boundary match so "Arcadia" matches
// but "Arcadian" does not. First hit wins. Returns null when no
// project notebook was named — the caller then falls through to the
// Gemini classifier (or, if Gemini is unavailable, the Journal
// default).
function matchProjectNotebookByName(
  text: string,
  choices: NotebookOption[],
): ClassifyNotebookResult | null {
  if (!text) return null;
  const lowered = text.toLowerCase();
  // Prefer longer names first so a notebook called "Side Project Atlas"
  // wins over "Atlas" when both exist. Avoids partial-match collisions.
  const projects = choices
    .filter((c) => c.kind === 'project')
    .filter((c) => c.name && c.name.trim().length >= 2)
    .slice()
    .sort((a, b) => b.name.length - a.name.length);
  for (const nb of projects) {
    const name = nb.name.trim().toLowerCase();
    // Build a word-boundary regex. For multi-word names, treat
    // interior whitespace as flexible ("side project" also matches
    // "side-project" or "side  project"). `\\b` anchors the edges.
    const pattern = name.split(/\s+/).map(escapeRegex).join('\\s+');
    const rx = new RegExp(`\\b${pattern}\\b`, 'i');
    if (rx.test(lowered)) {
      return { slug: nb.slug, confidence: 0.95 };
    }
  }
  return null;
}

function buildPrompt(text: string, choices: NotebookOption[]): string {
  const list = choices
    .map((c) => `- "${c.slug}" (${c.name})${c.hint ? ` — ${c.hint}` : ''}`)
    .join('\n');
  return `Classify this journal entry into ONE of these notebooks. Return the slug exactly as written.

Available notebooks:
${list}

Rules:
- "journal" is the default / general catch-all. Use it ONLY when nothing else clearly fits. Do NOT pick it just because the author used the word "journal" — that word is ambiguous.
- "gratitude" — thankfulness, appreciation, naming things the author is grateful for.
- "prompts" — command blocks or instructions for AI (Claude, Gemini, etc.) that the author wants to copy-paste verbatim.
- Project notebooks (if listed) — ALWAYS prefer a project notebook when the author explicitly names that project or clearly writes about it. Project notebooks outrank the generic "journal" catch-all.

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

  // Deterministic win first — if the author literally said the name
  // of one of their project notebooks, pick it without burning a
  // Gemini call. This is the single most common classifier miss
  // today ("talking about Arcadia" landed in Journal because Gemini
  // treats "journal" as the safe default).
  const named = matchProjectNotebookByName(text, choices);
  if (named) return named;

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
