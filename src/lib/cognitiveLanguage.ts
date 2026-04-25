// Pennebaker's "cognitive turn" detector.
//
// Across decades of expressive-writing research, the single strongest
// predictor of who benefits is the use of cognitive / causal words —
// "because", "realize", "understand", "I think", "the reason." Pure
// emotional venting without that turn doesn't produce the change.
//
// We compute the rate (cognitive words / total words) on a chunk of
// the user's recent text. When the rate is below a threshold, the
// guide's system prompt gets a soft directive: gently invite the
// "why," not just the "what." No hard gate, no shaming UI.

const COGNITIVE_TOKENS: ReadonlyArray<string> = [
  // Causal
  'because', 'cause', 'caused', 'causing', 'reason', 'reasons',
  'why', 'so', 'therefore', 'thus', 'hence',
  // Insight
  'realize', 'realized', 'realizing', 'realization',
  'understand', 'understood', 'understanding',
  'recognize', 'recognized', 'recognizing',
  'notice', 'noticed', 'noticing',
  'know', 'knew', 'knowing',
  'see', 'saw', 'seeing',
  // Reflective verbs
  'think', 'thought', 'thinking',
  'consider', 'considered', 'considering',
  'wonder', 'wondered', 'wondering',
  // Connectors of meaning
  'maybe', 'perhaps', 'probably',
];
const COGNITIVE_SET = new Set(COGNITIVE_TOKENS);

/** Below this rate, the guide will be nudged toward "why" questions. */
export const COGNITIVE_LOW_THRESHOLD = 0.018;

export interface CognitiveStats {
  totalWords: number;
  cognitiveWords: number;
  rate: number; // 0..1
  /** Whether the rate is low enough to warrant a guide nudge. */
  isLow: boolean;
}

/** Compute cognitive-word rate over a single block of text. */
export function computeCognitiveStats(text: string | null | undefined): CognitiveStats {
  const safe = (text ?? '').toLowerCase();
  if (!safe.trim()) return { totalWords: 0, cognitiveWords: 0, rate: 0, isLow: false };

  // Strip punctuation, then split. Keep apostrophes inside contractions
  // so "don't" / "I'd" survive but trailing commas don't.
  const tokens = safe
    .replace(/[^a-z'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return { totalWords: 0, cognitiveWords: 0, rate: 0, isLow: false };

  let hits = 0;
  for (const tok of tokens) {
    if (COGNITIVE_SET.has(tok)) hits += 1;
  }

  const rate = hits / tokens.length;
  return {
    totalWords: tokens.length,
    cognitiveWords: hits,
    rate,
    // Only treat as "low" once the user has written enough to make the
    // ratio meaningful. Tiny entries are usually mood-tag style and
    // don't merit a why-nudge.
    isLow: tokens.length >= 60 && rate < COGNITIVE_LOW_THRESHOLD,
  };
}

/** Aggregate stats across multiple text blocks (e.g. last N entries). */
export function aggregateCognitiveStats(texts: (string | null | undefined)[]): CognitiveStats {
  let totalWords = 0;
  let cognitiveWords = 0;
  for (const t of texts) {
    const s = computeCognitiveStats(t);
    totalWords += s.totalWords;
    cognitiveWords += s.cognitiveWords;
  }
  const rate = totalWords === 0 ? 0 : cognitiveWords / totalWords;
  return {
    totalWords,
    cognitiveWords,
    rate,
    isLow: totalWords >= 200 && rate < COGNITIVE_LOW_THRESHOLD,
  };
}
