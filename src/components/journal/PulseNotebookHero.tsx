'use client';

// Pulse hero on /notebooks/pulse. The single decision point for which
// pulse surface (morning / mid-day pause / evening) is currently live.
//
// Rule (per user, post-PR ship):
//   • Morning window (4am → eveningStartMin):
//       morning not done  → render Morning Pulse form
//       morning done      → render Mid-day Pause (Presence)
//   • Evening window (eveningStartMin → 4am):
//       evening not done  → render Evening Pulse form
//       evening done      → render nothing
//   • Mid-day Pause never appears in the evening window — even if
//     the user never logged one. "Pauses are between morning and
//     evening" — once it's evening time, the pause window is closed.
//   • If the user opens at evening with morning never done, still
//     show evening only. No backfill.
//
// Past pulses always render in the feed below (BookPage's standard
// entry list using PulseEntryCard). The hero never repeats them.

import { useMemo, useState } from 'react';
import DailyPulseCard from '@/components/DailyPulseCard';
import PresenceCapture from '@/components/PresenceCapture';
import { useAuthStore } from '@/stores/authStore';
import {
  currentPulseDay,
  eveningStartFromPrefs,
  getCurrentMode,
  pulseDayOf,
  pulseModeOf,
} from '@/lib/pulseTime';
import { t } from '@/lib/translations';
import type { JournalEntry } from '@/stores/journalStore';

interface Props {
  entries: JournalEntry[];
}

export default function PulseNotebookHero({ entries }: Props) {
  const profile = useAuthStore((s) => s.profile);
  const [addingAnotherPause, setAddingAnotherPause] = useState(false);

  // Threshold the morning/evening boundary uses. Single source of
  // truth in @/lib/pulseTime so DailyPulseCard's internal mode
  // computation and this orchestrator agree.
  const eveningStartMin = useMemo(
    () =>
      eveningStartFromPrefs(
        profile?.notification_preferences as
          | { reminder_times?: { evening?: string } }
          | null
          | undefined,
      ),
    [profile?.notification_preferences],
  );

  // Today's pulse-day (4am rollover) + per-mode done flags.
  const today = useMemo(() => currentPulseDay(), []);
  const { isMorningDone, isPresenceDone, isEveningDone } = useMemo(() => {
    let m = false, p = false, e = false;
    for (const entry of entries) {
      if (entry.entry_type !== 'pulse') continue;
      if (pulseDayOf(entry.created_at) !== today) continue;
      const mode = pulseModeOf(entry);
      if (mode === 'morning') m = true;
      else if (mode === 'presence') p = true;
      else if (mode === 'evening') e = true;
    }
    return { isMorningDone: m, isPresenceDone: p, isEveningDone: e };
  }, [entries, today]);

  const window = getCurrentMode(eveningStartMin);

  // ── Evening window ───────────────────────────────────────────
  // Evening pulse trumps everything once its time hits — including
  // the mid-day pause, even if the pause was never logged.
  if (window === 'evening') {
    if (isEveningDone) return null;
    return <DailyPulseCard entries={entries} />;
  }

  // ── Morning window ───────────────────────────────────────────
  // Morning first; once done, the mid-day pause becomes the only
  // surface until evening time hits.
  if (!isMorningDone) {
    return <DailyPulseCard entries={entries} />;
  }

  // Morning done — show the pause. First time → show the form
  // directly. After the first save → show "Add another pause" until
  // the user taps to log another. Either way, pause-only here; no
  // collapsed morning header on top.
  if (!isPresenceDone) {
    return <PresenceCapture />;
  }
  if (addingAnotherPause) {
    return <PresenceCapture onSaved={() => setAddingAnotherPause(false)} />;
  }
  return (
    <button
      type="button"
      onClick={() => setAddingAnotherPause(true)}
      className="w-full py-3 rounded-2xl border border-dashed border-border bg-surface/40 text-text-tertiary hover:text-text-secondary hover:border-text-tertiary/60 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
      aria-label={t('presence.addAnother')}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      <span>{t('presence.addAnother')}</span>
    </button>
  );
}
