// Sprint 3: natural-language time parsing fallback. Gemini emits
// `remind_at_iso` when it recognizes "remind me" framing; this module
// handles the cases where Gemini returns an empty/stale ISO but
// included `reminder_phrase`, or where the preview sheet's time picker
// wants to re-resolve a user-edited phrase.
//
// chrono-node is the engine — offline, fast, TZ-aware when you pass a
// reference Date.

import * as chrono from 'chrono-node';

export interface ParsedTime {
  iso: string;      // UTC ISO
  phrase: string;   // original phrase preserved for display
  confidence: number; // 0..1 — chrono doesn't expose confidence, so we
                      //        infer from match coverage
}

/**
 * Resolve a natural-language time phrase to a UTC ISO timestamp.
 * `reference` defaults to "now"; pass it when re-resolving at a
 * different anchor (e.g. past-dated reminders).
 */
export function parseTimePhrase(
  phrase: string,
  reference: Date = new Date(),
): ParsedTime | null {
  const trimmed = phrase?.trim();
  if (!trimmed) return null;

  const results = chrono.parse(trimmed, reference, { forwardDate: true });
  if (results.length === 0) return null;

  const r = results[0];
  const d = r.start.date();
  if (!d || isNaN(d.getTime())) return null;

  // Coverage = how much of the input the match spans. Crude proxy
  // for confidence — a phrase like "tomorrow at 10" with full
  // coverage is high-conf; "at 10" alone is lower.
  const coverage = r.text.length / trimmed.length;
  return {
    iso: d.toISOString(),
    phrase: trimmed,
    confidence: Math.min(1, Math.max(0.3, coverage)),
  };
}

/**
 * Given Gemini's possibly-empty remind_at_iso and its raw
 * reminder_phrase, return the best available ISO — or null if we
 * can't resolve one.
 */
export function resolveRemindAt(
  geminiIso: string | null | undefined,
  phrase: string | null | undefined,
): string | null {
  if (geminiIso) {
    const t = Date.parse(geminiIso);
    if (!isNaN(t)) return new Date(t).toISOString();
  }
  if (phrase) {
    const parsed = parseTimePhrase(phrase);
    if (parsed) return parsed.iso;
  }
  return null;
}

/**
 * Format a UTC ISO timestamp as "Tomorrow · 10:00 AM" etc. in the
 * user's locale + timezone.
 */
export function formatRemindAt(iso: string, locale: string = 'en-US'): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const msPerDay = 86_400_000;
  const diffDays = Math.floor(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      msPerDay,
  );
  const timeStr = d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  if (diffDays === 0) return `Today · ${timeStr}`;
  if (diffDays === 1) return `Tomorrow · ${timeStr}`;
  if (diffDays === -1) return `Yesterday · ${timeStr}`;
  const dateStr = d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${dateStr} · ${timeStr}`;
}
