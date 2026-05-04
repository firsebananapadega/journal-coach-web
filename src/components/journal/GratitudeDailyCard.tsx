'use client';

// Daily gratitude ritual surface — mounted at the top of
// /notebooks/gratitude (BookPage detects slug='gratitude' and injects
// this component).
//
// Batch pattern (per user feedback, replacing the earlier
// one-at-a-time):
//   • Up to 3 (what + why) slots; starts with 1.
//   • "+ Add another" appends a slot below (max 3).
//   • Each slot has a "what" textarea and an optional "why" input.
//   • A SINGLE shared tap-to-speak button at the bottom. Dictation
//     follows whichever field the user is currently focused on, so
//     the user can tap the "why" field mid-recording and the next
//     transcript chunk lands there instead of in "what".
//   • One "Save" tap saves all non-empty slots in a single batch.
//   • Below the inputs: "Today's so far" — read-only list of items
//     written earlier today.
//
// One journal_entries row per user-local day:
//   entry_type='gratitude'
//   metadata.gratitude_items = [{ what, why }, …]   (grows as you save)
//   metadata.gratitude_date  = 'YYYY-MM-DD' (user-local)

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useJournalStore, type JournalEntry } from '@/stores/journalStore';
import { useUiStore } from '@/stores/uiStore';
import { isSpeechRecognitionSupported, startListening } from '@/lib/speechRecognition';
import { getLanguage } from '@/lib/language';
import { playCaptureStart, playCaptureStop } from '@/lib/audioCues';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';
import TapToSpeakButton from '@/components/TapToSpeakButton';

interface Props {
  notebookId: string;
}

interface SavedItem {
  what: string;
  why: string;
}

type SlotField = 'what' | 'why';
type FocusTarget = { slot: number; field: SlotField };

const MAX_SLOTS = 3;
const WHAT_MAX = 200;
const WHY_MAX = 200;

function todayLocalDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function GratitudeDailyCard({ notebookId }: Props) {
  const entries = useJournalStore((s) => s.entries);
  const append = useJournalStore((s) => s.appendTodayGratitude);
  const showToast = useUiStore((s) => s.showToast);

  const [speechSupported] = useState(
    () => typeof window !== 'undefined' && isSpeechRecognitionSupported(),
  );

  const todayDateStr = useMemo(() => todayLocalDateStr(), []);
  const todayEntry: JournalEntry | undefined = useMemo(() => {
    return entries.find(
      (e) =>
        e.entry_type === 'gratitude' &&
        (e.metadata as { gratitude_date?: string } | null)?.gratitude_date === todayDateStr,
    );
  }, [entries, todayDateStr]);

  const todayItems: SavedItem[] = useMemo(() => {
    if (!todayEntry) return [];
    const meta = todayEntry.metadata as { gratitude_items?: SavedItem[] } | null;
    return (meta?.gratitude_items ?? []).filter((it) => it && it.what);
  }, [todayEntry]);

  const [slots, setSlots] = useState<SavedItem[]>([{ what: '', why: '' }]);
  const [saving, setSaving] = useState(false);

  // Focus-tracking — drives where mic dictation lands. Updated by
  // each input's onFocus. The ref mirrors the state so the speech
  // result callback (registered once at mic-start) reads the LATEST
  // target after the user re-taps mid-recording.
  const [focused, setFocused] = useState<FocusTarget>({ slot: 0, field: 'what' });
  const focusedRef = useRef<FocusTarget>(focused);
  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);

  // Auto-focus the first "what" textarea on mount.
  const firstWhatRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    firstWhatRef.current?.focus();
  }, []);

  // ─── Shared mic ────────────────────────────────────────────
  // Single recognizer — dictation appends to whichever field is
  // currently focused, so tapping "why" mid-recording rerouts the
  // next chunk there. We compute deltas against `transcriptBaselineRef`
  // (the running transcript at the point of the LAST onResult call).
  const [isListening, setIsListening] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const transcriptBaselineRef = useRef('');

  const updateField = (slot: number, field: SlotField, value: string) => {
    setSlots((prev) =>
      prev.map((s, i) =>
        i === slot
          ? {
              ...s,
              [field]: value.slice(0, field === 'what' ? WHAT_MAX : WHY_MAX),
            }
          : s,
      ),
    );
  };

  const handleSpeechResult = (transcript: string) => {
    const baseline = transcriptBaselineRef.current;
    const delta =
      transcript.length >= baseline.length && transcript.startsWith(baseline)
        ? transcript.slice(baseline.length)
        : transcript;
    const piece = delta.trim();
    if (!piece) return;
    transcriptBaselineRef.current = transcript;
    const target = focusedRef.current;
    setSlots((prev) =>
      prev.map((s, i) => {
        if (i !== target.slot) return s;
        const current = s[target.field] ?? '';
        const sep = current && !/\s$/.test(current) ? ' ' : '';
        const max = target.field === 'what' ? WHAT_MAX : WHY_MAX;
        const next = (current + sep + piece).slice(0, max);
        return { ...s, [target.field]: next };
      }),
    );
  };

  const startMic = () => {
    transcriptBaselineRef.current = '';
    const cleanup = startListening({
      continuous: true,
      language: getLanguage(),
      onStart: () => setIsListening(true),
      onResult: handleSpeechResult,
      onEnd: () => {
        stopRef.current = null;
        setIsListening(false);
        playCaptureStop();
      },
      onError: (err) => {
        stopRef.current = null;
        setIsListening(false);
        playCaptureStop();
        const lower = (err ?? '').toLowerCase();
        if (lower.includes('not-allowed') || lower.includes('denied')) {
          showToast(t('onboarding.capture.micDenied'), 'error');
        } else if (err === 'start-timeout' || lower.includes('not supported')) {
          showToast(t('onboarding.capture.micUnsupported'), 'error');
        } else {
          showToast(t('onboarding.capture.micFailed'), 'error');
        }
      },
    });
    if (cleanup) {
      stopRef.current = cleanup;
      setIsListening(true);
      playCaptureStart();
    } else {
      showToast(t('onboarding.capture.micUnsupported'), 'error');
    }
  };

  const stopMic = () => {
    stopRef.current?.();
    stopRef.current = null;
    setIsListening(false);
    playCaptureStop();
  };

  const toggleMic = () => {
    if (isListening) stopMic();
    else startMic();
  };

  // Stop the mic if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      stopRef.current?.();
      stopRef.current = null;
    };
  }, []);

  const dateLabel = useMemo(() => {
    return new Date().toLocaleDateString(getLanguage(), {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }, []);

  const filledCount = slots.filter((s) => s.what.trim().length > 0).length;
  const canSave = filledCount > 0 && !saving;
  const canAddMore = slots.length < MAX_SLOTS;

  const handleAddSlot = () => {
    if (!canAddMore) return;
    setSlots((prev) => {
      const next = [...prev, { what: '', why: '' }];
      // Jump focus to the new slot's "what" so the user can keep
      // typing or speak straight in. The auto-focus effect below
      // handles actually moving the cursor.
      setFocused({ slot: next.length - 1, field: 'what' });
      return next;
    });
  };

  const handleRemoveSlot = (idx: number) => {
    if (slots.length <= 1) return;
    setSlots((prev) => prev.filter((_, i) => i !== idx));
    setFocused((prev) => {
      // If we removed the focused slot, snap focus back to slot 0.
      if (prev.slot === idx) return { slot: 0, field: 'what' };
      if (prev.slot > idx) return { slot: prev.slot - 1, field: prev.field };
      return prev;
    });
  };

  // Auto-focus newly-added slots. We track the previous slot count
  // so we only fire when slots GREW.
  const prevSlotCountRef = useRef(slots.length);
  const newSlotRefs = useRef<Map<number, HTMLTextAreaElement | null>>(new Map());
  useEffect(() => {
    if (slots.length > prevSlotCountRef.current) {
      const newIdx = slots.length - 1;
      const el = newSlotRefs.current.get(newIdx);
      el?.focus();
    }
    prevSlotCountRef.current = slots.length;
  }, [slots.length]);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const result = await append({
        notebookId,
        items: slots,
      });
      if (result) {
        showToast(t('gratitude.daily.savedToast'), 'success');
        // Reset to a single empty slot so the user can add more
        // later in the day.
        setSlots([{ what: '', why: '' }]);
        setFocused({ slot: 0, field: 'what' });
        firstWhatRef.current?.focus();
      } else {
        showToast(t('gratitude.daily.saveFailed'), 'error');
      }
    } catch (err) {
      console.warn('[GratitudeDailyCard] save failed', err);
      showToast(t('gratitude.daily.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const placeholderForSlot = (idx: number) => {
    if (idx === 0) return t('gratitude.daily.placeholder1');
    if (idx === 1) return t('gratitude.daily.placeholder2');
    return t('gratitude.daily.placeholder3');
  };

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

      {/* Slot stack — up to 3. Each slot has its own what + why
          inputs; the mic at the bottom is shared. */}
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {slots.map((slot, idx) => (
            <motion.div
              key={idx}
              layout
              initial={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
              animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="space-y-1.5"
            >
              <div className="flex items-start gap-2">
                <span
                  className="text-[11px] uppercase tracking-widest text-text-tertiary font-semibold tabular-nums pt-3 w-5 text-right"
                  aria-hidden
                >
                  {idx + 1}.
                </span>
                <div className="flex-1 space-y-1.5">
                  <textarea
                    ref={(el) => {
                      newSlotRefs.current.set(idx, el);
                      if (idx === 0) firstWhatRef.current = el;
                    }}
                    value={slot.what}
                    onChange={(e) => updateField(idx, 'what', e.target.value)}
                    onFocus={() => setFocused({ slot: idx, field: 'what' })}
                    placeholder={placeholderForSlot(idx)}
                    rows={1}
                    className="block w-full px-3 py-2.5 bg-bg border border-border rounded-xl text-[15px] leading-relaxed text-text-primary outline-none focus:border-primary placeholder:text-text-tertiary resize-none"
                  />
                  <input
                    type="text"
                    value={slot.why}
                    onChange={(e) => updateField(idx, 'why', e.target.value)}
                    onFocus={() => setFocused({ slot: idx, field: 'why' })}
                    placeholder={t('gratitude.daily.whyPlaceholder')}
                    className="block w-full pl-3 pr-3 py-1.5 bg-transparent border-0 border-b border-dashed border-border focus:border-primary text-[13px] text-text-secondary outline-none placeholder:text-text-tertiary"
                  />
                </div>
                {slots.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveSlot(idx)}
                    aria-label={t('gratitude.daily.removeOne')}
                    className="shrink-0 mt-2 w-7 h-7 flex items-center justify-center rounded-full text-text-tertiary hover:text-error hover:bg-error/10 transition-colors"
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {canAddMore && (
          <button
            type="button"
            onClick={handleAddSlot}
            className="text-sm font-semibold text-primary hover:underline"
          >
            {t('gratitude.daily.addAnother')}
          </button>
        )}

        {speechSupported && (
          <TapToSpeakButton
            isListening={isListening}
            onClick={toggleMic}
          />
        )}
      </div>

      <div className="flex items-center justify-end pt-1">
        <motion.button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
          className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold shadow-warm-sm disabled:opacity-40 hover:bg-primary-dark transition-colors"
        >
          {saving ? t('common.saving') : t('common.save')}
        </motion.button>
      </div>

      {/* Today's saved list — appears once at least one item has
          landed. Read-only here; user edits via the entry-detail
          page or deletes via the feed below. */}
      <AnimatePresence>
        {todayItems.length > 0 && (
          <motion.div
            initial={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            className="pt-3 border-t border-border space-y-2"
          >
            <p className="text-[11px] uppercase tracking-widest text-text-tertiary font-semibold">
              {t('gratitude.daily.soFar')}
            </p>
            <ol className="space-y-2 list-none">
              {todayItems.map((it, i) => (
                <li key={i} className="text-sm leading-relaxed">
                  <span className="text-text-tertiary mr-1.5 tabular-nums">{i + 1}.</span>
                  <span className="text-text-primary font-medium">{it.what}</span>
                  {it.why && (
                    <span className="text-text-secondary"> — {it.why}</span>
                  )}
                </li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
