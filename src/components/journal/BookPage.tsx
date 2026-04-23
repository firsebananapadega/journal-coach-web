'use client';

// Shared book-page experience. Reused by /journal (notebook picker
// defaults to Journal, user can switch in-place) and /notebooks/[slug]
// (locked to one notebook via `lockedSlug`).
//
// Layout: top bar with back + notebook indicator, composer card at
// the top for writing a new entry, then reverse-chronological feed
// of previous entries grouped by day, latest on top.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useJournalStore, type JournalEntry } from '@/stores/journalStore';
import { useNotebookStore, type Notebook } from '@/stores/notebookStore';
import { useUiStore } from '@/stores/uiStore';
import { useSelectionAwareMic } from '@/hooks/useSelectionAwareMic';
import { t } from '@/lib/translations';
import { getLocale } from '@/lib/language';
import { prefersReducedMotion } from '@/lib/motionVariants';
import EntryCard from './EntryCard';

interface Props {
  // When set, the notebook picker is hidden and the feed is locked
  // to this notebook slug. Used by /notebooks/[slug] routes.
  lockedSlug?: string;
  // Override for the back-button destination. Defaults to router.back().
  backHref?: string;
}

function dayKey(iso: string): string {
  // Local YYYY-MM-DD so entries captured late at night group with
  // the calendar day the user was actually on.
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDayHeader(key: string): string {
  const locale = getLocale() === 'es' ? 'es-MX' : 'en-US';
  const [y, m, d] = key.split('-').map((n) => parseInt(n, 10));
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const todayKey = dayKey(today.toISOString());
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  if (key === todayKey) return t('journal.today');
  if (key === dayKey(yest.toISOString())) return t('journal.yesterday');
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function BookPage({ lockedSlug, backHref }: Props) {
  const router = useRouter();
  const entries = useJournalStore((s) => s.entries);
  const fetchEntries = useJournalStore((s) => s.fetchEntries);
  const createEntry = useJournalStore((s) => s.createEntry);
  const hasFetchedEntries = useJournalStore((s) => s.hasFetched);

  const notebooks = useNotebookStore((s) => s.notebooks);
  const fetchNotebooks = useNotebookStore((s) => s.fetchNotebooks);
  const hasFetchedNotebooks = useNotebookStore((s) => s.hasFetched);

  const celebrate = useUiStore((s) => s.celebrate);
  const showToast = useUiStore((s) => s.showToast);

  const [composer, setComposer] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeSlug, setActiveSlug] = useState<string | null>(lockedSlug ?? 'journal');
  const [pickerOpen, setPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerStartRef = useRef<number>(Date.now());

  const { isListening, micButtonProps } = useSelectionAwareMic({
    textareaRef,
    value: composer,
    onChange: setComposer,
    autoRestart: true,
  });

  // Boot: fetch notebooks + entries once.
  useEffect(() => {
    if (!hasFetchedNotebooks) fetchNotebooks().catch(() => {});
    if (!hasFetchedEntries) fetchEntries().catch(() => {});
  }, [hasFetchedNotebooks, hasFetchedEntries, fetchNotebooks, fetchEntries]);

  // Resolve the active notebook object from slug.
  const activeNotebook: Notebook | null = useMemo(() => {
    if (!activeSlug) return null;
    return notebooks.find((n) => n.slug === activeSlug) ?? null;
  }, [activeSlug, notebooks]);

  // Reset composer timer whenever the textarea becomes empty again
  // (e.g. right after a save), so duration_seconds is accurate.
  useEffect(() => {
    if (!composer) composerStartRef.current = Date.now();
  }, [composer]);

  // Auto-grow composer textarea to fit content.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(ta.scrollHeight, ta.clientHeight)}px`;
  }, [composer]);

  const filteredEntries = useMemo(() => {
    if (!activeNotebook) return entries;
    return entries.filter((e) => e.notebook_id === activeNotebook.id);
  }, [entries, activeNotebook]);

  const grouped = useMemo(() => {
    const groups = new Map<string, JournalEntry[]>();
    for (const e of filteredEntries) {
      const key = dayKey(e.created_at);
      const list = groups.get(key) ?? [];
      list.push(e);
      groups.set(key, list);
    }
    // Sort days descending, entries within each day descending
    const days = Array.from(groups.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([key, list]) => ({
        key,
        entries: [...list].sort((a, b) =>
          a.created_at < b.created_at ? 1 : -1,
        ),
      }));
    return days;
  }, [filteredEntries]);

  const handleSave = useCallback(async () => {
    const text = composer.trim();
    if (!text || saving || !activeNotebook) return;
    setSaving(true);
    try {
      const duration = Math.round((Date.now() - composerStartRef.current) / 1000);
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      await createEntry({
        entry_type: 'freeform',
        content_text: text,
        title: null,
        duration_seconds: duration,
        word_count: wordCount,
        notebook_id: activeNotebook.id,
      });
      setComposer('');
      celebrate();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('common.error'), 'error');
    } finally {
      setSaving(false);
    }
  }, [composer, saving, activeNotebook, createEntry, celebrate, showToast]);

  const canSave = composer.trim().length > 0 && !saving && !!activeNotebook;

  return (
    <div className="relative flex flex-col h-[100dvh] overflow-hidden bg-bg">
      <div
        aria-hidden
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[80vmin] h-[80vmin] rounded-full blur-3xl pointer-events-none opacity-50"
        style={{ background: 'var(--theme-primary-glow)' }}
      />

      {/* Top bar */}
      <div
        className="relative z-10 shrink-0 flex items-center justify-between px-4 pt-3 pb-2"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <button
          type="button"
          onClick={() => (backHref ? router.push(backHref) : router.back())}
          className="text-sm text-text-tertiary hover:text-text-secondary px-2"
          aria-label={t('common.back')}
        >
          ← {t('common.back')}
        </button>

        {/* Notebook indicator: tap to open picker (unless locked) */}
        {activeNotebook && (
          <div className="relative">
            <button
              type="button"
              onClick={() => !lockedSlug && setPickerOpen((o) => !o)}
              disabled={!!lockedSlug}
              className="flex items-center gap-2 text-sm font-semibold text-text-primary disabled:cursor-default"
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: activeNotebook.color }}
                aria-hidden
              />
              {activeNotebook.name}
              {!lockedSlug && <span className="text-text-tertiary">▾</span>}
            </button>
            {pickerOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setPickerOpen(false)}
                />
                <div className="absolute z-50 top-full mt-1.5 left-1/2 -translate-x-1/2 min-w-[200px] bg-surface-elevated border border-border rounded-2xl shadow-warm-lg py-1">
                  {notebooks.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        setActiveSlug(n.slug);
                        setPickerOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 text-left px-3 py-2 text-sm ${
                        n.slug === activeSlug
                          ? 'text-primary font-semibold'
                          : 'text-text-secondary hover:bg-surface'
                      }`}
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ background: n.color }}
                        aria-hidden
                      />
                      {n.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <span className="w-10" />
      </div>

      {/* Feed (scrollable) */}
      <div
        className="relative z-10 flex-1 overflow-y-auto"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-md mx-auto px-5 pt-2 pb-10 space-y-5">
          {/* Composer — today's editable top card */}
          <section className="relative bg-surface-elevated/70 border border-border rounded-2xl p-4 shadow-warm-md backdrop-blur">
            <p className="text-[10px] uppercase tracking-widest text-text-tertiary mb-2">
              {t('journal.today')}
            </p>
            <textarea
              ref={textareaRef}
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              placeholder={t('journalWrite.placeholder')}
              className="w-full min-h-[88px] bg-transparent text-[15px] text-text-primary placeholder:text-text-tertiary/60 border-0 outline-none focus:outline-none focus:ring-0 resize-none"
              style={{ lineHeight: 1.6 }}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <motion.button
                type="button"
                {...micButtonProps}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
                className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-warm-sm
                  ${isListening ? 'bg-error text-white' : 'bg-surface border border-border text-primary'}
                  transition-colors`}
                aria-pressed={isListening}
                aria-label={isListening ? t('journalWrite.micStop') : t('journalWrite.micStart')}
              >
                {isListening ? (
                  <span className="block w-2.5 h-2.5 rounded-sm bg-white" aria-hidden />
                ) : (
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                )}
              </motion.button>

              <motion.button
                type="button"
                whileTap={prefersReducedMotion || !canSave ? undefined : { scale: 0.97 }}
                onClick={handleSave}
                disabled={!canSave}
                className="flex-1 py-2.5 rounded-xl font-semibold text-white text-sm bg-primary hover:bg-primary-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? t('common.saving') : t('journalWrite.save')}
              </motion.button>
            </div>
          </section>

          {/* Day groups */}
          <AnimatePresence mode="popLayout">
            {grouped.length === 0 && (
              <motion.p
                key="empty"
                className="text-center text-xs text-text-tertiary py-10"
                initial={prefersReducedMotion ? undefined : { opacity: 0 }}
                animate={prefersReducedMotion ? undefined : { opacity: 1 }}
              >
                {t('journal.noEntries')}
              </motion.p>
            )}
            {grouped.map((g) => (
              <motion.section
                key={g.key}
                layout
                initial={prefersReducedMotion ? undefined : { opacity: 0, y: 6 }}
                animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0 }}
                className="space-y-3"
              >
                <h3 className="sticky top-0 -mx-2 px-2 py-1 bg-bg/80 backdrop-blur text-[11px] uppercase tracking-widest text-text-tertiary font-semibold z-10">
                  {formatDayHeader(g.key)}
                </h3>
                <div className="space-y-3">
                  {g.entries.map((e) => (
                    <EntryCard key={e.id} entry={e} />
                  ))}
                </div>
              </motion.section>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
