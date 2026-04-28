'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  TouchSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { usePriorityStore, type PriorityItem } from '@/stores/priorityStore';
import { useGroceryStore } from '@/stores/groceryStore';
import type { GroceryGroup } from '@/components/CapturePreviewSheet';
import { useHabitStore } from '@/stores/habitStore';
import { toLocalDateStr } from '@/lib/dateUtils';
import { t } from '@/lib/translations';
import { getLanguage } from '@/lib/language';
import { classifyCapture, resolveWhen, type CaptureResult } from '@/lib/captureEngine';
import { supabase } from '@/lib/supabase';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import { motion } from 'framer-motion';
import EmptyState from '@/components/ui/EmptyState';
import { useUiStore } from '@/stores/uiStore';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { CapturePreviewSheet, type CompletionMatch, type PriorityDestinations } from '@/components/CapturePreviewSheet';
import { MatrixView } from '@/components/MatrixView';
import { TaskCard } from '@/components/TaskCard';
import { TaskEditSheet } from '@/components/TaskEditSheet';
import { useTaskStore, type Task } from '@/stores/taskStore';
import type { ListRecord } from '@/stores/listStore';
import { useListStore } from '@/stores/listStore';
import { commitCapture as commitCaptureShared } from '@/lib/captureCommit';

function buildWeekDates(): Date[] {
  const today = new Date();
  const dates: Date[] = [];
  for (let offset = -3; offset <= 3; offset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    dates.push(d);
  }
  return dates;
}

function formatDateBubble(date: Date, todayStr: string): { label: string; dateNum: number } {
  const dateStr = toLocalDateStr(date);
  const dateNum = date.getDate();
  if (dateStr === todayStr) {
    return { label: t('priorities.today'), dateNum };
  }
  const dayName = date.toLocaleDateString(getLanguage(), { weekday: 'short' });
  return { label: dayName, dateNum };
}

// Sortable row wrapping a TaskCard. Index is the 1-based priority
// number. /today and /lists/[id] both render this.
function SortableTaskCard({
  task,
  index,
  lists,
  onToggle,
  onTap,
  onEdit,
  onDelete,
  onSecondary,
  inlineEdit,
}: {
  task: Task;
  index: number;
  lists: ListRecord[];
  onToggle: () => void;
  onTap: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  onSecondary?: () => void;
  inlineEdit?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: task.id,
    transition: null,
  });
  const list = task.list_id ? lists.find((l) => l.id === task.list_id) : null;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      style={{ opacity: isDragging ? 0 : 1 }}
    >
      <SwipeToDelete
        onDelete={onDelete}
        onSecondary={onSecondary}
        secondaryLabel={onSecondary ? 'Tomorrow' : undefined}
        secondaryIcon={
          onSecondary ? (
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <path d="M9 15l3 3 3-3" />
            </svg>
          ) : undefined
        }
      >
        <TaskCard
          task={task}
          list={list}
          index={index}
          onToggle={onToggle}
          onTap={onTap}
          onEdit={onEdit}
          inlineEdit={inlineEdit}
          dragHandleProps={listeners}
        />
      </SwipeToDelete>
    </div>
  );
}

export default function PrioritiesPage() {
  const todayDateStr = useMemo(() => toLocalDateStr(new Date()), []);
  const weekDates = useMemo(() => buildWeekDates(), []);
  const [selectedDate, setSelectedDate] = useState(todayDateStr);

  // Legacy priorityStore kept around solely for the capture-preview
  // completion-match path (see commitCapture below) which still resolves
  // checkoff matches against pre-unification daily_priorities items.
  // /today render itself now reads exclusively from the tasks table.
  const items = usePriorityStore((s) => s.items);
  const fetchPriorities = usePriorityStore((s) => s.fetchPriorities);
  const savePriorities = usePriorityStore((s) => s.savePriorities);
  // Groceries moved to their own normalized + realtime store; the
  // /today page reads from it for capture context + completion routing
  // even though the grocery list is rendered on /groceries.
  const groceryGroups = useGroceryStore((s) => s.groups);
  const groceryItems = useGroceryStore((s) => s.items);
  const loadActiveGrocery = useGroceryStore((s) => s.loadActive);
  // Reconstruct the legacy nested-items shape that CapturePreviewSheet
  // needs for fuzzy matching of "I bought X" completions.
  const groceries: GroceryGroup[] = useMemo(
    () =>
      groceryGroups.map((g) => ({
        id: g.id,
        store: g.store,
        items: groceryItems
          .filter((i) => i.group_id === g.id)
          .map((i) => ({ id: i.id, name: i.name, completed: i.completed })),
      })),
    [groceryGroups, groceryItems],
  );
  const celebrate = useUiStore((s) => s.celebrate);
  const showToast = useUiStore((s) => s.showToast);
  const lastAllDone = useRef(false);
  const { habits, fetchHabits, completions, fetchCompletions, toggleCompletion } = useHabitStore();
  const [newItem, setNewItem] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [log, setLog] = useState<string[]>([]);

  const itemsRef = useRef(items);
  const groceriesRef = useRef(groceries);
  itemsRef.current = items;
  groceriesRef.current = groceries;

  // Pre-save preview state — same pattern as the /voice page. The user
  // taps Add → we run classifyCapture → open the sheet → only commit on
  // confirm so they can edit categories, drop wrong items, etc.
  const [pendingCapture, setPendingCapture] = useState<CaptureResult | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  // List | Matrix view toggle. Matrix view replaces the unified list
  // with an Eisenhower 2×2 grid + Unsorted stack. Tap any task in
  // matrix view → opens TaskEditSheet to set urgent/important + edit.
  const [viewMode, setViewMode] = useState<'list' | 'matrix'>('list');

  // /today now reads exclusively from the tasks table. Loose priorities
  // were migrated into this same table (Inbox + due_date) so there's a
  // single source for both list-assigned and unassigned-but-dated rows.
  const scheduledTasks = useTaskStore((s) => s.tasks);
  const tasksLoading = useTaskStore((s) => s.loading);
  const fetchScheduled = useTaskStore((s) => s.fetchAll);
  const toggleScheduledComplete = useTaskStore((s) => s.toggleComplete);
  const removeScheduledTask = useTaskStore((s) => s.removeTask);
  const updateScheduledTask = useTaskStore((s) => s.updateTask);
  const reorderForToday = useTaskStore((s) => s.reorderForToday);
  const [scheduledQuadrantTask, setScheduledQuadrantTask] = useState<Task | null>(null);
  // Project lists for the destination dropdown in the preview sheet
  // AND for showing list names on the scheduled-today rows.
  const lists = useListStore((s) => s.lists);
  const fetchLists = useListStore((s) => s.fetchLists);
  useEffect(() => {
    fetchScheduled();
    fetchLists();
  }, [fetchScheduled, fetchLists]);
  const scheduledForSelectedDate = useMemo(
    () =>
      scheduledTasks
        .filter((t) => t.due_date === selectedDate)
        .sort((a, b) => {
          const ao = a.today_sort_order ?? a.sort_order;
          const bo = b.today_sort_order ?? b.sort_order;
          if (ao !== bo) return ao - bo;
          return (a.created_at ?? '').localeCompare(b.created_at ?? '');
        }),
    [scheduledTasks, selectedDate],
  );

  // The unified /today list reads exclusively from tasks. Loose
  // priorities have been backfilled into tasks (Inbox + due_date),
  // so there's nothing to merge anymore — scheduledForSelectedDate
  // IS the page's data.

  // DnD sensors — long press (500ms) to start drag
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { delay: 500, tolerance: 5 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 500, tolerance: 5 },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  const addLog = useCallback((msg: string) => {
    setLog(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ${msg}`]);
  }, []);

  useEffect(() => {
    fetchPriorities(selectedDate);
    fetchHabits();
    fetchCompletions(selectedDate, selectedDate);
    // Make sure the shared grocery list is loaded so capture context
    // (existing items) is fresh. /groceries owns the realtime channel;
    // we just need a one-shot read here.
    void loadActiveGrocery();
  }, [fetchPriorities, fetchHabits, fetchCompletions, loadActiveGrocery, selectedDate]);

  // Celebrate when user completes the last task of the day.
  useEffect(() => {
    if (scheduledForSelectedDate.length === 0) {
      lastAllDone.current = false;
      return;
    }
    const allDone = scheduledForSelectedDate.every((t) => t.completed);
    if (allDone && !lastAllDone.current) {
      celebrate();
      showToast(t('priorities.allDone'));
    }
    lastAllDone.current = allDone;
  }, [scheduledForSelectedDate, celebrate, showToast]);

  const handleAddItem = () => {
    if (!newItem.trim()) return;
    const text = newItem.trim();
    setError('');
    setProcessing(true);
    addLog(`Processing: "${text.substring(0, 50)}..."`);
    // No more eager localStorage.journal_priorities write — the journal
    // page Priorities tab now reads from the same Supabase store.
    handleAddTasks(text);
  };

  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  // Drag-end on the unified /today list. Every row is a task now, so we
  // just rewrite today_sort_order with the new positions. /lists/[id]
  // order is left untouched (those are sort_order, not today_sort_order).
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIdx = scheduledForSelectedDate.findIndex((t) => t.id === active.id);
      const newIdx = scheduledForSelectedDate.findIndex((t) => t.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return;
      const reordered = arrayMove(scheduledForSelectedDate, oldIdx, newIdx);
      const positions = new Map<string, number>();
      reordered.forEach((task, position) => positions.set(task.id, position));
      try {
        await reorderForToday(positions);
        addLog('Reordered today');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save order');
      }
    },
    [scheduledForSelectedDate, reorderForToday, addLog],
  );

  const activeDragTask = activeDragId
    ? scheduledForSelectedDate.find((t) => t.id === activeDragId) ?? null
    : null;

  const handleAddTasks = async (inputText?: string) => {
    const text = (inputText || newItem).trim();
    if (!text) {
      addLog('No text to process');
      setProcessing(false);
      return;
    }

    setProcessing(true);
    setError('');

    try {
      // Pass current items so Gemini can match "I bought celery" against
      // the existing celery row instead of duplicating it.
      const result = await classifyCapture(text, {
        existingGroceries: groceries.flatMap((g) => g.items.map((i) => i.name)),
        existingPriorities: items.map((p) => p.text),
      });
      addLog(`Classified: ${result.priorities.length} tasks, ${result.groceries.length} grocery groups, ${result.completions.length} completions`);

      // If Gemini returned nothing actionable AND no completions to apply,
      // fall back to a single "other" task on the selected date so the
      // user's input isn't silently lost.
      if (
        result.priorities.length === 0 &&
        result.groceries.length === 0 &&
        result.plans.length === 0 &&
        result.completions.length === 0 &&
        result.intentions.length === 0 &&
        result.habits.length === 0 &&
        result.ideas.length === 0 &&
        result.gratitude.length === 0 &&
        !result.journal
      ) {
        result.priorities.push({ text, when: 'today', category: 'other', subgroup: null });
      }

      setPendingCapture(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`Capture engine failed: ${msg}, falling back to raw text`);
      // Fallback: skip the preview and write raw text directly so the
      // user's input isn't lost on classification failure.
      try {
        const currentItems = itemsRef.current;
        const fallbackItem: PriorityItem = {
          id: crypto.randomUUID(),
          text,
          completed: false,
          sort_order: currentItems.length,
          category: 'other',
          subgroup: null,
        };
        await savePriorities(selectedDate, [...currentItems, fallbackItem]);
        addLog('Saved raw text as task (fallback)');
        setNewItem('');
      } catch (saveErr) {
        const saveMsg = saveErr instanceof Error ? saveErr.message : String(saveErr);
        setError(`Save failed: ${saveMsg}`);
        addLog(`Supabase save failed: ${saveMsg}`);
      }
    }

    setProcessing(false);
  };

  // Runs after the user confirms the CapturePreviewSheet. All the writes
  // that used to happen inline in handleAddTasks live here now so nothing
  // hits Supabase until the user has reviewed.
  const commitCapture = async (
    edited: CaptureResult,
    completionMatches: CompletionMatch[],
    destinations: PriorityDestinations,
  ) => {
    addLog('Committing reviewed capture...');

    const summary = await commitCaptureShared(edited, destinations, {
      selectedDate,
      lists,
      log: addLog,
    });
    if (summary.todayCount > 0) addLog(`Today += ${summary.todayCount}`);
    if (summary.taskCount > 0) addLog(`Tasks += ${summary.taskCount}`);
    if (summary.groceryCount > 0) addLog(`Groceries += ${summary.groceryCount}`);
    if (summary.newListsCreated.length > 0)
      addLog(`Created lists: ${summary.newListsCreated.join(', ')}`);

    // Apply completion matches the user kept in the preview
    let checkoffCount = 0;
    for (const m of completionMatches) {
      if (!m.target) continue;
      try {
        if (m.intent.type === 'skip') {
          if (m.target.kind === 'priority') {
            await usePriorityStore.getState().removeItem(m.target.item.id);
          } else {
            await useGroceryStore.getState().removeItem(m.target.item.id);
          }
        } else {
          if (m.target.kind === 'priority') {
            await usePriorityStore.getState().markItemDone(m.target.item.id);
          } else {
            await useGroceryStore.getState().markItemDone(m.target.item.id);
          }
        }
        checkoffCount += 1;
      } catch (e) {
        console.warn('completion application failed', m.intent, e);
      }
    }
    if (checkoffCount > 0) addLog(`Applied ${checkoffCount} check-off(s)`);

    // Refresh the view for the currently selected date.
    await fetchPriorities(selectedDate);
    setNewItem('');
  };

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{t('priorities.title')}</h1>
        <p className="text-sm text-text-secondary mt-1">
          {new Date().toLocaleDateString(getLanguage(), { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* The scheduled-today section (below) now lives inline rather
          than behind a jump-to-upcoming link, so this banner is gone.
          Legacy Link retained only if we ever re-add scheduled > N
          overflow summarization. */}

      {/* Date picker strip — sliding pill highlights selected day */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {weekDates.map((date) => {
          const dateStr = toLocalDateStr(date);
          const { label, dateNum } = formatDateBubble(date, todayDateStr);
          const isSelected = dateStr === selectedDate;
          return (
            <button
              key={dateStr}
              onClick={() => setSelectedDate(dateStr)}
              className={`relative flex flex-col items-center min-w-[52px] py-2 px-2 rounded-xl text-xs font-medium transition-colors ${
                isSelected ? 'text-white' : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              {isSelected && (
                <motion.span
                  layoutId="prioritiesDatePill"
                  className="absolute inset-0 rounded-xl bg-primary shadow-warm-md"
                  transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10 text-[10px] uppercase">{label}</span>
              <span className="relative z-10 text-lg font-bold">{dateNum}</span>
            </button>
          );
        })}
      </div>

      {/* Add priority — full-width input. Voice capture lives in the
          Tasks-wall center button now, so the page-level mic button
          was retired and the textarea expands across the full row. */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <textarea
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (newItem.trim()) handleAddItem();
              }
            }}
            placeholder={t('priorities.placeholder')}
            rows={1}
            className="flex-1 px-4 py-3 bg-surface border border-border focus:border-primary rounded-xl text-text-primary outline-none text-sm resize-none transition-all"
            style={{ height: '44px' }}
          />
        </div>

        {newItem.trim() && (
          <button
            onClick={handleAddItem}
            disabled={processing}
            className="w-full py-2.5 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50 text-sm"
          >
            {processing ? t('priorities.processing') : t('priorities.addTasks')}
          </button>
        )}

        {error && (
          <div className="bg-error/10 border border-error/30 rounded-xl p-3">
            <p className="text-sm text-error">{error}</p>
          </div>
        )}
      </div>

      {/* List | Matrix toggle — applies to the unified task list only.
          Habits stay rendered the same way regardless. */}
      {scheduledForSelectedDate.length > 0 && (
        <div className="flex items-center gap-2">
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
        </div>
      )}

      {/* Matrix view — Eisenhower 2×2 over today's tasks. Same data
          source as the list view; just a different layout. */}
      {scheduledForSelectedDate.length > 0 && viewMode === 'matrix' && (
        <MatrixView
          items={scheduledForSelectedDate}
          onTapTask={(mt) => {
            const t = scheduledForSelectedDate.find((x) => x.id === mt.id) ?? null;
            setScheduledQuadrantTask(t);
          }}
          onSetFlags={(id, flags) =>
            useTaskStore.getState().setQuadrant(id, flags)
          }
          onDeleteTask={(id) => {
            const task = scheduledForSelectedDate.find((x) => x.id === id);
            if (typeof window !== 'undefined') {
              const ok = window.confirm(`Delete "${task?.text ?? 'this item'}"?`);
              if (!ok) return;
            }
            void useTaskStore.getState().removeTask(id);
          }}
        />
      )}

      {/* Unified /today list — every row is a task. Categories ride as
          chips on the row; list assignment shows as a small line under
          the row. Drag-reorder writes today_sort_order only, so the
          /lists/[id] order stays untouched. Habits sit in their own
          section below. */}
      {scheduledForSelectedDate.length > 0 && viewMode === 'list' && (
        <div className="space-y-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={scheduledForSelectedDate.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1">
                {scheduledForSelectedDate.map((task, index) => (
                  <SortableTaskCard
                    key={task.id}
                    task={task}
                    index={index}
                    lists={lists}
                    onToggle={() => toggleScheduledComplete(task.id)}
                    onTap={() => toggleScheduledComplete(task.id)}
                    onDelete={() => removeScheduledTask(task.id)}
                    onSecondary={async () => {
                      const tomorrow = new Date();
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      const tomorrowStr = toLocalDateStr(tomorrow);
                      // Preserve list_id + time. Bump remind_at by
                      // exactly +24h so the same wall-clock time
                      // fires tomorrow; clear remind_sent_at so cron
                      // re-evaluates.
                      const nextRemindAt = task.remind_at
                        ? new Date(new Date(task.remind_at).getTime() + 86_400_000).toISOString()
                        : null;
                      await updateScheduledTask(task.id, {
                        due_date: tomorrowStr,
                        remind_at: nextRemindAt,
                        remind_sent_at: null,
                      });
                      showToast('Moved to tomorrow', 'success');
                    }}
                    inlineEdit
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {activeDragTask ? (
                <div className="bg-surface border border-primary rounded-xl shadow-lg">
                  <TaskCard
                    task={activeDragTask}
                    index={scheduledForSelectedDate.findIndex((t) => t.id === activeDragTask.id)}
                    onToggle={() => {}}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* Groceries section moved to its own /groceries tab — Today
          shows only categorized priorities + habits now. */}

      {/* Habits */}
      {(() => {
        const activeHabits = habits.filter((h) => h.is_active);
        const dateCompletions = completions[selectedDate] || new Set<string>();
        if (activeHabits.length === 0) return null;
        return (
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('priorities.habits')}</h2>
              <span className="text-xs text-text-tertiary">
                {activeHabits.filter((h) => dateCompletions.has(h.id)).length}/{activeHabits.length}
              </span>
            </div>
            {activeHabits.map((habit) => {
              const isDone = dateCompletions.has(habit.id);
              return (
                <div
                  key={habit.id}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                    isDone ? 'bg-success/10' : 'bg-surface hover:bg-surface-elevated'
                  }`}
                >
                  <motion.button
                    whileTap={prefersReducedMotion ? undefined : { scale: 0.85 }}
                    onClick={() => toggleCompletion(habit.id, selectedDate)}
                    className="p-2 -m-2 flex-shrink-0"
                  >
                    <motion.div
                      animate={prefersReducedMotion ? undefined : isDone ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                      transition={{ duration: 0.35, ease: 'easeOut' }}
                      className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isDone ? 'bg-success border-success' : 'border-border hover:border-primary'
                      }`}
                    >
                      {isDone && <span className="text-white text-sm font-bold">✓</span>}
                    </motion.div>
                  </motion.button>
                  <span className={`text-base ${isDone ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
                    {habit.name}
                  </span>
                  <span className="text-xs text-text-tertiary capitalize ml-auto">{habit.time_of_day}</span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Empty state */}
      {scheduledForSelectedDate.length === 0 && habits.filter((h) => h.is_active).length === 0 && !tasksLoading && !processing && (
        <EmptyState pose="wave" title={t('priorities.empty')} />
      )}

      {/* Activity log -- visible debug panel */}
      {log.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">{t('priorities.activityLog')}</h2>
            <button onClick={() => setLog([])} className="text-xs text-text-tertiary hover:text-text-secondary">{t('common.clear')}</button>
          </div>
          <div className="bg-surface rounded-xl border border-border p-3 space-y-0.5">
            {log.map((entry, i) => (
              <p key={i} className="text-xs text-text-tertiary font-mono">{entry}</p>
            ))}
          </div>
        </div>
      )}

      <CapturePreviewSheet
        open={pendingCapture !== null}
        result={pendingCapture}
        existingPriorities={items}
        existingGroceries={groceries}
        lists={lists}
        busy={previewBusy}
        onCancel={() => setPendingCapture(null)}
        onConfirm={async (edited, matches, destinations) => {
          setPreviewBusy(true);
          try {
            await commitCapture(edited, matches, destinations);
          } finally {
            setPreviewBusy(false);
            setPendingCapture(null);
          }
        }}
      />

      {/* Matrix-tap and other quadrant flows on /today now go straight
          to the richer TaskEditSheet — same sheet as /upcoming and
          /lists/[id] so editing is consistent across the app. */}
      <TaskEditSheet
        task={scheduledQuadrantTask}
        onClose={() => setScheduledQuadrantTask(null)}
      />
    </div>
  );
}
