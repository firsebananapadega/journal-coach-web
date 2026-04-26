'use client';

// Upcoming — forward-looking calendar of scheduled tasks. Two views:
//   - Week: vertical list of next 7 days, each with its tasks
//   - Month: 6×7 grid with task-count dots per day; tap to see that
//     day's tasks below the grid
//
// Tasks come from the new tasks table (taskStore). To add a scheduled
// task, tap "+ New" in the header — opens an inline form with text +
// date picker + optional list. Tap a day in Month view to pre-fill
// that date.

import { useEffect, useMemo, useState } from 'react';
import { useTaskStore } from '@/stores/taskStore';
import { useListStore } from '@/stores/listStore';
import { CalendarWeekList } from '@/components/CalendarWeekList';
import { CalendarMonthGrid } from '@/components/CalendarMonthGrid';
import { TaskCard } from '@/components/TaskCard';
import { TaskEditSheet } from '@/components/TaskEditSheet';
import { t } from '@/lib/translations';
import { toLocalDateStr } from '@/lib/dateUtils';
import { getLanguage } from '@/lib/language';
import type { Task } from '@/stores/taskStore';

type ViewMode = 'week' | 'month';

export default function UpcomingPage() {
  const tasks = useTaskStore((s) => s.tasks);
  const fetchTasks = useTaskStore((s) => s.fetchAll);
  const tasksError = useTaskStore((s) => s.error);
  const addTask = useTaskStore((s) => s.addTask);
  const toggleComplete = useTaskStore((s) => s.toggleComplete);
  // setQuadrant lives inside TaskEditSheet via useTaskStore directly.
  const lists = useListStore((s) => s.lists);
  const fetchLists = useListStore((s) => s.fetchLists);
  const ensureInbox = useListStore((s) => s.ensureInbox);

  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [creating, setCreating] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftDate, setDraftDate] = useState<string>(() =>
    toLocalDateStr(new Date()),
  );
  const [draftListId, setDraftListId] = useState<string | ''>('');
  const [busy, setBusy] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [quadrantTask, setQuadrantTask] = useState<Task | null>(null);

  useEffect(() => {
    fetchTasks();
    fetchLists();
  }, [fetchTasks, fetchLists]);

  // Default the list dropdown to Inbox once it loads.
  useEffect(() => {
    if (!draftListId && lists.length > 0) {
      const inbox = lists.find((l) => l.is_inbox);
      if (inbox) setDraftListId(inbox.id);
    }
  }, [lists, draftListId]);

  const tablesMissing = tasksError === 'tasks table not found';

  // For Month view, surface tasks for the selected date.
  const tasksForSelected = useMemo(() => {
    if (!selectedDate) return [];
    return tasks.filter((task) => task.due_date === selectedDate);
  }, [tasks, selectedDate]);

  const handleCreate = async () => {
    if (!draftText.trim()) return;
    setBusy(true);
    try {
      let listId: string | null = draftListId || null;
      if (!listId) {
        listId = await ensureInbox();
      }
      const created = await addTask({
        text: draftText.trim(),
        list_id: listId,
        due_date: draftDate || null,
      });
      if (created) {
        setDraftText('');
        setCreating(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const openCreate = (forDate?: string) => {
    if (forDate) setDraftDate(forDate);
    setCreating(true);
  };

  const formatSelectedDate = (yyyymmdd: string) => {
    const d = new Date(yyyymmdd + 'T00:00:00');
    return d.toLocaleDateString(getLanguage(), {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-24 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">
          {t('tab.upcoming')}
        </h1>
        {!creating && !tablesMissing && (
          <button
            onClick={() => openCreate()}
            className="text-sm text-primary font-medium"
          >
            + New
          </button>
        )}
      </div>

      {tablesMissing && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            Database setup needed
          </p>
          <p className="text-xs text-amber-700/80 dark:text-amber-300/80 leading-snug">
            Apply <span className="font-mono">supabase/migrations/20260419_lists_and_tasks.sql</span> in your Supabase SQL editor to enable scheduled tasks.
          </p>
        </div>
      )}

      {creating && (
        <div className="bg-surface rounded-2xl border border-border p-3 space-y-2">
          <input
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="What's coming up?"
            autoFocus
            className="w-full px-3 py-2 bg-bg border border-border focus:border-primary rounded-lg text-sm text-text-primary outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              className="px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text-primary outline-none"
            />
            <select
              value={draftListId}
              onChange={(e) => setDraftListId(e.target.value)}
              className="px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text-primary outline-none"
            >
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.is_inbox ? t('inbox.label') : l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setCreating(false);
                setDraftText('');
              }}
              className="flex-1 px-3 py-2 bg-surface-elevated text-text-secondary rounded-lg text-sm font-medium"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleCreate}
              disabled={busy || !draftText.trim()}
              className="flex-1 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-40"
            >
              {busy ? '...' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {/* Week | Month toggle */}
      <div className="inline-flex p-0.5 rounded-xl bg-surface border border-border">
        <button
          onClick={() => setViewMode('week')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            viewMode === 'week'
              ? 'bg-primary text-white shadow-warm-sm'
              : 'text-text-tertiary hover:text-text-secondary'
          }`}
          aria-pressed={viewMode === 'week'}
        >
          {t('view.week')}
        </button>
        <button
          onClick={() => setViewMode('month')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            viewMode === 'month'
              ? 'bg-primary text-white shadow-warm-sm'
              : 'text-text-tertiary hover:text-text-secondary'
          }`}
          aria-pressed={viewMode === 'month'}
        >
          {t('view.month')}
        </button>
      </div>

      {viewMode === 'week' ? (
        <CalendarWeekList
          tasks={tasks}
          onToggle={(id) => toggleComplete(id)}
          // Tap-on-row toggles done; the pencil button opens the
          // edit sheet. Mirrors /lists/[id]'s wiring.
          onTap={(task) => toggleComplete(task.id)}
          onEdit={(task) => setQuadrantTask(task)}
          onAddForDate={(d) => openCreate(d)}
        />
      ) : (
        <div className="space-y-4">
          <CalendarMonthGrid
            tasks={tasks}
            selectedDate={selectedDate}
            onSelectDate={(d) => setSelectedDate(d)}
          />

          {selectedDate && (
            <div className="bg-surface rounded-2xl border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-text-primary capitalize">
                  {formatSelectedDate(selectedDate)}
                </p>
                <button
                  onClick={() => openCreate(selectedDate)}
                  className="text-xs text-primary font-medium"
                >
                  + Add
                </button>
              </div>
              {tasksForSelected.length === 0 ? (
                <p className="text-xs text-text-tertiary italic">
                  Nothing scheduled.
                </p>
              ) : (
                <div className="space-y-1">
                  {tasksForSelected.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onToggle={() => toggleComplete(task.id)}
                      onTap={() => toggleComplete(task.id)}
                      onEdit={() => setQuadrantTask(task)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <TaskEditSheet
        task={quadrantTask}
        onClose={() => setQuadrantTask(null)}
      />
    </div>
  );
}
