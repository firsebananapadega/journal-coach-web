'use client';

// Daily gratitude ritual surface — mounted at the top of
// /notebooks/gratitude (BookPage detects slug='gratitude' and injects
// this component). Two states:
//
//   • Empty (today not yet saved) — three numbered slots, each with
//     an optional "why" sub-field. Save enabled when ≥1 slot has a
//     non-empty `what`. Voice mic on the *what* field only (the why
//     is reflective; voice on it would feel forced — research-backed
//     anti-pattern, see plan).
//
//   • Filled (today already done) — soft summary card with the 3
//     lines, "edit" link to flip back to the form pre-populated with
//     the existing items.
//
// One journal_entries row per user-local day:
//   entry_type='gratitude'
//   metadata.gratitude_items = [{ what, why }, …]
//   metadata.gratitude_date  = 'YYYY-MM-DD' (user-local)
//
// Re-saves on the same day update the SAME row (upsert in
// journalStore.upsertTodayGratitude).

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useJournalStore, type JournalEntry } from '@/stores/journalStore';
import { useUiStore } from '@/stores/uiStore';
import { useSelectionAwareMic } from '@/hooks/useSelectionAwareMic';
import { isSpeechRecognitionSupported } from '@/lib/speechRecognition';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';
import { getLanguage } from '@/lib/language';

interface Props {
  notebookId: string;
}

interface SlotState {
  what: string;
  why: string;
}

const EMPTY_SLOTS: SlotState[] = [
  { what: '', why: '' },
  { what: '', why: '' },
  { what: '', why: '' },
];

function todayLocalDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function MicGlyph({ isListening }: { isListening: boolean }) {
  return isListening ? (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  ) : (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

export default function GratitudeDailyCard({ notebookId }: Props) {
  const entries = useJournalStore((s) => s.entries);
  const upsert = useJournalStore((s) => s.upsertTodayGratitude);
  const showToast = useUiStore((s) => s.showToast);

  const [speechSupported] = useState(
    () => typeof window !== 'undefined' && isSpeechRecognitionSupported(),
  );

  // Find today's gratitude row in-store. The store is the source of
  // truth (fetchEntries already loaded the user's recent set).
  const todayDateStr = useMemo(() => todayLocalDateStr(), []);
  const todayEntry: JournalEntry | undefined = useMemo(() => {
    return entries.find(
      (e) =>
        e.entry_type === 'gratitude' &&
        (e.metadata as { gratitude_date?: string } | null)?.gratitude_date === todayDateStr,
    );
  }, [entries, todayDateStr]);

  // Derive structured items from the row when it exists.
  const todayItems = useMemo<SlotState[] | null>(() => {
    if (!todayEntry) return null;
    const meta = todayEntry.metadata as { gratitude_items?: SlotState[] } | null;
    return meta?.gratitude_items ?? null;
  }, [todayEntry]);

  // Local form state. When the user is editing a previously-saved
  // entry we hydrate from todayItems; when starting fresh we begin
  // with three empty slots.
  const [editing, setEditing] = useState<boolean>(!todayEntry);
  const [slots, setSlots] = useState<SlotState[]>(() => EMPTY_SLOTS.map((s) => ({ ...s })));
  const [saving, setSaving] = useState(false);

  // Hydrate the form whenever today's entry materializes / changes
  // (e.g. another device wrote an entry mid-session).
  useEffect(() => {
    if (todayItems && todayItems.length > 0) {
      const hydrated: SlotState[] = [
        todayItems[0] ?? { what: '', why: '' },
        todayItems[1] ?? { what: '', why: '' },
        todayItems[2] ?? { what: '', why: '' },
      ].map((s) => ({ what: s.what ?? '', why: s.why ?? '' }));
      setSlots(hydrated);
    } else if (!todayEntry) {
      setSlots(EMPTY_SLOTS.map((s) => ({ ...s })));
    }
  }, [todayItems, todayEntry]);

  // Refs for the three "what" textareas so the mic hooks can target
  // each independently. Pre-allocate three (matching the slot cap)
  // so we don't violate the rules of hooks — same trick used in
  // WoopSheet.
  const whatRef0 = useRef<HTMLTextAreaElement | null>(null);
  const whatRef1 = useRef<HTMLTextAreaElement | null>(null);
  const whatRef2 = useRef<HTMLTextAreaElement | null>(null);
  const whatRefs = [whatRef0, whatRef1, whatRef2];

  const updateSlot = (idx: number, patch: Partial<SlotState>) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const mic0 = useSelectionAwareMic({
    textareaRef: whatRef0,
    value: slots[0].what,
    onChange: (next) => updateSlot(0, { what: next.slice(0, 200) }),
  });
  const mic1 = useSelectionAwareMic({
    textareaRef: whatRef1,
    value: slots[1].what,
    onChange: (next) => updateSlot(1, { what: next.slice(0, 200) }),
  });
  const mic2 = useSelectionAwareMic({
    textareaRef: whatRef2,
    value: slots[2].what,
    onChange: (next) => updateSlot(2, { what: next.slice(0, 200) }),
  });
  const mics = [mic0, mic1, mic2];

  const canSave = slots.some((s) => s.what.trim().length > 0) && !saving;

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await upsert({ notebookId, items: slots });
      if (result) {
        showToast(t('gratitude.daily.savedToast'), 'success');
        setEditing(false);
      }
    } catch (err) {
      console.warn('[GratitudeDailyCard] save failed', err);
      showToast(t('gratitude.daily.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = () => {
    setEditing(true);
  };

  const dateLabel = useMemo(() => {
    return new Date().toLocaleDateString(getLanguage(), {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }, []);

  // FILLED VIEW — today's three already saved.
  if (!editing && todayEntry && todayItems && todayItems.length > 0) {
    return (
      <motion.section
        layout
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="bg-surface rounded-2xl border border-border p-4 shadow-warm-sm space-y-3"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-success" aria-hidden>✓</span>
            <h2 className="text-sm font-semibold text-text-primary">
              {t('gratitude.daily.done')}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleEdit}
            className="text-xs font-medium text-primary hover:underline"
          >
            {t('gratitude.daily.edit')}
          </button>
        </div>
        <ol className="space-y-2 list-none">
          {todayItems.map((it, i) => (
            <li key={i} className="text-sm leading-relaxed">
              <span className="text-text-tertiary mr-1.5">{i + 1}.</span>
              <span className="text-text-primary font-medium">{it.what}</span>
              {it.why && (
                <span className="text-text-secondary"> — {it.why}</span>
              )}
            </li>
          ))}
        </ol>
      </motion.section>
    );
  }

  // EMPTY / EDITING VIEW — form.
  return (
    <motion.section
      layout
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-surface rounded-2xl border border-primary/20 p-4 shadow-warm-sm space-y-4"
    >
      <div>
        <h2 className="text-base font-bold text-text-primary leading-snug flex items-center gap-2">
          <span className="text-primary" aria-hidden>✦</span>
          {t('gratitude.daily.title')}
        </h2>
        <p className="text-xs text-text-tertiary mt-0.5">{dateLabel}</p>
        <p className="text-sm text-text-secondary mt-2 leading-relaxed">
          {t('gratitude.daily.prompt')}
        </p>
      </div>

      <div className="space-y-3">
        {slots.map((slot, i) => {
          const slotRef = whatRefs[i];
          const slotMic = mics[i];
          const placeholderKey = `gratitude.daily.placeholder${i + 1}` as const;
          return (
            <div key={i} className="space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="shrink-0 mt-2.5 w-5 text-sm font-semibold text-text-tertiary tabular-nums">
                  {i + 1}.
                </span>
                <div className="relative flex-1">
                  <textarea
                    ref={slotRef}
                    value={slot.what}
                    onChange={(e) => updateSlot(i, { what: e.target.value.slice(0, 200) })}
                    placeholder={t(placeholderKey)}
                    rows={1}
                    className="w-full pl-3 pr-12 py-2.5 bg-bg border border-border rounded-xl text-[15px] leading-relaxed text-text-primary outline-none focus:border-primary placeholder:text-text-tertiary resize-none"
                  />
                  {speechSupported && slotMic && (
                    <button
                      type="button"
                      {...slotMic.micButtonProps}
                      aria-label={
                        slotMic.isListening
                          ? t('template.stopRecording')
                          : t('template.tapToSpeak')
                      }
                      className={`absolute top-1/2 right-2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-warm-sm ${
                        slotMic.isListening
                          ? 'bg-error text-white scale-105'
                          : 'bg-surface border border-border text-text-secondary hover:text-primary hover:border-primary/50'
                      }`}
                    >
                      <MicGlyph isListening={slotMic.isListening} />
                    </button>
                  )}
                </div>
              </div>
              <input
                type="text"
                value={slot.why}
                onChange={(e) => updateSlot(i, { why: e.target.value.slice(0, 200) })}
                placeholder={t('gratitude.daily.whyPlaceholder')}
                className="block w-full ml-7 pl-3 pr-3 py-1.5 bg-transparent border-0 border-b border-dashed border-border focus:border-primary text-[13px] text-text-secondary outline-none placeholder:text-text-tertiary"
                style={{ width: 'calc(100% - 1.75rem)' }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        {todayEntry && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="text-xs font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
        )}
        <motion.button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
          className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold shadow-warm-sm disabled:opacity-40 hover:bg-primary-dark transition-colors"
        >
          {saving ? t('common.saving') : t('gratitude.daily.save')}
        </motion.button>
      </div>

      <AnimatePresence />
    </motion.section>
  );
}
