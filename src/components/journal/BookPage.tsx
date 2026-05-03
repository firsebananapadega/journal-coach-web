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
import { SwipeToDelete } from '@/components/SwipeToDelete';
import NotebookSettingsSheet from '@/components/notebooks/NotebookSettingsSheet';
import PlansNotebookHero from '@/components/plans/PlansNotebookHero';
import WoopSheet from '@/components/plans/WoopSheet';
import { usePlanStore } from '@/stores/planStore';
import GratitudeDailyCard from './GratitudeDailyCard';

// Build the plain-text view of any entry (pulse + freeform + guided)
// that the user will paste after swiping to copy. Prefers the polished
// `content_structured` Markdown, falls back to the raw transcript, and
// assembles labeled blocks for pulse entries whose data lives in
// metadata rather than a single text column.
function textForClipboard(entry: JournalEntry): string {
  const structured = (entry.content_structured ?? '').trim();
  if (structured) return structured;
  if (entry.entry_type === 'pulse') {
    const meta = (entry.metadata ?? {}) as Record<string, unknown>;
    const mode = meta.pulseMode === 'morning' || meta.pulseMode === 'evening' ? (meta.pulseMode as string) : '';
    const lines: string[] = [];
    if (mode) lines.push(mode === 'morning' ? 'Morning pulse' : 'Evening pulse');
    const bodyLabel = typeof meta.body_label === 'string' ? meta.body_label : '';
    const mindLabel = typeof meta.mind_label === 'string' ? meta.mind_label : '';
    if (bodyLabel) lines.push(`Body: ${bodyLabel}`);
    if (mindLabel) lines.push(`Mind: ${mindLabel}`);
    const intention = typeof meta.intention === 'string' ? meta.intention.trim() : '';
    const wentRight = typeof meta.wentRight === 'string' ? meta.wentRight.trim() : '';
    const doneBetter = typeof meta.doneBetter === 'string' ? meta.doneBetter.trim() : '';
    if (intention) lines.push(`Intention: ${intention}`);
    if (wentRight) lines.push(`Went right: ${wentRight}`);
    if (doneBetter) lines.push(`Done better: ${doneBetter}`);
    if (lines.length > 0) return lines.join('\n');
  }
  return (entry.content_text ?? '').trim();
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

interface Props {
  // When set, the notebook picker is hidden and the feed is locked
  // to this notebook slug. Used by /notebooks/[slug] routes.
  lockedSlug?: string;
  // Override for the back-button destination. Defaults to router.back().
  backHref?: string;
}

// Module-level scroll-position cache, keyed by notebook slug. The feed
// scrolls inside a custom `overflow-y-auto` div (not the window), so
// the browser's built-in scroll restoration doesn't apply when the
// user navigates to /entry/[id] and back. Persisting the scrollTop
// here gives "Back" the intuitive "stay where I was" behavior. Map
// is module-level so it survives route changes within the SPA but
// resets on a hard reload (which is fine — that's a deliberate refresh).
const scrollPositions = new Map<string, number>();

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
  const softDeleteEntry = useJournalStore((s) => s.softDeleteEntry);
  const hasFetchedEntries = useJournalStore((s) => s.hasFetched);

  const notebooks = useNotebookStore((s) => s.notebooks);
  const fetchNotebooks = useNotebookStore((s) => s.fetchNotebooks);
  const hasFetchedNotebooks = useNotebookStore((s) => s.hasFetched);

  const showToast = useUiStore((s) => s.showToast);

  const [composer, setComposer] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeSlug, setActiveSlug] = useState<string | null>(lockedSlug ?? 'journal');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Composer is hidden by default — a floating + button (bottom-right,
  // above the Patterns tab) opens it. Pulse notebook still suppresses
  // it entirely, since pulse entries come from the morning/evening
  // card on /home, not typed here.
  const [composerOpen, setComposerOpen] = useState(false);
  // WOOP sheet — mounted inline here (vs. on /home) so the Plans
  // notebook page owns the entire planning surface. State is local
  // because nothing outside this component needs to open it.
  const [woopOpen, setWoopOpen] = useState(false);
  const fetchActivePlan = usePlanStore((s) => s.fetchActive);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerStartRef = useRef<number>(Date.now());
  // Ref on the scrollable feed container — captures the user's scroll
  // position and restores it when they navigate back from an entry.
  const feedScrollRef = useRef<HTMLDivElement | null>(null);
  // RAF handle for the scroll-capture debouncer (shared across renders
  // so a quick scroll doesn't queue 60 captures per second).
  const scrollCaptureRafRef = useRef<number | null>(null);
  // Has-fetched flag we already track via store; reading it locally so
  // the restore effect can wait for entries to mount before applying
  // scrollTop (otherwise the container has 0 height and the assignment
  // is a no-op).
  const entriesReady = hasFetchedEntries;

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

  // Restore scroll position when the feed becomes ready (entries
  // hydrated + activeSlug resolved). We wait for `entriesReady` because
  // the container has no scrollHeight until rows render — assigning
  // scrollTop before that would silently no-op. requestAnimationFrame
  // gives the browser one paint to lay out the rows so scrollTop
  // assignment lands on real geometry.
  useEffect(() => {
    if (!entriesReady) return;
    if (!activeSlug) return;
    const remembered = scrollPositions.get(activeSlug);
    if (remembered == null || remembered <= 0) return;
    const id = requestAnimationFrame(() => {
      const el = feedScrollRef.current;
      if (el) el.scrollTop = remembered;
    });
    return () => cancelAnimationFrame(id);
  }, [entriesReady, activeSlug]);

  // Cleanup the rAF handle on unmount so a navigation-away mid-capture
  // doesn't leak.
  useEffect(() => {
    return () => {
      if (scrollCaptureRafRef.current) {
        cancelAnimationFrame(scrollCaptureRafRef.current);
      }
    };
  }, []);

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

  // When the user lands on the Plans notebook, hydrate the active
  // plan so the hero can decide between the "Make a plan" CTA and
  // the ActivePlanCard. fetchActive is a no-op when plans_enabled
  // is false (the user can't reach this surface in that state, but
  // belt-and-braces is cheap).
  useEffect(() => {
    if (activeNotebook?.system_key === 'plans') {
      void fetchActivePlan();
    }
  }, [activeNotebook?.system_key, fetchActivePlan]);

  // Composer is a full-screen overlay now — it fills the flex-1
  // middle region so we don't need to auto-grow the textarea's own
  // height. Leaving the hook removed instead of no-op'd to keep the
  // effect graph honest.

  // Focus the textarea the moment the composer opens so the keyboard
  // comes up without a second tap.
  useEffect(() => {
    if (!composerOpen) return;
    const id = window.setTimeout(() => textareaRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [composerOpen]);

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
      // Close the composer after save — the user came here to see
      // their entries, and the new one now shows in the feed below.
      setComposerOpen(false);
      showToast('Entry saved', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('common.error'), 'error');
    } finally {
      setSaving(false);
    }
  }, [composer, saving, activeNotebook, createEntry, showToast]);

  const canSave = composer.trim().length > 0 && !saving && !!activeNotebook;

  return (
    <div className="relative flex flex-col h-[100dvh] overflow-hidden bg-bg">
      <div
        aria-hidden
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[80vmin] h-[80vmin] rounded-full blur-3xl pointer-events-none opacity-50"
        style={{ background: 'var(--theme-primary-glow)' }}
      />

      {/* Top bar — single row.
          Layout: [Back] (intrinsic, left) — [Notebook pill] (absolutely
          centered) — [Gear] (intrinsic, right). All three sit at the
          same vertical line.
          The notebook pill used to live on a second row to dodge the
          fixed-top-center WallEdgeTab "JOURNAL/TASKS" switcher, but
          that pill is now suppressed on /notebooks/<slug> sub-routes
          (see WallEdgeTab → isWallRootPath check) so the center is
          free again. Reclaiming the row halves the dead vertical
          space above the entry feed. */}
      <div
        className="relative z-10 shrink-0 px-4 h-12 flex items-center justify-between"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <button
          type="button"
          onClick={() => (backHref ? router.push(backHref) : router.back())}
          className="text-sm text-text-tertiary hover:text-text-secondary px-2 shrink-0"
          aria-label={t('common.back')}
        >
          ← {t('common.back')}
        </button>

        {/* Notebook pill — absolutely centered relative to the row so
            varying-width Back/Gear buttons can't push it off-center.
            max-w caps it for very long notebook names; truncate
            handles overflow gracefully. */}
        {activeNotebook && (
          <div
            className="absolute left-1/2 -translate-x-1/2 max-w-[60%] flex flex-col items-center"
            style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
          >
            <button
              type="button"
              onClick={() => !lockedSlug && setPickerOpen((o) => !o)}
              disabled={!!lockedSlug}
              className="flex items-center gap-2 max-w-full h-9 text-base font-semibold text-text-primary disabled:cursor-default"
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: activeNotebook.color }}
                aria-hidden
              />
              <span className="truncate">{activeNotebook.name}</span>
              {!lockedSlug && <span className="text-text-tertiary shrink-0">▾</span>}
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

        {/* Right slot: context-aware gear (notebook settings) for a
            locked-notebook route. The global app-settings gear is
            suppressed in the (app) layout for these routes. */}
        {lockedSlug && activeNotebook ? (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Notebook settings"
            className="w-9 h-9 rounded-full bg-surface/80 backdrop-blur border border-border flex items-center justify-center text-text-secondary hover:text-text-primary shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        ) : (
          <span className="w-9 shrink-0" aria-hidden />
        )}
      </div>

      {/* Feed (scrollable) */}
      <div
        ref={feedScrollRef}
        onScroll={(e) => {
          // Debounced save via rAF — write the scrollTop into the
          // module-level Map so Back-from-entry restores cleanly.
          // Cheap; no React re-render path (we're just mutating a Map).
          if (!activeSlug) return;
          const target = e.currentTarget;
          // Cancel any pending capture frame and schedule a fresh one.
          // We don't bother with a long debounce — even a fast scroll
          // resolves to one Map.set() per animation frame.
          if (scrollCaptureRafRef.current) {
            cancelAnimationFrame(scrollCaptureRafRef.current);
          }
          scrollCaptureRafRef.current = requestAnimationFrame(() => {
            scrollPositions.set(activeSlug, target.scrollTop);
          });
        }}
        className="relative z-10 flex-1 overflow-y-auto"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-md mx-auto px-5 pt-2 pb-28 space-y-5">
          {/* (Composer is now a full-screen overlay mounted near the
              bottom of this component — see `composerOpen` block.) */}

          {/* Plans notebook hero — only on the Plans system notebook.
              Owns the title / description / "Make a plan" CTA / active
              plan card. The Started:/Closed: journal entries below are
              the ongoing history. */}
          {activeNotebook?.system_key === 'plans' && (
            <PlansNotebookHero onTapMake={() => setWoopOpen(true)} />
          )}

          {/* Gratitude daily-ritual card — slug-detected so it works
              for both project (default) AND system (auto-detect on)
              kinds. The structured 3-slot card replaces freeform
              entry on this notebook; the composer FAB is hidden
              below for the same reason. */}
          {activeNotebook && (
            activeNotebook.slug === 'gratitude'
            || activeNotebook.system_key === 'gratitude'
          ) && (
            <GratitudeDailyCard notebookId={activeNotebook.id} />
          )}

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
                  {g.entries.map((e) => {
                    // Pulse entries don't expose copy/delete from
                    // the list — they're a record of a daily check-in
                    // and should be edited inline, not thrown away
                    // or pasted elsewhere. Tap to open in edit view.
                    if (activeNotebook?.system_key === 'pulse') {
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => router.push(`/entry/${e.id}`)}
                          className="block w-full text-left"
                        >
                          <EntryCard entry={e} />
                        </button>
                      );
                    }
                    return (
                      <SwipeToDelete
                        key={e.id}
                        onDelete={() => {
                          const pending = softDeleteEntry(e.id);
                          if (!pending) return;
                          showToast('Entry deleted', 'info', {
                            durationMs: 5000,
                            action: {
                              label: 'Undo',
                              onClick: () => pending.undo(),
                            },
                          });
                        }}
                        onSecondary={async () => {
                          const ok = await copyToClipboard(textForClipboard(e));
                          showToast(ok ? 'Copied to clipboard' : 'Could not copy', ok ? 'success' : 'error');
                        }}
                        secondaryLabel="Copy"
                        secondaryIcon={
                          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        }
                        onTap={() => router.push(`/entry/${e.id}`)}
                      >
                        <EntryCard entry={e} />
                      </SwipeToDelete>
                    );
                  })}
                </div>
              </motion.section>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Floating + button — bottom-right, above the WallNav's
          Patterns tab. Raised high enough that the WallNav + iOS
          home indicator never crowd it. Hidden on Pulse + Plans +
          Gratitude (all non-freeform-write surfaces) and while the
          composer overlay is up. */}
      {activeNotebook?.system_key !== 'pulse'
        && activeNotebook?.system_key !== 'plans'
        && activeNotebook?.slug !== 'gratitude'
        && activeNotebook?.system_key !== 'gratitude'
        && !composerOpen && (
        <motion.button
          type="button"
          onClick={() => setComposerOpen(true)}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.92 }}
          aria-label="New entry"
          className="fixed right-5 z-40 w-14 h-14 rounded-full bg-primary text-white shadow-warm-lg flex items-center justify-center hover:bg-primary-dark transition-colors"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 7.5rem)' }}
        >
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </motion.button>
      )}

      {/* Full-screen composer overlay — mirrors the /journal writing
          surface. Action bar uses `position: fixed` so iOS 16+'s
          Visual Viewport keeps it above the keyboard. Writing area has
          bottom padding so the last line is never hidden behind the
          bar.
          IMPORTANT — animate via opacity, NOT translateY: a `transform`
          on this overlay would create a containing block for its
          descendants, which means the inner `fixed bottom-0` action
          bar would no longer pin to the actual viewport on iOS, and
          the keyboard would push it offscreen along with the content.
          Opacity-only keeps the descendants truly viewport-fixed. */}
      <AnimatePresence>
        {composerOpen && (
          <motion.div
            key="composer-overlay"
            initial={prefersReducedMotion ? undefined : { opacity: 0 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed inset-0 z-[70] bg-bg flex flex-col"
          >
            {/* Top bar: notebook context label + big close button */}
            <div
              className="relative z-10 shrink-0 flex items-center justify-between px-5 pt-3 pb-2"
              style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                {activeNotebook && (
                  <>
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ background: activeNotebook.color }}
                      aria-hidden
                    />
                    <span className="text-[11px] uppercase tracking-widest text-text-tertiary font-semibold truncate">
                      {activeNotebook.name}
                    </span>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setComposerOpen(false);
                  setComposer('');
                  if (isListening) {
                    // Best-effort: the mic hook's button props include
                    // onClick which toggles listening state. Call it
                    // to stop the mic if it's currently on.
                    micButtonProps.onClick?.();
                  }
                }}
                aria-label="Close composer"
                className="w-11 h-11 rounded-full bg-surface-elevated border border-border flex items-center justify-center text-text-secondary hover:text-text-primary"
              >
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Writing surface — same pattern as /journal. The
                `pb-[130px]` keeps the last line clear of the fixed
                action bar regardless of keyboard state. */}
            <div className="relative z-10 flex-1 overflow-y-auto px-6 pt-2 pb-[130px]">
              <div className="max-w-md mx-auto">
                <p className="text-[10px] uppercase tracking-widest text-text-tertiary mb-2">
                  {t('journal.today')}
                </p>
                <textarea
                  ref={textareaRef}
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  placeholder={t('journalWrite.placeholder')}
                  // Fill the visible area between the top header
                  // (~120px) and the fixed save bar (~110px) so the
                  // textarea reaches right above the save button on
                  // modern phone viewports without leaving an empty
                  // strip below it.
                  className="w-full bg-transparent text-base leading-relaxed text-text-primary placeholder:text-text-tertiary/60 border-0 outline-none focus:outline-none focus:ring-0 resize-none"
                  style={{ lineHeight: 1.7, minHeight: 'calc(100dvh - 240px)' }}
                />
              </div>
            </div>

            {/* Action bar — position: fixed so the iOS keyboard can't
                push it offscreen (Visual Viewport tracks fixed-bottom
                elements on iOS 16+). Bottom-padding formula matches
                /guided so the Save button has breathing room above
                the iOS home indicator instead of crowding it. */}
            <div
              className="fixed bottom-0 inset-x-0 z-20 px-6 pt-3 bg-gradient-to-t from-bg via-bg/95 to-transparent"
              style={{ paddingBottom: 'max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))' }}
            >
              <div className="max-w-md mx-auto flex items-center justify-between gap-3">
                <motion.button
                  type="button"
                  {...micButtonProps}
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
                  className={`relative flex items-center justify-center shrink-0 w-14 h-14 rounded-full shadow-warm-md
                    ${isListening ? 'bg-error text-white' : 'bg-surface-elevated border border-border text-primary'}
                    transition-colors`}
                  aria-pressed={isListening}
                  aria-label={isListening ? t('journalWrite.micStop') : t('journalWrite.micStart')}
                >
                  {isListening ? (
                    <span className="block w-3 h-3 rounded-sm bg-white" aria-hidden />
                  ) : (
                    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" x2="12" y1="19" y2="22" />
                    </svg>
                  )}
                  {isListening && (
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 rounded-full border-2 border-error"
                      initial={{ scale: 1, opacity: 0.7 }}
                      animate={{ scale: 1.35, opacity: 0 }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
                    />
                  )}
                </motion.button>

                <motion.button
                  type="button"
                  whileTap={prefersReducedMotion || !canSave ? undefined : { scale: 0.97 }}
                  onClick={handleSave}
                  disabled={!canSave}
                  className="flex-1 py-3.5 rounded-2xl font-semibold text-white shadow-warm-md bg-primary hover:bg-primary-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? t('common.saving') : t('journalWrite.save')}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <NotebookSettingsSheet
        open={settingsOpen}
        notebook={activeNotebook}
        onClose={() => setSettingsOpen(false)}
      />

      {/* WOOP creation sheet — only mountable from the Plans notebook,
          and even then only when the user explicitly taps the CTA.
          Conditional render keeps the heavy 4-step component out of
          the tree on every other notebook view. */}
      {woopOpen && <WoopSheet open onClose={() => setWoopOpen(false)} />}
    </div>
  );
}
