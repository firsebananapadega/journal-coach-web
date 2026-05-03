// Shared pulse-time helpers used by DailyPulseCard (the form
// component) and PulseNotebookHero (the orchestrator that decides
// which pulse surface — morning / mid-day / evening — is active).
//
// Both files used to compute the same threshold in two places; that
// drifted at least once. Keeping the rules in one module so the
// "currently morning vs evening" decision is single-sourced.

import type { JournalEntry } from '@/stores/journalStore';
import { toLocalDateStr } from '@/lib/dateUtils';

export type PulseMode = 'morning' | 'evening' | 'presence';

const DEFAULT_EVENING_START_MIN = 19 * 60 + 50; // 19:50

/** Parse "HH:MM" → minutes-of-day. Returns null on malformed input. */
function parseHHMM(s: string | undefined | null): number | null {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

/** Threshold (in minutes-of-day) where the morning window flips to
 *  evening. Reads the user's evening reminder time and subtracts a
 *  5-min lead so the mode is already 'evening' when the reminder push
 *  fires.
 *
 *  Default 19:50 when the user hasn't set an evening reminder. Clamped
 *  to [17:00, 23:55] so a malformed or unusually early/late stored
 *  value can't break the surface-decision logic. */
export function eveningStartFromReminder(reminderHHMM: string | undefined | null): number {
  const reminderMin = parseHHMM(reminderHHMM);
  if (reminderMin == null) return DEFAULT_EVENING_START_MIN;
  const lead = 5;
  const t = reminderMin - lead;
  return Math.max(17 * 60, Math.min(23 * 60 + 55, t));
}

/** Convenience wrapper that pulls the evening reminder out of the
 *  user's notification_preferences JSON shape. */
export function eveningStartFromPrefs(
  prefs:
    | { reminder_times?: { evening?: string } }
    | null
    | undefined,
): number {
  return eveningStartFromReminder(prefs?.reminder_times?.evening);
}

/** Which window are we in right now — 'morning' (4am → eveningStart)
 *  or 'evening' (eveningStart → 4am next day)? Doesn't read done-state;
 *  callers combine this with whether the user has logged a pulse for
 *  this mode today. */
export function getCurrentMode(eveningStartMin: number, now: Date = new Date()): PulseMode {
  const minOfDay = now.getHours() * 60 + now.getMinutes();
  if (minOfDay >= 4 * 60 && minOfDay < eveningStartMin) return 'morning';
  return 'evening';
}

/** Subjective "pulse day" for a timestamp. A pulse day runs from
 *  04:00 to 03:59 the next calendar day — so an evening pulse
 *  completed at 00:30 Tuesday still belongs to MONDAY's pulse day,
 *  not Tuesday's. Mirrors the 4am threshold in getCurrentMode(). */
export function pulseDayOf(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : new Date(iso);
  if (d.getHours() < 4) {
    const rolled = new Date(d);
    rolled.setDate(rolled.getDate() - 1);
    return toLocalDateStr(rolled);
  }
  return toLocalDateStr(d);
}

/** Current pulse-day key in the user's local time. */
export function currentPulseDay(): string {
  return pulseDayOf(new Date());
}

/** Read the pulse-mode tag from a journal entry's metadata. Returns
 *  null when the entry isn't a tagged pulse (legacy or non-pulse
 *  entry_type). */
export function pulseModeOf(e: JournalEntry): PulseMode | null {
  const m = (e.metadata as Record<string, unknown> | null)?.pulseMode;
  return m === 'morning' || m === 'evening' || m === 'presence' ? m : null;
}
