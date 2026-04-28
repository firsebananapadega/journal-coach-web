'use client';

// Presence pause — mid-day capture surface rendered on /home (Pulse
// tab) when the user hasn't yet recorded a presence today.
//
// Two quick prompts in a single light screen:
//   1. Where's your attention right now?  (free text, ~80 chars)
//   2. One word for this moment            (single word, ~24 chars)
//
// Writes one journal_entries row with entry_type='pulse' +
// metadata.pulseMode='presence'. /home gates rendering of this
// component on whether today's presence exists; once submitted, the
// row appears as a compact done card inside DailyPulseCard's
// chronologically-sorted list (alongside morning + evening).

import { useEffect, useState } from 'react';
import { useJournalStore } from '@/stores/journalStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { useUiStore } from '@/stores/uiStore';
import { t } from '@/lib/translations';

export default function PresenceCapture() {
  const hasFetched = useJournalStore((s) => s.hasFetched);
  const fetchEntries = useJournalStore((s) => s.fetchEntries);
  const createEntry = useJournalStore((s) => s.createEntry);
  const pulseNotebookId = useNotebookStore((s) => s.pulseId());
  const fetchNotebooks = useNotebookStore((s) => s.fetchNotebooks);
  const hasFetchedNotebooks = useNotebookStore((s) => s.hasFetched);
  const showToast = useUiStore((s) => s.showToast);

  const [attention, setAttention] = useState('');
  const [oneWord, setOneWord] = useState('');
  const [saving, setSaving] = useState(false);

  // Hydrate journal entries on first mount so the parent (/home) can
  // detect whether today's presence is already done and decide whether
  // to render this component.
  useEffect(() => {
    if (!hasFetched) void fetchEntries();
  }, [hasFetched, fetchEntries]);
  useEffect(() => {
    if (!hasFetchedNotebooks) void fetchNotebooks();
  }, [hasFetchedNotebooks, fetchNotebooks]);

  const canSave = !!(attention.trim() || oneWord.trim());

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const trimmedAttention = attention.trim();
      const trimmedWord = oneWord.trim().split(/\s+/)[0]?.slice(0, 24) ?? '';
      const contentText = [trimmedAttention, trimmedWord].filter(Boolean).join(' • ');
      await createEntry({
        entry_type: 'pulse',
        title: 'Presence Pause',
        content_text: contentText || null,
        notebook_id: pulseNotebookId,
        word_count: contentText ? contentText.split(/\s+/).filter(Boolean).length : 0,
        metadata: {
          pulseMode: 'presence',
          attention: trimmedAttention || null,
          // body_score / body_label intentionally omitted — body
          // emoji-scale removed from the capture flow. Past entries
          // with these fields render correctly via DailyPulseCard's
          // presence branch in renderCompletedPulse.
          one_word: trimmedWord || null,
        },
      });
      // After save: clear the form. /home will detect the new entry
      // (via journalStore.entries) and unmount this component, while
      // DailyPulseCard renders the new presence row as a compact done
      // card in chronological order with morning + evening.
      setAttention('');
      setOneWord('');
      showToast(t('presence.done'), 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Skeleton ─────────────────────────────────────────────
  if (!hasFetched) {
    return (
      <div
        className="bg-surface rounded-2xl border border-border p-4 h-[160px] animate-pulse opacity-60"
        aria-hidden
      />
    );
  }

  // ── Compose view ─────────────────────────────────────────
  // Done state intentionally removed — the parent (/home) gates
  // whether to render this component based on today's presence
  // entries. Once the user submits, DailyPulseCard takes over the
  // done-card rendering so all three pulses (morning / mid-day /
  // evening) sit in a single chronological list.
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-surface p-4 space-y-4">
        {/* 1. Attention — typography matches the morning/evening pulse
             prompt (text-lg / font-medium / leading-snug) and the
             input mirrors the pulse textarea (text-[17px] / leading-
             relaxed) so the surface feels like a third pulse. */}
        <div className="space-y-2">
          <label className="text-lg text-text-primary font-medium leading-snug block">
            {t('presence.intro')}
          </label>
          <input
            type="text"
            value={attention}
            onChange={(e) => setAttention(e.target.value.slice(0, 80))}
            placeholder={t('presence.attentionPlaceholder')}
            className="w-full px-4 py-3.5 bg-bg border border-border rounded-xl text-[17px] leading-relaxed text-text-primary outline-none focus:border-primary placeholder:text-text-tertiary"
          />
        </div>

        {/* 2. One word — body emoji-scale removed per user feedback;
             past entries that captured a body_score still display it
             via PauseCard (BODY_SCALE retained for that lookup). */}
        <div className="space-y-2">
          <label className="text-lg text-text-primary font-medium leading-snug block">
            {t('presence.oneWordPrompt')}
          </label>
          <input
            type="text"
            value={oneWord}
            onChange={(e) => setOneWord(e.target.value.slice(0, 24).replace(/\s+/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSave) {
                e.preventDefault();
                void handleSave();
              }
            }}
            placeholder={t('presence.oneWordPlaceholder')}
            className="w-full px-4 py-3.5 bg-bg border border-border rounded-xl text-[17px] leading-relaxed text-text-primary outline-none focus:border-primary placeholder:text-text-tertiary"
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full py-3.5 rounded-2xl bg-primary text-white text-base font-semibold disabled:opacity-40"
        >
          {saving ? t('common.saving') : t('presence.save')}
        </button>
      </div>
    </div>
  );
}
