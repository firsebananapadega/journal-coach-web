// Guide Intelligence Engine — Gemini-powered coaching
// Uses gemini-2.5-pro for higher quality guided sessions
// Parameterized by GuidePersona — same engine, different personality per guide

import { callGeminiDetailed, parseJsonResponse, type TraceFn } from './geminiClient';

export { RateLimitError } from './geminiClient';
export type { TraceFn } from './geminiClient';
import { getTimeOfDay } from './guidanceEngine';
import { getGuideOrDefault, type GuidePersona } from './guideConfigs';
import { getLocale } from './language';
import { useJournalStore, type JournalEntry } from '@/stores/journalStore';
import { getCachedReflection } from './weeklyReflection';
import { aggregateCognitiveStats } from './cognitiveLanguage';

// Pro model used for guided sessions. Override at deploy time with
// NEXT_PUBLIC_GEMINI_GUIDED_MODEL.
//
// IMPORTANT: gemini-2.5-pro is the chosen default because it respects
// `thinkingConfig.thinkingBudget=128` (responds in ~3s on realistic
// prompts). gemini-3-pro-preview and gemini-3.1-pro-preview IGNORE the
// thinking budget — they burn 1000+ thought tokens regardless and take
// 14-20s per response. Quality is comparable for guided journaling.
// Empirically verified 2026-04-18.
const GUIDED_MODEL =
  process.env.NEXT_PUBLIC_GEMINI_GUIDED_MODEL || 'gemini-2.5-pro';

// --- Types ---

export interface GuideResponse {
  type: 'follow_up' | 'goal_suggestion';
  question: string;
  detected_goal?: string;
}

export interface GuideResult {
  response: GuideResponse;
  guideId: string;
  usedFallback?: boolean;
  modelUsed?: string;
}

export interface ConversationExchange {
  question: string;
  answer: string;
}

// --- Tier 1 long-term context helpers (no extra API calls) ---
//
// Full-depth version: injects weekly reflection + last 3 guided sessions
// + deterministic stats. Adds ~600-700 input tokens but gives the guide
// much richer continuity across sessions. Safe now that the silent 500
// in the auth path is fixed and Gemini 2.5 Pro with thinkingBudget=128
// responds in 3-5s regardless of prompt size.

const MAX_GUIDED_SUMMARY_CHARS = 600;
const MAX_REFLECTION_CHARS = 800;

// ── Session modes ─────────────────────────────────────────────────
// Optional structural overlays the user can pick at session start.
// Each mode adds a paragraph-level directive on top of the guide's
// own systemPrompt — the guide's voice stays constant; the *shape* of
// the questions changes.
//
// 'open' (default) keeps current behavior: open Socratic exploration.
// The named modes are research-backed reflection structures that
// reliably produce different kinds of insight.
export type SessionMode = 'open' | 'naikan' | 'nvc' | 'aar';

export interface SessionModeOption {
  id: SessionMode;
  label: string;
  /** One-sentence description shown in the picker. */
  hint: string;
}

export const SESSION_MODE_OPTIONS: SessionModeOption[] = [
  { id: 'open', label: 'Open', hint: 'Wherever the conversation goes.' },
  { id: 'naikan', label: 'Naikan', hint: 'What did I receive, give, and trouble?' },
  { id: 'nvc', label: 'NVC', hint: 'Observation → feeling → need → request.' },
  { id: 'aar', label: 'After-action', hint: 'Expected vs. actual; what to keep, what to change.' },
];

const SESSION_MODE_PROMPTS: Record<Exclude<SessionMode, 'open'>, string> = {
  naikan: `
Session mode: NAIKAN reflection (Japanese self-inquiry).
- Structure your questions around the three Naikan questions, in order:
  1. What have I received from others (this week / today / from this person)?
  2. What have I given to others?
  3. What troubles, worries, or difficulties have I caused others?
- Naikan deliberately omits "what troubles others have caused me" — do not ask that.
- The aim is to widen perspective and lift the user out of victimhood, not to induce shame. Keep tone warm.
- One question at a time. Concrete, verifiable facts ("I drove my friend to the airport") beat generalities ("I was supportive").`,
  nvc: `
Session mode: NONVIOLENT COMMUNICATION (Rosenberg).
- Walk the user through the four NVC components, in order, one at a time:
  1. Observation — strictly facts, no evaluation. ("She arrived at 8:30," not "She was late.")
  2. Feeling — pure emotion words, separate from thoughts about others ("frustrated," not "betrayed").
  3. Need — the universal human need underneath the feeling (autonomy, connection, rest, etc.).
  4. Request — a specific, doable, present-tense request (of self or other).
- Help them notice when an "observation" smuggles in evaluation, or when a "feeling" is actually a thought.
- Goal: move from blame/judgment toward clarity about what they need and what to ask for.`,
  aar: `
Session mode: AFTER-ACTION REVIEW.
- Structure the conversation around four AAR questions, in this order:
  1. What did you expect / hope would happen?
  2. What actually happened?
  3. Why was there a gap (or surprise)? What contributed?
  4. What will you sustain (worked well) and what will you change (next time)?
- Distinguish "sustain" from "improve" — both deserve naming.
- Keep the tone learning-focused, not self-critical. End with one concrete commitment for next time.`,
};

/** Returns the mode-specific overlay text, or '' for 'open'. */
function buildSessionModeDirective(mode?: SessionMode | null): string {
  if (!mode || mode === 'open') return '';
  const block = SESSION_MODE_PROMPTS[mode];
  return block ? `\n${block}\n` : '';
}

function buildGuidedSessionHistory(n = 3): string {
  let entries: JournalEntry[] = [];
  try {
    entries = useJournalStore.getState().entries;
  } catch {
    return '';
  }
  const guided = entries.filter((e) => e.entry_type === 'guided').slice(0, n);
  if (guided.length === 0) return '';

  const blocks = guided.map((e) => {
    const date = new Date(e.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const text = (e.content_text || '').slice(0, MAX_GUIDED_SUMMARY_CHARS);
    return `[${date}] ${text}${e.content_text && e.content_text.length > MAX_GUIDED_SUMMARY_CHARS ? '…' : ''}`;
  });
  return blocks.join('\n---\n');
}

function buildWeeklyReflectionSnippet(): string {
  const r = getCachedReflection();
  if (!r) return '';
  const themes = r.themes && r.themes.length > 0 ? `Themes: ${r.themes.join(', ')}.\n` : '';
  const letter = (r.letter || '').slice(0, MAX_REFLECTION_CHARS);
  return `${themes}${letter}${r.letter && r.letter.length > MAX_REFLECTION_CHARS ? '…' : ''}`;
}

function buildCognitiveDirective(): string {
  // Only trigger when there's enough recent text to read a real
  // signal. Look at the user's last ~10 reflective entries and the
  // current session's user-side messages from the latest turn (if
  // present). If the cognitive-word rate is below threshold, the
  // guide should gently invite the "why," per Pennebaker's research.
  let entries: JournalEntry[] = [];
  try {
    entries = useJournalStore.getState().entries;
  } catch {
    return '';
  }
  const reflective = entries
    .filter((e) => e.entry_type !== 'pulse' && e.entry_type !== 'practice')
    .slice(0, 10)
    .map((e) => e.content_text || '');
  if (reflective.length === 0) return '';

  const stats = aggregateCognitiveStats(reflective);
  if (!stats.isLow) return '';
  return [
    '',
    'Pennebaker pattern note (use, do not mention):',
    '- The user has been writing mostly in feelings without much causal language ("because", "realize", "I think", "the reason").',
    '- Pure emotional venting without the cognitive turn doesn\'t produce the well-being benefits of journaling.',
    '- This session, gently invite the *why*: ask one open question that nudges them to explore what led to the feeling, not just name it. Examples: "What do you think led to that?", "Was there a moment that flipped it?", "Looking back, what do you make of it?"',
    '- Do NOT name this pattern, lecture about cognitive integration, or use the word "Pennebaker."',
  ].join('\n');
}

function buildUserStats(): string {
  let entries: JournalEntry[] = [];
  try {
    entries = useJournalStore.getState().entries;
  } catch {
    return '';
  }
  if (entries.length === 0) return '';

  const total = entries.length;
  const dates = new Set(entries.map((e) => e.created_at.slice(0, 10)));
  const daysActive = dates.size;

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentMoods = entries
    .filter((e) => new Date(e.created_at).getTime() >= sevenDaysAgo)
    .map((e) => e.mood_label)
    .filter((m): m is string => !!m);
  const moodCounts = new Map<string, number>();
  for (const m of recentMoods) moodCounts.set(m, (moodCounts.get(m) ?? 0) + 1);
  const dominantMood = [...moodCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const parts = [`${total} entries`, `${daysActive} days active`];
  if (dominantMood) parts.push(`this week: mostly ${dominantMood}`);
  return parts.join(' · ');
}

// --- Build conversation context for Gemini ---

function buildConversationContext(
  guide: GuidePersona,
  exchanges: ConversationExchange[],
  currentAnswer: string,
  context: {
    recentEntriesSummary?: string; // legacy — ignored if present, computed internally now
    activeGoals?: string[];
    mood?: string;
    speechIntensity?: number;
    /** Optional structural overlay for this session. */
    mode?: SessionMode | null;
  }
): string {
  let prompt = guide.systemPrompt + '\n\n';

  // ── Optional session-mode overlay (Naikan / NVC / AAR / open) ──
  // Goes immediately after the guide's voice so the guide stays the
  // same character but adopts a different question shape.
  const modeBlock = buildSessionModeDirective(context.mode);
  if (modeBlock) prompt += modeBlock + '\n';

  // ── Always-present context ──
  prompt += `Context:\n`;
  prompt += `- Time: ${getTimeOfDay()}\n`;
  if (context.mood) prompt += `- Current mood: ${context.mood}\n`;
  if (context.activeGoals && context.activeGoals.length > 0) {
    prompt += `- Intentions they are holding: ${context.activeGoals.join(', ')}\n`;
  }

  // ── Tier 1: deterministic stats (zero AI calls) ──
  const stats = buildUserStats();
  if (stats) prompt += `- User journey: ${stats}\n`;

  // ── Tier 1: cognitive-language nudge ──
  // Pure-deterministic scan of recent entries. Only fires when the
  // user has been venting without causal/insight language. Adds a
  // directive (not a hard constraint) so the guide leans toward
  // "why" questions for this session.
  const cognitiveNote = buildCognitiveDirective();
  if (cognitiveNote) prompt += cognitiveNote + '\n';

  // ── Tier 1: cached weekly reflection ──
  const reflection = buildWeeklyReflectionSnippet();
  if (reflection) {
    prompt += `\nThis week's reflection (your previous synthesis of their themes — use to recognize continuity, never quote verbatim):\n${reflection}\n`;
  }

  // ── Tier 1: last 3 guided sessions ──
  const guidedHistory = buildGuidedSessionHistory();
  if (guidedHistory) {
    prompt += `\nLast 3 guided sessions with this user (use to connect themes across time, reference what they've already worked on; do not retread the same advice):\n${guidedHistory}\n`;
  }

  if (context.speechIntensity != null && context.speechIntensity > 0.6) {
    prompt += `\nNote: User is speaking with high emotional intensity. Be especially attentive.\n`;
  }

  if (exchanges.length > 0) {
    prompt += `\nConversation so far in THIS session:\n`;
    for (const ex of exchanges) {
      prompt += `${guide.name}: ${ex.question}\nUser: ${ex.answer}\n`;
    }
  }

  prompt += `\nUser's latest message:\n"${currentAnswer}"\n`;

  // Language directive
  const locale = getLocale();
  if (locale === 'es') {
    prompt += `\nIMPORTANT: Respond entirely in Mexican Spanish (español mexicano). Use "tú" for addressing the user. Never use Spain Spanish vocabulary (no "vale", "mola", "vosotros", "coger"). Your JSON "question" and "detected_goal" fields MUST be in Mexican Spanish.\n`;
  }

  prompt += `\nRespond as JSON only.\n`;

  return prompt;
}

// --- Gemini call via centralized client ---

interface FollowUpResult {
  response: GuideResponse;
  usedFallback?: boolean;
  modelUsed?: string;
}

async function getGeminiFollowUp(prompt: string, onTrace?: TraceFn): Promise<FollowUpResult> {
  const detailed = await callGeminiDetailed(GUIDED_MODEL, prompt, { onTrace });
  const parsed = parseJsonResponse<GuideResponse>(detailed.text, {
    type: 'follow_up',
    question: detailed.text,
  });
  return {
    response: parsed,
    usedFallback: detailed.usedFallback,
    modelUsed: detailed.modelUsed,
  };
}

// --- Main function for guided sessions ---

export async function getGuideResponse(
  currentAnswer: string,
  context: {
    guideId?: string;
    exchanges?: ConversationExchange[];
    recentEntriesSummary?: string;
    activeGoals?: string[];
    mood?: string;
    speechIntensity?: number;
    /** Structural session overlay (open / naikan / nvc / aar). */
    mode?: SessionMode | null;
    onTrace?: TraceFn;
  } = {}
): Promise<GuideResult> {
  const guide = getGuideOrDefault(context.guideId);
  const trace = context.onTrace;

  trace?.('build prompt', { guide: guide.id, exchanges: context.exchanges?.length ?? 0, mode: context.mode ?? 'open' });
  const prompt = buildConversationContext(
    guide,
    context.exchanges || [],
    currentAnswer,
    {
      recentEntriesSummary: context.recentEntriesSummary,
      activeGoals: context.activeGoals,
      mood: context.mood,
      speechIntensity: context.speechIntensity,
      mode: context.mode,
    }
  );
  trace?.('prompt built', { chars: prompt.length });

  const r = await getGeminiFollowUp(prompt, trace);
  return {
    response: r.response,
    guideId: guide.id,
    usedFallback: r.usedFallback,
    modelUsed: r.modelUsed,
  };
}

// --- Simpler function for voice entry one-shot follow-up ---

export async function getGuideVoiceFollowUp(
  transcriptText: string,
  context: {
    guideId?: string;
    recentEntriesSummary?: string;
    activeGoals?: string[];
    mood?: string;
    speechIntensity?: number;
  } = {}
): Promise<GuideResult> {
  const guide = getGuideOrDefault(context.guideId);

  const prompt = buildConversationContext(guide, [], transcriptText, context);

  const r = await getGeminiFollowUp(prompt);
  return {
    response: r.response,
    guideId: guide.id,
    usedFallback: r.usedFallback,
    modelUsed: r.modelUsed,
  };
}

// Re-export useful functions from guidanceEngine
export { getOpeningQuestion, getGuidedSessionOpening, getClosingMessage, getTimeOfDay } from './guidanceEngine';
