'use client';

// Pulse hero block on /notebooks/pulse. Mirrors the Plans /
// Gratitude pattern: a structured daily ritual surface lives at the
// top of the system notebook; past entries fall through to the feed
// below.
//
// This component is a relocation of the JSX block /home used to
// carry. No business logic changed:
//   • DailyPulseCard handles morning + evening + body/mind scales
//     + edit + done-card collapse. Receives the full entries slice
//     so it can show today's prior pulse runs above the input form.
//   • Mid-day Presence uses an hour gate (don't show before 11am)
//     and a multi-capture toggle so users can record multiple
//     mid-day pauses without the compose form being permanently
//     parked on screen.

import { useMemo, useState } from 'react';
import DailyPulseCard from '@/components/DailyPulseCard';
import PresenceCapture from '@/components/PresenceCapture';
import { toLocalDateStr } from '@/lib/dateUtils';
import { t } from '@/lib/translations';
import type { JournalEntry } from '@/stores/journalStore';

const PRESENCE_VISIBLE_FROM_HOUR = 11;

interface Props {
  entries: JournalEntry[];
}

export default function PulseNotebookHero({ entries }: Props) {
  const today = toLocalDateStr(new Date());
  const [addingAnotherPause, setAddingAnotherPause] = useState(false);

  // Has the user already done today's mid-day presence? Mirrors the
  // 04:00 pulse-day boundary used elsewhere so an 11pm capture still
  // counts as "today."
  const todaysPresenceDone = useMemo(() => {
    return entries.some((e) => {
      if (e.entry_type !== 'pulse') return false;
      const m = (e.metadata ?? {}) as Record<string, unknown>;
      if (m.pulseMode !== 'presence') return false;
      const d = new Date(e.created_at);
      if (d.getHours() < 4) d.setDate(d.getDate() - 1);
      return toLocalDateStr(d) === today;
    });
  }, [entries, today]);

  return (
    <div className="space-y-4">
      <DailyPulseCard entries={entries} />

      {new Date().getHours() >= PRESENCE_VISIBLE_FROM_HOUR && (
        !todaysPresenceDone ? (
          <PresenceCapture />
        ) : addingAnotherPause ? (
          <PresenceCapture onSaved={() => setAddingAnotherPause(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setAddingAnotherPause(true)}
            className="w-full py-3 rounded-2xl border border-dashed border-border bg-surface/40 text-text-tertiary hover:text-text-secondary hover:border-text-tertiary/60 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
            aria-label={t('presence.addAnother')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>{t('presence.addAnother')}</span>
          </button>
        )
      )}
    </div>
  );
}
