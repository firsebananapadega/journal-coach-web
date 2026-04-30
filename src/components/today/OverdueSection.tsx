'use client';

// OverdueSection — top-of-/today surface for tasks whose due date
// has passed. Per the research synthesis (overdue UX recommendation):
//
//   * Warm amber treatment, NOT red — Things 3 / Tingdo prove calm
//     beats aggressive for a "warm" brand. Aggressive red would make
//     /today feel hostile, the exact thing the user wants to avoid.
//   * Manual rollforward only ("Move all →" + per-item swipe).
//     Auto-rollforward would turn /today into a backlog dump for a
//     voice-first capture app. Manual preserves the daily planning
//     moment.
//   * Visual cap at 7 — section collapses when overdue > 7 with a
//     "+ N more (tap to expand)" affordance.
//   * Stale prompt at 14+ days — "Still relevant?" sub-row offering
//     Archive / Today / Reschedule. Respects user agency vs. auto-
//     archive (Sunsama's pattern).
//   * Bankruptcy banner at 30+ — one-tap "Archive all overdue" for
//     users who've fallen off the wagon. Borrowed from Todoist's own
//     "todo list bankruptcy" essay.
//
// File: this is a presentation component. State (collapse, etc.)
// lives here. Mutations (bulkSetDueDate, bulkArchive) come in via
// props from the parent (today/priorities page).

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUiStore } from '@/stores/uiStore';
import type { Task } from '@/stores/taskStore';
import {
  formatOverdueAge,
  isStale,
  OVERDUE_VISIBLE_CAP,
  BANKRUPTCY_THRESHOLD,
} from '@/lib/overdueUtils';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';

interface Props {
  /** All overdue tasks (already filtered by isOverdue). The section
   *  hides itself when this is empty, so the parent doesn't need to
   *  conditionally mount us. */
  tasks: Task[];
  /** Today as YYYY-MM-DD — passed in so the parent's existing
   *  todayDateStr stays the source of truth (avoids races with system
   *  clock readers across midnight). */
  todayStr: string;
  /** Bulk-set due_date on the given task ids. Used for "Move all →"
   *  and per-item swipe-to-Today / Tomorrow. */
  onBulkSetDueDate: (ids: string[], dueDate: string | null) => Promise<void>;
  /** Bulk-archive the given task ids. Used by stale-prompt Archive
   *  and the bankruptcy banner. */
  onBulkArchive: (ids: string[]) => Promise<void>;
  /** Tap an item → open detail / inline edit. Mirrors how the today
   *  list handles item taps. */
  onTapTask?: (task: Task) => void;
}

export default function OverdueSection({
  tasks,
  todayStr,
  onBulkSetDueDate,
  onBulkArchive,
  onTapTask,
}: Props) {
  const showToast = useUiStore((s) => s.showToast);
  const [expanded, setExpanded] = useState(false);

  // Sort: oldest first (the most-stale at the top so they're seen).
  const sorted = useMemo(
    () => [...tasks].sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')),
    [tasks],
  );

  if (sorted.length === 0) return null;

  const visibleTasks = expanded ? sorted : sorted.slice(0, OVERDUE_VISIBLE_CAP);
  const hiddenCount = Math.max(0, sorted.length - visibleTasks.length);
  const showBankruptcyBanner = sorted.length >= BANKRUPTCY_THRESHOLD;

  const handleMoveAll = async () => {
    const ids = sorted.map((t) => t.id);
    await onBulkSetDueDate(ids, todayStr);
    showToast(
      t('overdue.movedToast', {
        count: String(ids.length),
        label: ids.length === 1 ? t('overdue.taskWord') : t('overdue.tasksWord'),
      }),
      'success',
    );
  };

  const handleArchiveAll = async () => {
    const ok = window.confirm(t('overdue.archiveAllConfirm', { count: String(sorted.length) }));
    if (!ok) return;
    const ids = sorted.map((t) => t.id);
    await onBulkArchive(ids);
    showToast(t('overdue.archivedToast', { count: String(ids.length) }), 'info');
  };

  return (
    <motion.section
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-2"
      aria-label="Overdue tasks"
    >
      {/* Bankruptcy banner — only at 30+ overdue. One-tap nuke. */}
      {showBankruptcyBanner && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-3">
          <span className="text-lg" aria-hidden>📦</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary leading-snug">
              {t('overdue.bankruptcyTitle', { count: String(sorted.length) })}
            </p>
            <p className="text-xs text-text-tertiary mt-0.5 leading-snug">
              {t('overdue.bankruptcyHint')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleArchiveAll}
            className="shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:underline whitespace-nowrap"
          >
            {t('overdue.archiveAll')}
          </button>
        </div>
      )}

      {/* Section header — count + "Move all →" bulk action. Warm
          amber dot + label, NOT red. */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="w-1.5 h-1.5 rounded-full bg-amber-500"
          />
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            {t('overdue.label')} · {sorted.length}
          </span>
        </div>
        <button
          type="button"
          onClick={handleMoveAll}
          className="text-xs font-semibold text-primary hover:underline"
        >
          {t('overdue.moveAll')}
        </button>
      </div>

      {/* Items — same general vibe as the regular task rows but with
          a soft amber left-border + inline date stamp. We DON'T reuse
          the SortableTaskCard because overdue items shouldn't be
          drag-reorderable in this section (their natural order is
          age, not user preference). */}
      <ul className="space-y-1.5">
        <AnimatePresence initial={false}>
          {visibleTasks.map((task) => (
            <motion.li
              key={task.id}
              layout
              initial={prefersReducedMotion ? undefined : { opacity: 0, height: 0 }}
              animate={prefersReducedMotion ? undefined : { opacity: 1, height: 'auto' }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <OverdueRow
                task={task}
                todayStr={todayStr}
                onMoveToToday={async () => {
                  await onBulkSetDueDate([task.id], todayStr);
                }}
                onMoveToTomorrow={async () => {
                  const tomorrow = new Date(`${todayStr}T00:00:00`);
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  const yyyy = tomorrow.getFullYear();
                  const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
                  const dd = String(tomorrow.getDate()).padStart(2, '0');
                  await onBulkSetDueDate([task.id], `${yyyy}-${mm}-${dd}`);
                }}
                onArchive={async () => {
                  await onBulkArchive([task.id]);
                }}
                onTap={onTapTask}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {/* Visual cap — "+ N more" expand link. */}
      {hiddenCount > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full text-xs font-medium text-text-tertiary hover:text-text-secondary py-2"
        >
          {t('overdue.expand', { count: String(hiddenCount) })}
        </button>
      )}
      {expanded && sorted.length > OVERDUE_VISIBLE_CAP && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="w-full text-xs font-medium text-text-tertiary hover:text-text-secondary py-2"
        >
          {t('overdue.collapse')}
        </button>
      )}

      {/* Section divider — soft amber to signal "section ends here". */}
      <div className="h-px bg-amber-500/15 mx-1" aria-hidden />
    </motion.section>
  );
}

// ─── Single overdue row ──────────────────────────────────────────────
// Compact card with the task text, age stamp, and (for stale items)
// a "Still relevant?" sub-row exposing Archive / Today / Reschedule.

function OverdueRow({
  task,
  todayStr,
  onMoveToToday,
  onMoveToTomorrow,
  onArchive,
  onTap,
}: {
  task: Task;
  todayStr: string;
  onMoveToToday: () => Promise<void>;
  onMoveToTomorrow: () => Promise<void>;
  onArchive: () => Promise<void>;
  onTap?: (task: Task) => void;
}) {
  const stale = isStale(task, todayStr);
  const ageLabel = formatOverdueAge(task, todayStr);
  return (
    <div className="bg-surface rounded-xl border border-amber-500/20 px-3 py-2.5 shadow-warm-sm">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onTap?.(task)}
          className="flex-1 min-w-0 text-left"
        >
          <p className="text-sm text-text-primary leading-snug truncate">
            {task.text}
          </p>
        </button>
        <span className="shrink-0 text-xs font-medium text-amber-700/80 dark:text-amber-400/80 whitespace-nowrap">
          {ageLabel}
        </span>
      </div>
      {/* Quick actions — single row of compact text buttons. Stays
          calm (no big colored buttons) so it doesn't feel hostile.
          The stale prompt ("Still relevant?") only appears at 14+
          days; for younger overdue items we just show Today / Tomorrow. */}
      <div className="mt-2 flex items-center gap-3 text-xs font-medium">
        {stale && (
          <span className="text-amber-700/70 dark:text-amber-400/70">
            {t('overdue.stillRelevant')}
          </span>
        )}
        <button
          type="button"
          onClick={() => void onMoveToToday()}
          className="text-primary hover:underline"
        >
          {t('overdue.today')}
        </button>
        <button
          type="button"
          onClick={() => void onMoveToTomorrow()}
          className="text-text-secondary hover:text-text-primary"
        >
          {t('overdue.tomorrow')}
        </button>
        {stale && (
          <button
            type="button"
            onClick={() => void onArchive()}
            className="text-text-tertiary hover:text-text-secondary ml-auto"
          >
            {t('overdue.archive')}
          </button>
        )}
      </div>
    </div>
  );
}
