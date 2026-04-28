// Cheap, deterministic fuzzy matcher for voice check-off. Maps a free-text
// phrase like "milk" to the best item in a list ("Whole milk - 1 gallon").
// No deps. Two signals combined:
//   1. direct substring containment in either direction (heavy weight)
//   2. Jaccard token overlap (lighter weight, catches "morning meds" → "Vitamin D — morning")
// Threshold tuned so that "milk" matches "Whole milk - 1 gallon"
// (jaccard ~0.34) but "almonds" against the same list returns null.

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const uni = new Set([...a, ...b]).size;
  return uni === 0 ? 0 : inter / uni;
}

export interface MatchCandidate {
  text?: string;
  name?: string;
}

export interface MatchResult<T> {
  item: T;
  score: number;
}

export function bestMatch<T extends MatchCandidate>(
  phrase: string,
  items: T[],
  min = 0.34,
): MatchResult<T> | null {
  if (!phrase.trim() || items.length === 0) return null;
  const phLower = phrase.toLowerCase().trim();
  const phTokens = tokens(phLower);
  let best: T | null = null;
  let bestScore = 0;
  for (const it of items) {
    const label = (it.text ?? it.name ?? '').toLowerCase();
    if (!label) continue;
    // Direct substring containment in either direction is a strong signal —
    // "milk" inside "Whole milk - 1 gallon" or vice versa.
    const direct = label.includes(phLower) || phLower.includes(label) ? 0.7 : 0;
    const overlap = jaccard(phTokens, tokens(label));
    const score = Math.max(direct, overlap);
    if (score > bestScore) {
      best = it;
      bestScore = score;
    }
  }
  return best && bestScore >= min ? { item: best, score: bestScore } : null;
}
