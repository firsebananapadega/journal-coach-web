// Shared truncation sentinel — both the server-only Gemini caller and
// any client code that needs to detect/strip clipped responses live
// here so neither has to import from the other's restricted module.
//
// Background: when a Gemini response hits `finishReason: MAX_TOKENS`,
// our server-side `generate()` appends this sentinel to the returned
// text. Callers (e.g. structureEntry's polish pass) can then refuse
// to persist a clipped result, falling back to raw rather than
// silently overwriting a complete entry with a truncated one.

export const TRUNCATION_SENTINEL = '[[GEMINI_MAX_TOKENS_TRUNCATED]]';

/** Whether a Gemini response was clipped at MAX_TOKENS. */
export function wasTruncated(text: string | null | undefined): boolean {
  return !!text && text.includes(TRUNCATION_SENTINEL);
}

/** Remove the sentinel from text before rendering or storing. */
export function stripTruncationSentinel(text: string): string {
  return text
    .replace(/\n*\[\[GEMINI_MAX_TOKENS_TRUNCATED\]\]\s*$/m, '')
    .trim();
}
