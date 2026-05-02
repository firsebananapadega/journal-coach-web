// WOOP if-then generator.
//
// Given the user's wish + outcome + obstacles, returns one if-then
// statement per obstacle. The structure is intentionally constrained
// to match the implementation-intentions research format:
//   "If [trigger], then I'll [action]."
//
// The TRIGGER is grounded in the user's actual obstacle ("when I
// check Slack the moment I sit down" → "if I sit at my desk").
// The ACTION is short, concrete, and productivity-style only.
//
// IMPORTANT: this prompt is constrained to productivity / habits
// / learning territory ONLY. It explicitly refuses mental-health-
// adjacent content per the "soft therapy line" we agreed on. If
// the user types an obstacle like "I feel anxious," the LLM still
// produces a productivity-style if-then ("if I notice my chest
// tighten, then I'll take 3 slow breaths and step outside") — not
// a therapeutic strategy.

import { callGemini } from './geminiClient';

const MODEL = 'gemini-2.5-flash';
const TIMEOUT_MS = 25_000;

interface WoopInput {
  wish: string;
  outcome: string;
  obstacles: string[]; // 1–3 strings
}

export interface WoopGeneratedItem {
  obstacle: string;
  if_then: string;
}

function buildPrompt(input: WoopInput): string {
  const obstaclesList = input.obstacles
    .map((o, i) => `${i + 1}. ${o.trim()}`)
    .join('\n');
  return `You are generating implementation intentions for a user pursuing a personal change. Use the WOOP framework (Wish / Outcome / Obstacle / Plan).

USER'S WISH: ${input.wish.trim()}

USER'S DESIRED OUTCOME: ${input.outcome.trim()}

OBSTACLES THE USER IDENTIFIED:
${obstaclesList}

For EACH obstacle, generate exactly ONE if-then statement. Format strictly:
  "If [specific trigger], then I'll [specific concrete action]."

RULES:
- Each statement ≤ 120 characters
- The trigger must be observable / situational, not emotional ("if I sit at my desk" not "if I feel motivated")
- The action must be small, concrete, and within ~5 minutes of effort
- Productivity / habits / learning style ONLY — no medical, dietary, or therapeutic claims
- Stay second-person-implicit ("I'll do X"), no "you should"
- No preamble, no commentary, no markdown

OUTPUT FORMAT (strict JSON, nothing else):
{
  "items": [
    { "obstacle": "<copy of obstacle 1>", "if_then": "If …, then I'll …" },
    { "obstacle": "<copy of obstacle 2>", "if_then": "If …, then I'll …" }
  ]
}

If an obstacle is mental-health-adjacent ("I feel anxious", "I'm depressed", "I can't sleep"), the if-then must redirect to a productivity-style ACTION (e.g. "if I notice my chest tighten, then I'll take 3 slow breaths and step outside for 60 seconds") rather than therapeutic advice. Never recommend medication, diagnosis, professional help in the if-then text — those concerns are out of scope.

Produce exactly ${input.obstacles.length} items.`;
}

export async function generateWoopPlans(input: WoopInput): Promise<WoopGeneratedItem[]> {
  if (input.obstacles.length === 0) return [];
  const prompt = buildPrompt(input);
  const raw = await callGemini(MODEL, prompt, TIMEOUT_MS);
  return parseResponse(raw, input.obstacles);
}

/** Parse the strict JSON response. Robust to Gemini wrapping in code
 *  fences or adding stray text before/after the JSON object. Falls
 *  back to a per-obstacle generic if-then if parsing fails so the UX
 *  doesn't block on a model hiccup. */
function parseResponse(raw: string, obstacles: string[]): WoopGeneratedItem[] {
  // Strip code fences if present.
  const cleaned = raw
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  // Find the first { and last } — handles preamble/postamble noise.
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) {
    return obstacles.map(fallbackItem);
  }
  const slice = cleaned.slice(start, end + 1);
  try {
    const parsed = JSON.parse(slice) as { items?: Array<{ obstacle?: string; if_then?: string }> };
    const items = parsed.items;
    if (!Array.isArray(items)) return obstacles.map(fallbackItem);
    // Pad with fallbacks if Gemini returned fewer than expected;
    // truncate if it returned more.
    return obstacles.map((o, i) => {
      const item = items[i];
      if (!item || typeof item.if_then !== 'string' || !item.if_then.trim()) {
        return fallbackItem(o);
      }
      return {
        obstacle: o,
        if_then: item.if_then.trim().slice(0, 240),
      };
    });
  } catch (err) {
    console.warn('[woopGenerator] failed to parse response', { err, slice });
    return obstacles.map(fallbackItem);
  }
}

function fallbackItem(obstacle: string): WoopGeneratedItem {
  return {
    obstacle,
    if_then: `If "${obstacle.slice(0, 60)}" comes up, then I'll pause for 30 seconds and pick a different action.`,
  };
}
