'use client';

// OverdueSection — top-of-/today surface for tasks whose due date
// has passed.
//
// Layout:
//   - Collapsible header ("Overdue · N"). Tap to expand/collapse.
//     State persisted in sessionStorage so a tab switch within the
//     same browsing session keeps user's choice.
//   - When expanded, ALL items render (no visual cap).
//   - Each item is a SwipeToDelete row:
//       Swipe RIGHT → "Reschedule" panel reveals on the left;
//                     tapping it opens a date picker sheet.
//       Swipe LEFT  → "Delete" panel reveals on the right;
//                     tapping it deletes the task.
//   - Stale items (14+ days overdue) get a subtle amber dot prefix
//     to flag them in the row, but they're still actionable via the
//     same swipe gestures (no separate "Still relevant?" sub-row).
//   - Header keeps the "Move all →" bulk action.
//   - Bankruptcy banner at 30+ overdue (one-tap "Archive all").
//
// Per the research synthesis: warm amber styling, NOT red — keeps
// the tone calm so the section doesn't feel hostile.

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUiStore } from '@/stores/uiStore';
import { useTaskStore, type Task } from '@/stores/taskStore';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import { formatOverdueAge, isStale, BANKRUPTCY_THRESHOLD } from '@/lib/overdueUtils';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';
import RescheduleSheet from './RescheduleSheet';

const COLLAPSE_KEY = 'overdueCollapsed.v1';

interface Props {
  tasks: Task[];
  todayStr: string;
  onBulkSetDueDate: (ids: string[], dueDate: string | null) => Promise<void>;
  onBulkArchive: (ids: string[]) => Promise<void>;
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
  const removeTask = useTaskStore((s) => s.removeTask);

  // Collapse state persists across page navigations within a session
  // so a quick tab switch doesn't reset what the user just toggled.
  // Default: expanded — overdue items are the whole point of the
  // section, hiding them by default would hide the value too.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const v = window.sessionStorage.getItem(COLLAPSE_KEY);
      if (v === '1') setCollapsed(true);
    } catch {}
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
        } catch {}
      }
      return next;
    });
  };

  // Reschedule sheet — tracks which task the user is rescheduling.
  // Null = closed.
  const [rescheduleTaskId, setRescheduleTaskId] = useState<string | null>(null);
  const rescheduleTask = useMemo(
    () => tasks.find((t) => t.id === rescheduleTaskId) ?? null,
    [tasks, rescheduleTaskId],
  );

  // Sort: oldest-overdue first so the most-stale items are visible
  // at the top of the section without scrolling.
  const sorted = useMemo(
    () => [...tasks].sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')),
    [tasks],
  );

  if (sorted.length === 0) return null;

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
      {showBankruptcyBanner && !collapsed && (
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

      {/* Section header — collapsible, with "Move all →" bulk action.
          Tap the LABEL/CHEVRON to collapse; "Move all" stays its own
          tappable target on the right. */}
      <div className="flex items-center justify-between gap-3 px-1">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex items-center gap-2 text-left"
          aria-expanded={!collapsed}
        >
          <motion.svg
            animate={
              prefersReducedMotion ? undefined : { rotate: collapsed ? -90 : 0 }
            }
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-amber-700 dark:text-amber-400"
            aria-hidden
          >
            <polyline points="6 9 12 15 18 9" />
          </motion.svg>
          <span
            aria-hidden
            className="w-1.5 h-1.5 rounded-full bg-amber-500"
          />
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            {t('overdue.label')} · {sorted.length}
          </span>
        </button>
        {!collapsed && (
          <button
            type="button"
            onClick={handleMoveAll}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {t('overdue.moveAll')}
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.ul
            key="list"
            initial={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
            animate={prefersReducedMotion ? undefined : { height: 'auto', opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="space-y-1.5 overflow-hidden"
          >
            {sorted.map((task) => (
              <li key={task.id}>
                <SwipeToDelete
                  onDelete={async () => {
                    await removeTask(task.id);
                  }}
                  onSecondary={() => setRescheduleTaskId(task.id)}
                  secondaryLabel={t('overdue.reschedule')}
                  secondaryBgClass="bg-amber-500/90 text-white"
                  secondaryIcon={
                    <svg
                      width={18}
                      height={18}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  }
                  onTap={() => onTapTask?.(task)}
                >
                  <OverdueRow task={task} todayStr={todayStr} />
                </SwipeToDelete>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {/* Reschedule date picker. Persists the new due_date and dismisses. */}
      {rescheduleTask && (
        <RescheduleSheet
          task={rescheduleTask}
          minDate={todayStr}
          onClose={() => setRescheduleTaskId(null)}
          onConfirm={async (newDate) => {
            await onBulkSetDueDate([rescheduleTask.id], newDate);
            setRescheduleTaskId(null);
            showToast(t('overdue.rescheduledToast'), 'success');
          }}
        />
      )}
    </motion.section>
  );
}

// ─── Single overdue row ──────────────────────────────────────────────
// Compact card: amber left-tinted border, task text, age stamp, and
// (for stale 14+ day items) a small leading dot to draw the eye.

function OverdueRow({ task, todayStr }: { task: Task; todayStr: string }) {
  const stale = isStale(task, todayStr);
  const ageLabel = formatOverdueAge(task, todayStr);
  return (
    <div className="bg-surface rounded-xl border border-amber-500/20 px-3 py-3 shadow-warm-sm">
      <div className="flex items-center gap-2.5">
        {stale && (
          <span
            aria-hidden
            className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
            title="Stale (14+ days overdue)"
          />
        )}
        <p className="flex-1 min-w-0 text-sm text-text-primary leading-snug truncate">
          {task.text}
        </p>
        <span className="shrink-0 text-xs font-medium text-amber-700/80 dark:text-amber-400/80 whitespace-nowrap">
          {ageLabel}
        </span>
      </div>
    </div>
  );
}
