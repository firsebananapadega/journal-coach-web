'use client';

// Daily gratitude ritual surface — mounted at the top of
// /notebooks/gratitude (BookPage detects slug='gratitude' and injects
// this component).
//
// One-at-a-time pattern (per user feedback):
//   • Single textarea ("what") + optional input ("why").
//   • Mic button is OUTSIDE the textarea — sibling on the right, not
//     an absolute overlay.
//   • Save → appends ONE item to today's gratitude entry's
//     metadata.gratitude_items array (creates the entry if first
//     save of the day). Inputs clear afterward so the user can
//     write another.
//   • Below the input: "Today's so far" — numbered list of items
//     written today. No inline edit/delete (the entry-detail page
//     handles edit; the feed below handles deletion).
//
// One journal_entries row per user-local day:
//   entry_type='gratitude'
//   metadata.gratitude_items = [{ what, why }, …]   (grows over the day)
//   metadata.gratitude_date  = 'YYYY-MM-DD' (user-local)

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useJournalStore, type JournalEntry } from '@/stores/journalStore';
import { useUiStore } from '@/stores/uiStore';
import { useSelectionAwareMic } from '@/hooks/useSelectionAwareMic';
import { isSpeechRecognitionSupported } from '@/lib/speechRecognition';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';
import { getLanguage } from '@/lib/language';
import TapToSpeakButton from '@/components/TapToSpeakButton';

interface Props {
  notebookId: string;
}

interface SavedItem {
  what: string;
  why: string;
}

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

  // Today's gratitude entry (if any). Drives the "so far" list and
  // tells us whether to start in append mode (with the list visible)
  // or empty mode.
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

  const [what, setWhat] = useState('');
  const [why, setWhy] = useState('');
  const [saving, setSaving] = useState(false);
  const whatRef = useRef<HTMLTextAreaElement | null>(null);

  const mic = useSelectionAwareMic({
    textareaRef: whatRef,
    value: what,
    onChange: (next) => setWhat(next.slice(0, 200)),
  });

  const dateLabel = useMemo(() => {
    return new Date().toLocaleDateString(getLanguage(), {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }, []);

  const canSave = what.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const result = await append({
        notebookId,
        item: { what, why },
      });
      if (result) {
        showToast(t('gratitude.daily.savedToast'), 'success');
        setWhat('');
        setWhy('');
        // Re-focus the "what" field for the next item.
        whatRef.current?.focus();
      }
    } catch (err) {
      console.warn('[GratitudeDailyCard] save failed', err);
      showToast(t('gratitude.daily.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // Auto-focus the input on mount so the user can just start typing.
  useEffect(() => {
    whatRef.current?.focus();
  }, []);

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

      {/* "what" textarea, "why" input, and a BELOW-input
          tap-to-speak button. The mic moved out of the textbox so
          the input has full text room and the speak affordance
          stands out. */}
      <div className="space-y-2">
        <textarea
          ref={whatRef}
          value={what}
          onChange={(e) => setWhat(e.target.value.slice(0, 200))}
          placeholder={t('gratitude.daily.placeholderSingle')}
          rows={1}
          className="block w-full px-3 py-2.5 bg-bg border border-border rounded-xl text-[15px] leading-relaxed text-text-primary outline-none focus:border-primary placeholder:text-text-tertiary resize-none"
        />
        <input
          type="text"
          value={why}
          onChange={(e) => setWhy(e.target.value.slice(0, 200))}
          placeholder={t('gratitude.daily.whyPlaceholder')}
          className="block w-full pl-3 pr-3 py-1.5 bg-transparent border-0 border-b border-dashed border-border focus:border-primary text-[13px] text-text-secondary outline-none placeholder:text-text-tertiary"
        />
        {speechSupported && (
          <TapToSpeakButton
            isListening={mic.isListening}
            {...mic.micButtonProps}
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
