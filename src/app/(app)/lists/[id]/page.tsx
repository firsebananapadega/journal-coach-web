'use client';

// Single-list detail. Shows the list's tasks (open + completed) with
// a List | Matrix view toggle. Add a task at the bottom; tap a task
// to set Eisenhower flags via the shared TaskQuadrantSheet.
//
// Inbox can be renamed UI-wise but its is_inbox flag stays — we
// only block delete (server-side too: deleteList early-returns).

import { use, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core';
import { useListStore } from '@/stores/listStore';
import { useTaskStore, type Task } from '@/stores/taskStore';
import { MatrixView, type MatrixTask } from '@/components/MatrixView';
import { TaskCard } from '@/components/TaskCard';
import { TaskEditSheet } from '@/components/TaskEditSheet';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import InboxTriageStrip from '@/components/InboxTriageStrip';
import { useUiStore } from '@/stores/uiStore';
import { toLocalDateStr } from '@/lib/dateUtils';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';

const ICON_PRESETS = ['📁', '📋', '📝', '🎯', '💼', '🏠', '🛒', '✅', '📌', '⭐', '📅', '💡'];

// Re-anchor the drag overlay so its center sits under the cursor. The
// inbox source row is full-width while the overlay is a small chip;
// without this, dnd-kit preserves the cursor's relative offset inside
// the source element and the overlay drifts way off the user's thumb.
const snapCenterToCursor: Modifier = ({
  activatorEvent,
  draggingNodeRect,
  transform,
}) => {
  if (!draggingNodeRect || !activatorEvent) return transform;
  const activator = activatorEvent as PointerEvent;
  const offsetX =
    activator.clientX - draggingNodeRect.left - draggingNodeRect.width / 2;
  const offsetY =
    activator.clientY - draggingNodeRect.top - draggingNodeRect.height / 2;
  return {
    ...transform,
    x: transform.x + offsetX,
    y: transform.y + offsetY,
  };
};

// Wraps an Inbox task row in a useDraggable so the user can press-and-
// hold + drag onto an InboxTriageStrip folder tile. touchAction: 'pan-y'
// (NOT 'none') so the page still scrolls vertically when the user
// swipes — dnd-kit's 250ms press delay + 5px tolerance means a moving
// touch cancels activation and falls through to native scroll, while a
// stationary press promotes to a drag.
function DraggableInboxRow({
  taskId,
  children,
}: {
  taskId: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: taskId,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ touchAction: 'pan-y', opacity: isDragging ? 0 : 1 }}
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ListDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  const lists = useListStore((s) => s.lists);
  const fetchLists = useListStore((s) => s.fetchLists);
  const renameList = useListStore((s) => s.renameList);
  const updateListIcon = useListStore((s) => s.updateListIcon);
  const deleteList = useListStore((s) => s.deleteList);
  const createList = useListStore((s) => s.createList);
  const tasks = useTaskStore((s) => s.tasks);
  const fetchTasks = useTaskStore((s) => s.fetchAll);
  const addTask = useTaskStore((s) => s.addTask);
  const toggleComplete = useTaskStore((s) => s.toggleComplete);
  const removeTask = useTaskStore((s) => s.removeTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const showToast = useUiStore((s) => s.showToast);
  // setQuadrant lives inside TaskEditSheet via useTaskStore directly.

  const [viewMode, setViewMode] = useState<'list' | 'matrix'>('list');
  const [newText, setNewText] = useState('');
  const [adding, setAdding] = useState(false);
  const [quadrantTask, setQuadrantTask] = useState<Task | null>(null);
  const [draftName, setDraftName] = useState('');
  // Done section is now expanded by default per user preference —
  // they want to see completed items as a proper section without
  // having to expand each time.
  const [doneCollapsed, setDoneCollapsed] = useState(false);
  // Settings sheet (rename / icon / delete) — opened by the gear
  // icon in the header. Inbox shows fewer affordances (no delete).
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [iconDraft, setIconDraft] = useState('');

  // Swipe-left → Delete with confirm; swipe-right → move task's
  // due_date to tomorrow. Both feel native to iOS list interactions
  // and let the user clear noise without opening the edit sheet.
  const handleSwipeDelete = (task: Task) => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Delete "${task.text}"?`);
      if (!ok) return;
    }
    void removeTask(task.id);
  };
  const handleMoveToTomorrow = async (task: Task) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyymmdd = toLocalDateStr(tomorrow);
    await updateTask(task.id, { due_date: yyyymmdd });
    showToast('Moved to tomorrow', 'success');
  };

  useEffect(() => {
    fetchLists();
    fetchTasks();
  }, [fetchLists, fetchTasks]);

  const list = lists.find((l) => l.id === id);
  const listTasks = useMemo(
    () => tasks.filter((task) => task.list_id === id),
    [tasks, id],
  );
  const open = listTasks.filter((task) => !task.completed);
  // Sort completed tasks so the most-recently checked-off item
  // sits at the top of the Done section. updated_at is stamped
  // by Postgres on every UPDATE, including the toggle that flips
  // completed → true.
  const done = useMemo(
    () =>
      listTasks
        .filter((task) => task.completed)
        .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '')),
    [listTasks],
  );

  // ✨ FIX: declare hooks before any early return so order stays stable.
  const handleAdd = async () => {
    if (!newText.trim() || adding) return;
    setAdding(true);
    try {
      const created = await addTask({ text: newText.trim(), list_id: id });
      if (created) setNewText('');
    } finally {
      setAdding(false);
    }
  };

  const handleSettingsRename = async () => {
    if (!list) return;
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === list.name) return;
    await renameList(list.id, trimmed);
  };

  const handleSettingsIcon = async (next: string) => {
    if (!list) return;
    setIconDraft(next);
    await updateListIcon(list.id, next);
  };

  const handleDelete = async () => {
    if (!list || list.is_inbox) return;
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Delete "${list.name}"? Tasks in this list will move to Inbox.`,
      );
      if (!ok) return;
    }
    await deleteList(list.id);
    router.push('/lists');
  };

  // ── Inbox triage DnD ──────────────────────────────────────────────
  // Recipe lifted verbatim from MatrixView (sensors + portal +
  // touchAction). 250ms press-and-hold to start drag; tap is still a
  // tap. Only wired when the current list is the Inbox — other lists
  // keep the simpler rendering path.
  const isInbox = list?.is_inbox === true;
  const triageLists = useMemo(
    () => lists.filter((l) => !l.is_inbox && !l.archived),
    [lists],
  );
  const triageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of triageLists) {
      counts.set(
        l.id,
        tasks.filter((t) => t.list_id === l.id && !t.completed).length,
      );
    }
    return counts;
  }, [triageLists, tasks]);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  });
  const dragSensors = useSensors(pointerSensor, touchSensor);

  const handleTriageDragStart = (e: DragStartEvent) => {
    setActiveDragId(e.active.id as string);
  };
  const handleTriageDragEnd = async (e: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over) return;
    const targetListId = String(over.id);
    const target = triageLists.find((l) => l.id === targetListId);
    if (!target) return;
    const task = tasks.find((task) => task.id === active.id);
    if (!task) return;
    // Move + reset sort_order so it lands at the top of the destination
    // list. today_sort_order intentionally not touched — the row's
    // /today position (if it has a due_date today) stays put.
    await updateTask(task.id, { list_id: target.id, sort_order: 0 });
    showToast(`Moved to ${target.name}`, 'success');
  };

  const activeDragTask = activeDragId
    ? tasks.find((t) => t.id === activeDragId) ?? null
    : null;

  if (!list) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-16 pb-24 space-y-4">
        <Link href="/lists" className="text-sm text-primary font-medium">
          &lsaquo; {t('common.back')}
        </Link>
        <p className="text-sm text-text-tertiary">List not found.</p>
      </div>
    );
  }

  // Inbox view wraps the page in a DndContext so the triage strip
  // (droppable folder tiles) and the task rows (draggable) share one
  // gesture root. Other lists render the page without DnD overhead.
  const pageContent = (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-24 space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/lists" className="text-sm text-primary font-medium">
          &lsaquo; {t('tab.lists')}
        </Link>
        {/* Context-aware gear — opens the list-scoped settings sheet
            (rename, icon, delete). Replaces the previous top-right
            "Delete list" link; destructive action now sits behind a
            two-step inside the sheet. The global gear from
            (app)/layout is suppressed on /lists/[id]. */}
        <button
          onClick={() => {
            setIconDraft(list.icon ?? '');
            setDraftName(list.name);
            setSettingsOpen(true);
          }}
          aria-label="List settings"
          className="w-9 h-9 rounded-full bg-surface/80 backdrop-blur border border-border flex items-center justify-center text-text-secondary hover:text-text-primary"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* Title — rename + icon now live behind the gear icon's
          settings sheet. The header stays static so it doesn't
          fight the gear-tap target. */}
      <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
        <span>{list.is_inbox ? '📥' : list.icon ?? '📁'}</span>
        <span>{list.is_inbox ? t('inbox.label') : list.name}</span>
      </h1>

      {/* Inbox triage strip — drop targets for press-and-hold drag. */}
      {isInbox && (
        <InboxTriageStrip
          lists={triageLists}
          taskCounts={triageCounts}
          onCreateList={(name) => createList(name)}
        />
      )}

      {/* Add task */}
      <div className="flex gap-2">
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Add a task…"
          className="flex-1 px-4 py-3 bg-surface border border-border focus:border-primary rounded-xl text-sm text-text-primary outline-none transition-colors"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newText.trim()}
          className="px-4 py-3 bg-primary text-white rounded-xl text-sm font-semibold disabled:opacity-40"
        >
          {adding ? '…' : '+'}
        </button>
      </div>

      {/* List | Matrix toggle */}
      {open.length > 0 && (
        <div className="inline-flex p-0.5 rounded-xl bg-surface border border-border">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              viewMode === 'list'
                ? 'bg-primary text-white shadow-warm-sm'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
            aria-pressed={viewMode === 'list'}
          >
            {t('view.list')}
          </button>
          <button
            onClick={() => setViewMode('matrix')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              viewMode === 'matrix'
                ? 'bg-primary text-white shadow-warm-sm'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
            aria-pressed={viewMode === 'matrix'}
          >
            {t('view.matrix')}
          </button>
        </div>
      )}

      {viewMode === 'matrix' && open.length > 0 ? (
        <MatrixView
          items={open as MatrixTask[]}
          onTapTask={(mt) => {
            const task = open.find((task) => task.id === mt.id) ?? null;
            setQuadrantTask(task);
          }}
          onSetFlags={(id, flags) =>
            useTaskStore.getState().setQuadrant(id, flags)
          }
          onDeleteTask={(id) => {
            const task = open.find((t) => t.id === id);
            if (!task) return;
            handleSwipeDelete(task);
          }}
        />
      ) : (
        <>
          {open.length === 0 && done.length === 0 ? (
            <p className="text-sm text-text-tertiary leading-snug">
              {list.is_inbox
                ? 'When you capture a task without a destination, it lands here for triage.'
                : 'No tasks yet. Add one above to get started.'}
            </p>
          ) : (
            <>
              {open.length > 0 && (
                <div className="space-y-1.5">
                  {/* AnimatePresence drives the exit-on-check
                      transition. When toggleComplete flips a task
                      to completed, it filters out of `open` and
                      its motion.div fires the exit (slide-right +
                      fade) before unmounting. The matching task
                      then appears at the top of Done. */}
                  <AnimatePresence initial={false}>
                    {open.map((task) => {
                      const row = (
                        <SwipeToDelete
                          onDelete={() => handleSwipeDelete(task)}
                          onSecondary={() => handleMoveToTomorrow(task)}
                          secondaryLabel="Tomorrow"
                          secondaryIcon={
                            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <rect x="3" y="4" width="18" height="18" rx="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                              <path d="M9 15l3 3 3-3" />
                            </svg>
                          }
                        >
                          <TaskCard
                            task={task}
                            onToggle={() => toggleComplete(task.id)}
                            onTap={() => toggleComplete(task.id)}
                            onEdit={() => setQuadrantTask(task)}
                            showDate
                          />
                        </SwipeToDelete>
                      );
                      return (
                        <motion.div
                          key={task.id}
                          layout
                          initial={prefersReducedMotion ? false : { opacity: 0 }}
                          animate={prefersReducedMotion ? undefined : { opacity: 1 }}
                          exit={prefersReducedMotion ? { opacity: 0 } : { x: 80, opacity: 0 }}
                          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                        >
                          {isInbox ? (
                            <DraggableInboxRow taskId={task.id}>{row}</DraggableInboxRow>
                          ) : (
                            row
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
              {done.length > 0 && (
                <section className="pt-6 space-y-2">
                  {/* Proper section break — divider + bigger header
                      so Done feels like its own area below the open
                      tasks rather than a tiny aside. */}
                  <div className="border-t border-border" aria-hidden />
                  <button
                    type="button"
                    onClick={() => setDoneCollapsed((c) => !c)}
                    className="w-full flex items-center justify-between pt-2 hover:opacity-80 transition-opacity"
                    aria-expanded={!doneCollapsed}
                  >
                    <span className="text-base font-bold text-text-secondary">
                      Done{' '}
                      <span className="text-text-tertiary font-semibold">
                        · {done.length}
                      </span>
                    </span>
                    <span aria-hidden className="text-lg leading-none text-text-tertiary">
                      {doneCollapsed ? '▸' : '▾'}
                    </span>
                  </button>
                  {!doneCollapsed && (
                    <div className="space-y-1.5">
                      {done.map((task) => (
                        <SwipeToDelete
                          key={task.id}
                          onDelete={() => handleSwipeDelete(task)}
                        >
                          <TaskCard
                            task={task}
                            onToggle={() => toggleComplete(task.id)}
                            onTap={() => toggleComplete(task.id)}
                            onEdit={() => setQuadrantTask(task)}
                          />
                        </SwipeToDelete>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}

      <TaskEditSheet
        task={quadrantTask}
        onClose={() => setQuadrantTask(null)}
      />

      {/* List settings sheet — gear-icon entry point. Houses rename,
          icon picker (preset grid + free-text emoji), and the
          delete-list affordance that previously sat in the top
          header. Inbox can rename + change icon but not be deleted. */}
      <AnimatePresence>
        {settingsOpen && (
          <>
            <motion.div
              key="list-settings-backdrop"
              initial={prefersReducedMotion ? undefined : { opacity: 0 }}
              animate={prefersReducedMotion ? undefined : { opacity: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/40"
              onClick={() => setSettingsOpen(false)}
            />
            <motion.div
              key="list-settings-sheet"
              initial={prefersReducedMotion ? undefined : { y: '100%', opacity: 0 }}
              animate={prefersReducedMotion ? undefined : { y: 0, opacity: 1 }}
              exit={prefersReducedMotion ? undefined : { y: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed inset-x-3 z-[70] bg-surface rounded-3xl border border-border shadow-warm-xl"
              style={{
                bottom: 'max(0.75rem, env(safe-area-inset-bottom))',
                maxHeight: '88dvh',
              }}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>
              <div className="px-5 py-3 flex items-center justify-between border-b border-border">
                <h2 className="text-base font-bold text-text-primary">List settings</h2>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="text-text-secondary text-lg w-9 h-9 flex items-center justify-center"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div className="px-5 py-4 space-y-5 overflow-y-auto" style={{ maxHeight: '70dvh' }}>
                {/* Rename */}
                {!list.is_inbox && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-text-tertiary mb-1.5">
                      Name
                    </label>
                    <input
                      type="text"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={handleSettingsRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className="w-full px-3 py-2.5 bg-surface-elevated border border-border focus:border-primary rounded-xl text-base text-text-primary outline-none"
                    />
                  </div>
                )}

                {/* Icon picker */}
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-text-tertiary mb-1.5">
                    Icon
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {ICON_PRESETS.map((emoji) => {
                      const active = (iconDraft || '📁') === emoji;
                      return (
                        <button
                          key={emoji}
                          onClick={() => handleSettingsIcon(emoji)}
                          className={`w-11 h-11 rounded-xl text-xl flex items-center justify-center transition-colors ${
                            active
                              ? 'bg-primary/20 border border-primary'
                              : 'bg-surface-elevated border border-border hover:border-primary/40'
                          }`}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    value={iconDraft}
                    placeholder="Or paste any emoji…"
                    maxLength={4}
                    onChange={(e) => setIconDraft(e.target.value)}
                    onBlur={() => handleSettingsIcon(iconDraft)}
                    className="w-full px-3 py-2 bg-surface-elevated border border-border focus:border-primary rounded-xl text-sm text-text-primary outline-none"
                  />
                </div>

                {/* Delete (non-Inbox only) */}
                {!list.is_inbox && (
                  <div>
                    <button
                      onClick={async () => {
                        setSettingsOpen(false);
                        await handleDelete();
                      }}
                      className="w-full py-3 rounded-xl bg-error/10 text-error text-sm font-semibold hover:bg-error/20 transition-colors"
                    >
                      Delete list
                    </button>
                    <p className="text-[11px] text-text-tertiary mt-1.5 leading-snug">
                      Tasks in this list will move to Inbox. The list itself is
                      permanently removed.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );

  if (!isInbox) return pageContent;

  // Inbox: wrap the page in a single DndContext so the triage strip's
  // droppable folder tiles and the task rows below share one gesture
  // root. Portal the DragOverlay to <body> to escape any transformed
  // ancestor (matches the MatrixView portal pattern).
  return (
    <DndContext
      sensors={dragSensors}
      // pointerWithin resolves the active droppable from the cursor's
      // screen position — so the folder under the user's THUMB is what
      // gets selected, not the folder under the (possibly offset) drag
      // overlay's bounding rect.
      collisionDetection={pointerWithin}
      // Snap the visual overlay's center to the cursor so it tracks
      // the thumb regardless of source-vs-overlay size mismatch.
      modifiers={[snapCenterToCursor]}
      onDragStart={handleTriageDragStart}
      onDragEnd={handleTriageDragEnd}
      onDragCancel={() => setActiveDragId(null)}
    >
      {pageContent}
      {typeof document !== 'undefined' &&
        createPortal(
          <DragOverlay dropAnimation={null}>
            {activeDragTask ? (
              <div className="px-3 py-2 rounded-xl bg-surface border border-primary shadow-warm-md text-sm text-text-primary leading-snug max-w-[240px] line-clamp-2">
                {activeDragTask.text}
              </div>
            ) : null}
          </DragOverlay>,
          document.body,
        )}
    </DndContext>
  );
}
