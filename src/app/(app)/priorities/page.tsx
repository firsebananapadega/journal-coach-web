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
import { usePriorityStore, type PriorityItem, type GroceryGroup } from '@/stores/priorityStore';
import { useHabitStore } from '@/stores/habitStore';
import { toLocalDateStr } from '@/lib/dateUtils';
import {
  isSpeechRecognitionSupported,
  startListening,
  stopListening,
} from '@/lib/speechRecognition';
import { getLanguage } from '@/lib/language';
import { classifyCapture, resolveWhen, type PriorityTask } from '@/lib/captureEngine';
import { supabase } from '@/lib/supabase';
import { SwipeToDelete } from '@/components/SwipeToDelete';

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
    return { label: 'Today', dateNum };
  }
  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
  return { label: dayName, dateNum };
}

// ---------- Sortable priority row ----------

// Static row content — shared between in-list render and drag overlay
function PriorityRowContent({
  item,
  index,
  onToggle,
  isDragOverlay,
}: {
  item: PriorityItem;
  index: number;
  onToggle?: () => void;
  isDragOverlay?: boolean;
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
      <span className={`w-6 text-right text-sm font-bold tabular-nums ${
        item.completed ? 'text-text-tertiary' : 'text-text-secondary'
      }`}>
        {index + 1}
      </span>
      <button
        onClick={onToggle}
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
          item.completed ? 'bg-success border-success' : 'border-border hover:border-primary'
        }`}
      >
        {item.completed && <span className="text-white text-xs font-bold">✓</span>}
      </button>
      <span className={`text-sm flex-1 ${item.completed ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
        {item.text}
      </span>
      {!isDragOverlay && (
        <div className="touch-none p-1 text-text-tertiary">
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
      {...listeners}
      style={{
        opacity: isDragging ? 0 : 1,
        touchAction: 'none',
      }}
    >
      <SwipeToDelete onDelete={onDelete}>
        <PriorityRowContent item={item} index={index} onToggle={onToggle} />
      </SwipeToDelete>
    </div>
  );
}

export default function PrioritiesPage() {
  const todayDateStr = useMemo(() => toLocalDateStr(new Date()), []);
  const weekDates = useMemo(() => buildWeekDates(), []);
  const [selectedDate, setSelectedDate] = useState(todayDateStr);

  const { items, groceries, fetchPriorities, savePriorities, saveGroceries, toggleItem, toggleGroceryItem, removeItem, removeGroceryItem, removeGroceryGroup, loading } = usePriorityStore();
  const { habits, fetchHabits, completions, fetchCompletions, toggleCompletion } = useHabitStore();
  const [newItem, setNewItem] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [capturedText, setCapturedText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [speechSupported] = useState(() => typeof window !== 'undefined' && isSpeechRecognitionSupported());

  const liveText = useRef('');
  const accumulatedTextRef = useRef('');
  const itemsRef = useRef(items);
  const groceriesRef = useRef(groceries);
  itemsRef.current = items;
  groceriesRef.current = groceries;

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

  const handleAddItem = () => {
    if (!newItem.trim()) return;
    const text = newItem.trim();
    const item: PriorityItem = {
      id: crypto.randomUUID(),
      text,
      completed: false,
      sort_order: items.length,
    };
    // Optimistic: update store immediately, save to Supabase in background
    const newItems = [...items, item];
    usePriorityStore.setState({ items: newItems });
    setNewItem('');
    setError('');
    addLog(`Added: "${text}"`);
    savePriorities(selectedDate, newItems).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to save');
      addLog(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    });
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
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(items, oldIndex, newIndex).map((item, idx) => ({
        ...item,
        sort_order: idx,
      }));
      // Update store immediately (no bounce — state change is instant)
      usePriorityStore.setState({ items: reordered });
      try {
        await savePriorities(selectedDate, reordered);
        addLog('Reordered priorities');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save order');
      }
    },
    [items, savePriorities, selectedDate, addLog]
  );

  const activeDragItem = activeDragId ? items.find((i) => i.id === activeDragId) : null;
  const activeDragIndex = activeDragId ? items.findIndex((i) => i.id === activeDragId) : -1;

  const toggleMic = async () => {
    if (isListening) {
      stopListening();
      setIsListening(false);
      addLog('Mic stopped');
      // Save current captured text as accumulated for next session
      accumulatedTextRef.current = capturedText;
    } else {
      liveText.current = '';
      setError('');
      setIsListening(true);
      addLog('Mic started');
      startListening({
        continuous: true,
        language: getLanguage(),
        onResult: (text) => {
          // Prepend any previously accumulated text
          const prefix = accumulatedTextRef.current;
          const combined = prefix ? prefix + ' ' + text : text;
          liveText.current = combined;
          setCapturedText(combined);
        },
        onEnd: () => {
          setIsListening(false);
          addLog('Mic auto-stopped (browser)');
          // Save accumulated on auto-stop too
          if (liveText.current.trim()) {
            accumulatedTextRef.current = liveText.current.trim();
            setCapturedText(liveText.current.trim());
          }
        },
        onError: (err) => {
          setIsListening(false);
          setError(`Mic error: ${err}`);
          addLog(`Mic error: ${err}`);
        },
      });
    }
  };

  const handleAddTasks = async () => {
    const text = capturedText.trim();
    if (!text) {
      addLog('No text to process');
      return;
    }

    if (isListening) {
      stopListening();
      setIsListening(false);
    }

    setProcessing(true);
    setError('');
    addLog(`Processing: "${text.substring(0, 50)}..."`);

    const currentItems = itemsRef.current;
    const currentGroceries = groceriesRef.current;

    // Use the full capture engine — classifies into priorities (date-aware), groceries, etc.
    try {
      const result = await classifyCapture(text);
      addLog(`Classified: ${result.priorities.length} tasks, ${result.groceries.length} grocery groups`);

      // Group tasks by resolved date
      const tasksByDate = new Map<string, PriorityTask[]>();
      for (const task of result.priorities) {
        const resolvedDate = resolveWhen(task.when, selectedDate);
        if (!tasksByDate.has(resolvedDate)) tasksByDate.set(resolvedDate, []);
        tasksByDate.get(resolvedDate)!.push(task);
      }

      // If no priorities and no groceries, save raw text as a task for selected date
      if (result.priorities.length === 0 && result.groceries.length === 0) {
        tasksByDate.set(selectedDate, [{ text, when: 'today' }]);
      }

      // Save tasks to each date
      for (const [dateStr, tasks] of tasksByDate) {
        let existingItems: PriorityItem[] = [];

        if (dateStr === selectedDate) {
          // Current date — use items from store
          existingItems = currentItems;
        } else {
          // Different date — fetch existing items from Supabase
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data } = await supabase
              .from('daily_priorities')
              .select('items')
              .eq('user_id', user.id)
              .eq('date', dateStr)
              .maybeSingle();
            existingItems = (data?.items as PriorityItem[]) ?? [];
          }
        }

        const newItems: PriorityItem[] = tasks.map((task, i) => ({
          id: crypto.randomUUID(),
          text: task.text,
          completed: false,
          sort_order: existingItems.length + i,
        }));

        const merged = [...existingItems, ...newItems];
        await savePriorities(dateStr, merged);

        const dateLabel = dateStr === selectedDate ? 'today' : dateStr;
        addLog(`Saved ${newItems.length} task(s) for ${dateLabel}`);
      }

      // Save groceries to selected date if any were detected
      if (result.groceries.length > 0) {
        const newGroceryGroups: GroceryGroup[] = result.groceries.map((g) => ({
          id: crypto.randomUUID(),
          store: g.store || 'General',
          items: g.items.map((itemName) => ({
            id: crypto.randomUUID(),
            name: itemName,
            completed: false,
          })),
        }));

        const mergedGroceries = [...currentGroceries];
        for (const newGroup of newGroceryGroups) {
          const existingGroup = mergedGroceries.find(
            (g) => g.store.toLowerCase() === newGroup.store.toLowerCase()
          );
          if (existingGroup) {
            existingGroup.items = [...existingGroup.items, ...newGroup.items];
          } else {
            mergedGroceries.push(newGroup);
          }
        }

        await saveGroceries(selectedDate, mergedGroceries);
        const totalNewItems = newGroceryGroups.reduce((sum, g) => sum + g.items.length, 0);
        addLog(`Saved ${totalNewItems} grocery item(s)`);
      }

      // Re-fetch current date to refresh the view
      await fetchPriorities(selectedDate);

      setCapturedText('');
      liveText.current = '';
      accumulatedTextRef.current = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`Capture engine failed: ${msg}, falling back to raw text`);

      // Fallback: save raw text as a single task
      try {
        const fallbackItem: PriorityItem = {
          id: crypto.randomUUID(),
          text,
          completed: false,
          sort_order: currentItems.length,
        };
        await savePriorities(selectedDate, [...currentItems, fallbackItem]);
        addLog('Saved raw text as task (fallback)');
        setCapturedText('');
        liveText.current = '';
        accumulatedTextRef.current = '';
      } catch (saveErr) {
        const saveMsg = saveErr instanceof Error ? saveErr.message : String(saveErr);
        setError(`Save failed: ${saveMsg}`);
        addLog(`Supabase save failed: ${saveMsg}`);
      }
    }

    setProcessing(false);
  };

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Tasks & Groceries</h1>
        <p className="text-sm text-text-secondary mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Date picker strip */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {weekDates.map((date) => {
          const dateStr = toLocalDateStr(date);
          const { label, dateNum } = formatDateBubble(date, todayDateStr);
          const isSelected = dateStr === selectedDate;
          return (
            <button
              key={dateStr}
              onClick={() => setSelectedDate(dateStr)}
              className={`flex flex-col items-center min-w-[52px] py-2 px-2 rounded-xl text-xs font-medium transition-colors ${
                isSelected
                  ? 'bg-primary text-white'
                  : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              <span className="text-[10px] uppercase">{label}</span>
              <span className="text-lg font-bold">{dateNum}</span>
            </button>
          );
        })}
      </div>

      {/* Add priority — input + add + mic */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
            placeholder="Add a priority..."
            className="flex-1 px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:border-primary outline-none text-sm"
          />
          <button
            onClick={handleAddItem}
            disabled={!newItem.trim()}
            className="px-4 py-3 bg-primary text-white rounded-xl font-medium text-sm disabled:opacity-40 hover:bg-primary-dark transition-colors"
          >
            Add
          </button>
          {speechSupported && (
            <button
              onClick={toggleMic}
              disabled={processing}
              className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                isListening ? 'bg-error' : 'bg-surface border border-border hover:border-primary'
              } ${processing ? 'opacity-40' : ''}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isListening ? 'white' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              </svg>
            </button>
          )}
        </div>

        {capturedText && (
          <div className="bg-surface rounded-xl p-3 space-y-2">
            <p className="text-sm text-text-primary">{capturedText}</p>
            <div className="flex gap-2">
              <button
                onClick={handleAddTasks}
                disabled={processing}
                className="flex-1 py-2.5 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50 text-sm"
              >
                {processing ? 'Processing...' : 'Add Tasks'}
              </button>
              <button
                onClick={() => { setCapturedText(''); liveText.current = ''; accumulatedTextRef.current = ''; addLog('Discarded text'); }}
                className="px-4 py-2.5 text-text-tertiary text-sm hover:text-text-secondary bg-surface-elevated rounded-xl"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-error/10 border border-error/30 rounded-xl p-3">
            <p className="text-sm text-error">{error}</p>
          </div>
        )}
      </div>

      {/* Priority items — numbered checkboxes, drag to reorder, swipe to delete */}
      {items.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Priorities</h2>
            <span className="text-xs text-text-tertiary">
              {items.filter((i) => i.completed).length}/{items.length}
            </span>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {items.map((item, index) => (
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
              {activeDragItem ? (
                <PriorityRowContent
                  item={activeDragItem}
                  index={activeDragIndex}
                  isDragOverlay
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* Groceries — swipe to delete items and groups */}
      {groceries.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Groceries</h2>
          {groceries.map((group) => (
            <SwipeToDelete key={group.id} onDelete={() => removeGroceryGroup(group.id)}>
              <div className="bg-surface rounded-xl border border-border p-3 space-y-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-text-secondary uppercase">{group.store}</p>
                  <span className="text-xs text-text-tertiary">
                    {group.items.filter((i) => i.completed).length}/{group.items.length}
                  </span>
                </div>
                {group.items.map((item) => (
                  <SwipeToDelete key={item.id} onDelete={() => removeGroceryItem(group.id, item.id)}>
                    <div className="flex items-center gap-2 py-1.5 bg-surface">
                      <button
                        onClick={() => toggleGroceryItem(group.id, item.id)}
                        className="flex items-center gap-2 flex-1"
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                          item.completed ? 'bg-success border-success' : 'border-border'
                        }`}>
                          {item.completed && <span className="text-white text-[10px]">✓</span>}
                        </div>
                        <span className={`text-sm ${item.completed ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
                          {item.name}
                        </span>
                      </button>
                    </div>
                  </SwipeToDelete>
                ))}
              </div>
            </SwipeToDelete>
          ))}
        </div>
      )}

      {/* Habits */}
      {(() => {
        const activeHabits = habits.filter((h) => h.is_active);
        const dateCompletions = completions[selectedDate] || new Set<string>();
        if (activeHabits.length === 0) return null;
        return (
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Habits</h2>
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
                  <button
                    onClick={() => toggleCompletion(habit.id, selectedDate)}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                      isDone ? 'bg-success border-success' : 'border-border hover:border-primary'
                    }`}
                  >
                    {isDone && <span className="text-white text-xs font-bold">✓</span>}
                  </button>
                  <span className={`text-sm ${isDone ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
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
      {items.length === 0 && groceries.length === 0 && habits.filter((h) => h.is_active).length === 0 && !loading && !processing && !capturedText && (
        <div className="text-center py-12 space-y-2">
          <p className="text-4xl">🎯</p>
          <p className="text-text-secondary text-sm">No tasks for today yet.</p>
        </div>
      )}

      {/* Activity log -- visible debug panel */}
      {log.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Activity Log</h2>
            <button onClick={() => setLog([])} className="text-xs text-text-tertiary hover:text-text-secondary">Clear</button>
          </div>
          <div className="bg-surface rounded-xl border border-border p-3 space-y-0.5">
            {log.map((entry, i) => (
              <p key={i} className="text-xs text-text-tertiary font-mono">{entry}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
