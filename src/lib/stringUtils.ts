/**
 * Capitalize the first letter; lowercase the rest only when the input
 * is uniformly upper or lower (i.e. probably wasn't typed deliberately
 * mixed-case). Mixed-case input is preserved so proper nouns and
 * brand names ("Trader Joe's pasta", "iPhone charger") survive intact.
 *
 * Used as a safety net on the AI-capture path for grocery items —
 * Gemini is instructed to return sentence case via prompt, this guards
 * against rare misses (e.g. transcription artifacts like "BEETROOT").
 *
 * Manual entry / inline rename paths bypass this helper deliberately
 * so the user's typed casing is preserved.
 */
export function toSentenceCase(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return trimmed;
  if (!/[a-zA-Z]/.test(trimmed)) return trimmed;
  const isAllCaps = trimmed === trimmed.toUpperCase();
  const isAllLower = trimmed === trimmed.toLowerCase();
  if (!isAllCaps && !isAllLower) return trimmed;
  const first = trimmed.charAt(0).toUpperCase();
  const rest = isAllCaps ? trimmed.slice(1).toLowerCase() : trimmed.slice(1);
  return first + rest;
}
