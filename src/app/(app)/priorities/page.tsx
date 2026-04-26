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
import { usePriorityStore, type PriorityItem, type GroceryGroup, type PriorityCategory, PRIORITY_CATEGORY_ORDER } from '@/stores/priorityStore';
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
import { TaskQuadrantSheet } from '@/components/TaskQuadrantSheet';
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

// ---------- Sortable priority row ----------

// Static row content — shared between in-list render and drag overlay
function PriorityRowContent({
  item,
  index,
  onToggle,
  isDragOverlay,
  dragHandleProps,
}: {
  item: PriorityItem;
  index: number;
  onToggle?: () => void;
  isDragOverlay?: boolean;
  dragHandleProps?: Record<string, unknown>;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3.5 rounded-xl ${
        isDragOverlay
          ? 'bg-surface border border-primary shadow-lg'
          : item.completed
          ? 'bg-success/5'
          : 'bg-surface'
      }`}
    >
      <span className={`w-6 text-right text-base font-bold tabular-nums ${
        item.completed ? 'text-text-tertiary' : 'text-text-secondary'
      }`}>
        {index + 1}
      </span>
      <motion.button
        whileTap={prefersReducedMotion ? undefined : { scale: 0.85 }}
        onClick={onToggle}
        className="p-2 -m-2 flex-shrink-0"
      >
        <motion.div
          animate={prefersReducedMotion ? undefined : item.completed ? { scale: [1, 1.25, 1] } : { scale: 1 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${
            item.completed ? 'bg-success border-success' : 'border-border hover:border-primary'
          }`}
        >
          {item.completed && <span className="text-white text-sm font-bold">✓</span>}
        </motion.div>
      </motion.button>
      <span className={`text-base flex-1 ${item.completed ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
        {item.text}
      </span>
      {!isDragOverlay && (
        <div
          className="p-2 -m-1 text-text-tertiary"
          style={{ touchAction: 'none' }}
          {...(dragHandleProps || {})}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="3" r="1.5" />
            <circle cx="11" cy="3" r="1.5" />
            <circle cx="5" cy="8" r="1.5" />
            <circle cx="11" cy="8" r="1.5" />
            <circle cx="5" cy="13" r="1.5" />
            <circle cx="11" cy="13" r="1.5" />
          </svg>
        </div>
      )}
    </div>
  );
}

function SortablePriorityRow({
  item,
  index,
  onToggle,
  onDelete,
}: {
  item: PriorityItem;
  index: number;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useSortable({ id: item.id, transition: null });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      style={{ opacity: isDragging ? 0 : 1 }}
    >
      <SwipeToDelete onDelete={onDelete}>
        <PriorityRowContent
          item={item}
          index={index}
          onToggle={onToggle}
          dragHandleProps={listeners}
        />
      </SwipeToDelete>
    </div>
  );
}

// Sortable row wrapping a TaskCard — used by the Scheduled-today
// section and reusable for any surface that needs priority-ordered
// task-table rows. Index is the 1-based priority number.
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
        <div className="space-y-0.5">
          <TaskCard
            task={task}
            index={index}
            onToggle={onToggle}
            onTap={onTap}
            onEdit={onEdit}
            inlineEdit={inlineEdit}
            dragHandleProps={listeners}
          />
          {list && !list.is_inbox && (
            <p className="pl-9 text-[11px] text-text-tertiary">
              {list.icon ?? '📁'} {list.name}
            </p>
          )}
        </div>
      </SwipeToDelete>
    </div>
  );
}

// "Scheduled today" section — tasks from the new tasks table whose
// due_date matches selectedDate. Wrapped in its own DndContext so
// reorder events only affect this subgroup (and don't accidentally
// renumber the legacy priorityStore.items above).
function ScheduledTodaySection({
  tasks,
  lists,
  sensors,
  onToggle,
  onDelete,
  onReorder,
  onTapTask,
  onEditTask,
  onMoveToTomorrow,
}: {
  tasks: Task[];
  lists: ListRecord[];
  sensors: ReturnType<typeof useSensors>;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onTapTask: (task: Task) => void;
  onEditTask?: (task: Task) => void;
  onMoveToTomorrow?: (task: Task) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;
  const activeIndex = activeId ? tasks.findIndex((t) => t.id === activeId) : -1;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          {t('priorities.scheduledToday')}
        </h2>
        <span className="text-xs text-text-tertiary">
          {tasks.filter((t) => t.completed).length}/{tasks.length}
        </span>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setActiveId(e.active.id as string)}
        onDragEnd={(e) => {
          setActiveId(null);
          const { active, over } = e;
          if (!over || active.id === over.id) return;
          const oldIdx = tasks.findIndex((t) => t.id === active.id);
          const newIdx = tasks.findIndex((t) => t.id === over.id);
          if (oldIdx === -1 || newIdx === -1) return;
          const reordered = arrayMove(tasks, oldIdx, newIdx);
          onReorder(reordered.map((t) => t.id));
        }}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {tasks.map((task, i) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                index={i}
                lists={lists}
                onToggle={() => onToggle(task.id)}
                onTap={() => onTapTask(task)}
                onEdit={onEditTask ? () => onEditTask(task) : undefined}
                onDelete={() => onDelete(task.id)}
                onSecondary={onMoveToTomorrow ? () => onMoveToTomorrow(task) : undefined}
                inlineEdit
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="bg-surface border border-primary rounded-xl shadow-lg">
              <TaskCard
                task={activeTask}
                index={activeIndex}
                onToggle={() => {}}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

export default function PrioritiesPage() {
  const todayDateStr = useMemo(() => toLocalDateStr(new Date()), []);
  const weekDates = useMemo(() => buildWeekDates(), []);
  const [selectedDate, setSelectedDate] = useState(todayDateStr);

  const { items, groceries, fetchPriorities, savePriorities, saveGroceries, toggleItem, toggleGroceryItem, removeItem, removeGroceryItem, removeGroceryGroup, loading } = usePriorityStore();
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

  // List | Matrix view toggle. Matrix view replaces the categorized
  // items grid with an Eisenhower 2×2 grid + Unsorted stack. Tap any
  // task in matrix view → open TaskQuadrantSheet to set urgent/important.
  const [viewMode, setViewMode] = useState<'list' | 'matrix'>('list');
  const [quadrantTask, setQuadrantTask] = useState<PriorityItem | null>(null);

  // Tasks scheduled for today via the new Lists/Upcoming flow live in
  // the tasks table (taskStore). Today's agenda needs to be the
  // SUPERSET of everything due today — otherwise tasks captured via
  // "project Wellbloom, …" land in the tasks table with due_date=today
  // and never appear on Today (the tab looks empty). We now union them
  // in a "Scheduled today" section below the legacy priorities.
  const scheduledTasks = useTaskStore((s) => s.tasks);
  const fetchScheduled = useTaskStore((s) => s.fetchAll);
  const toggleScheduledComplete = useTaskStore((s) => s.toggleComplete);
  const removeScheduledTask = useTaskStore((s) => s.removeTask);
  const reorderScheduledTasks = useTaskStore((s) => s.reorderTasks);
  const updateScheduledTask = useTaskStore((s) => s.updateTask);
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
        .sort((a, b) => a.sort_order - b.sort_order),
    [scheduledTasks, selectedDate],
  );

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
  }, [fetchPriorities, fetchHabits, fetchCompletions, selectedDate]);

  // Celebrate when user completes the last priority of the day
  useEffect(() => {
    if (items.length === 0) {
      lastAllDone.current = false;
      return;
    }
    const allDone = items.every((i) => i.completed);
    if (allDone && !lastAllDone.current) {
      celebrate();
      showToast(t('priorities.allDone'));
    }
    lastAllDone.current = allDone;
  }, [items, celebrate, showToast]);

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

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeItem = items.find((i) => i.id === active.id);
      const overItem = items.find((i) => i.id === over.id);
      if (!activeItem || !overItem) return;
      const cat = activeItem.category ?? 'other';
      // Cross-category drops are blocked because each SortableContext
      // only contains its own category's ids; over.id will always be in
      // the same category as active.id.
      if ((overItem.category ?? 'other') !== cat) return;

      // Reorder within the category slice, then re-stitch into the
      // global items array preserving the relative order of all OTHER
      // categories' items.
      const catItems = items.filter((i) => (i.category ?? 'other') === cat);
      const oldIdx = catItems.findIndex((i) => i.id === active.id);
      const newIdx = catItems.findIndex((i) => i.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return;
      const reorderedCat = arrayMove(catItems, oldIdx, newIdx);

      let cursor = 0;
      const merged = items.map((it) => {
        if ((it.category ?? 'other') === cat) {
          const next = reorderedCat[cursor++];
          return next;
        }
        return it;
      });
      const renumbered = merged.map((item, idx) => ({ ...item, sort_order: idx }));

      usePriorityStore.setState({ items: renumbered });
      try {
        await savePriorities(selectedDate, renumbered);
        addLog(`Reordered ${cat}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save order');
      }
    },
    [items, savePriorities, selectedDate, addLog]
  );

  const activeDragItem = activeDragId ? items.find((i) => i.id === activeDragId) : null;
  const activeDragIndex = activeDragId ? items.findIndex((i) => i.id === activeDragId) : -1;

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
            await usePriorityStore.getState().removeGroceryItem(m.target.group.id, m.target.item.id);
          }
        } else {
          if (m.target.kind === 'priority') {
            await usePriorityStore.getState().markItemDone(m.target.item.id);
          } else {
            await usePriorityStore.getState().markGroceryDone(m.target.group.id, m.target.item.id);
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

      {/* List | Matrix toggle — applies to the priority items section
          only. Habits stay rendered the same way regardless. */}
      {items.length > 0 && (
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

      {/* Matrix view — replaces the categorized items grid when active. */}
      {items.length > 0 && viewMode === 'matrix' && (
        <MatrixView
          items={items}
          onTapTask={(mt) => {
            const pi = items.find((i) => i.id === mt.id) ?? null;
            setQuadrantTask(pi);
          }}
          onSetFlags={(id, flags) =>
            usePriorityStore.getState().setQuadrant(id, flags)
          }
        />
      )}

      {/* Priority items — grouped by category. Each category is its own
          DnD context (so you can only reorder within a category). Order
          across sections is fixed (Medications → Errands → Work → Home →
          Bills → Other). Empty categories collapse silently. */}
      {items.length > 0 && viewMode === 'list' && (
        <div className="space-y-5">
          {PRIORITY_CATEGORY_ORDER.map((cat) => {
            const catItems = items.filter((i) => (i.category ?? 'other') === cat);
            if (catItems.length === 0) return null;
            const doneCount = catItems.filter((i) => i.completed).length;
            return (
              <div key={cat} className="space-y-1">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    {t(`category.${cat}`)}
                  </h2>
                  <span className="text-xs text-text-tertiary">
                    {doneCount}/{catItems.length}
                  </span>
                </div>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={catItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    {catItems.map((item, index) => (
                      <SortablePriorityRow
                        key={item.id}
                        item={item}
                        index={index}
                        onToggle={() => toggleItem(item.id)}
                        onDelete={() => removeItem(item.id)}
                      />
                    ))}
                  </SortableContext>
                  <DragOverlay dropAnimation={null}>
                    {activeDragItem && (activeDragItem.category ?? 'other') === cat ? (
                      <PriorityRowContent
                        item={activeDragItem}
                        index={activeDragIndex}
                        isDragOverlay
                      />
                    ) : null}
                  </DragOverlay>
                </DndContext>
              </div>
            );
          })}
        </div>
      )}

      {/* Groceries section moved to its own /groceries tab — Today
          shows only categorized priorities + habits now. */}

      {/* Scheduled today — tasks from the new tasks table whose
          due_date matches the selected date. Includes list-assigned
          tasks (from captures like "project Wellbloom, …") so Today
          is the true superset of everything due today. Draggable to
          reorder; tap opens the quadrant sheet. */}
      {scheduledForSelectedDate.length > 0 && (
        <ScheduledTodaySection
          tasks={scheduledForSelectedDate}
          lists={lists}
          sensors={sensors}
          onToggle={(id) => toggleScheduledComplete(id)}
          onDelete={(id) => removeScheduledTask(id)}
          onReorder={(ids) => reorderScheduledTasks(ids)}
          // Tap on the empty area of the row toggles done; the
          // edit affordance moves to the pencil button via onEditTask.
          onTapTask={(task) => toggleScheduledComplete(task.id)}
          onEditTask={(task) => setScheduledQuadrantTask(task)}
          onMoveToTomorrow={async (task) => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const yyyymmdd = toLocalDateStr(tomorrow);
            await updateScheduledTask(task.id, { due_date: yyyymmdd });
            showToast('Moved to tomorrow', 'success');
          }}
        />
      )}

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
      {items.length === 0 && habits.filter((h) => h.is_active).length === 0 && !loading && !processing && (
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

      <TaskQuadrantSheet
        task={quadrantTask}
        onClose={() => setQuadrantTask(null)}
        onSetFlags={(id, flags) =>
          usePriorityStore.getState().setQuadrant(id, flags)
        }
      />

      {/* Tasks from the new tasks table (scheduled for today, list-
          assigned, etc.) use the richer TaskEditSheet — same sheet as
          /upcoming and /lists/[id] so the editing experience is
          consistent across the app. */}
      <TaskEditSheet
        task={scheduledQuadrantTask}
        onClose={() => setScheduledQuadrantTask(null)}
      />
    </div>
  );
}
