'use client';

// Single-list detail. Shows the list's tasks (open + completed) with
// a List | Matrix view toggle. Add a task at the bottom; tap a task
// to set Eisenhower flags via the shared TaskQuadrantSheet.
//
// Inbox can be renamed UI-wise but its is_inbox flag stays — we
// only block delete (server-side too: deleteList early-returns).

import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useListStore } from '@/stores/listStore';
import { useTaskStore, type Task } from '@/stores/taskStore';
import { MatrixView, type MatrixTask } from '@/components/MatrixView';
import { TaskCard } from '@/components/TaskCard';
import { TaskEditSheet } from '@/components/TaskEditSheet';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import { useUiStore } from '@/stores/uiStore';
import { toLocalDateStr } from '@/lib/dateUtils';
import { t } from '@/lib/translations';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ListDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  const lists = useListStore((s) => s.lists);
  const fetchLists = useListStore((s) => s.fetchLists);
  const renameList = useListStore((s) => s.renameList);
  const deleteList = useListStore((s) => s.deleteList);
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
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  // Done section is collapsed by default — reduces visual clutter on
  // active lists; expand to verify completed work.
  const [doneCollapsed, setDoneCollapsed] = useState(true);

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
  const done = listTasks.filter((task) => task.completed);

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

  const handleRename = async () => {
    if (!list) return;
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === list.name) {
      setEditingName(false);
      return;
    }
    await renameList(list.id, trimmed);
    setEditingName(false);
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

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-24 space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/lists" className="text-sm text-primary font-medium">
          &lsaquo; {t('tab.lists')}
        </Link>
        {!list.is_inbox && (
          <button
            onClick={handleDelete}
            className="text-xs text-text-tertiary hover:text-error transition-colors"
          >
            Delete list
          </button>
        )}
      </div>

      {/* Title — tap to rename (skipped for Inbox) */}
      {editingName && !list.is_inbox ? (
        <div className="flex gap-2">
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            autoFocus
            className="flex-1 px-3 py-2 bg-surface border border-border focus:border-primary rounded-lg text-base font-bold text-text-primary outline-none"
          />
          <button
            onClick={handleRename}
            className="px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium"
          >
            {t('common.done')}
          </button>
        </div>
      ) : (
        <button
          onClick={() => {
            if (list.is_inbox) return;
            setDraftName(list.name);
            setEditingName(true);
          }}
          className="text-left"
        >
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <span>{list.is_inbox ? '📥' : list.icon ?? '📁'}</span>
            <span>{list.is_inbox ? t('inbox.label') : list.name}</span>
          </h1>
        </button>
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
                  {open.map((task) => (
                    <SwipeToDelete
                      key={task.id}
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
                        // Empty row tap toggles done. Tap on text
                        // itself opens the edit sheet (TaskCard
                        // handles that branch when onEdit is set).
                        onTap={() => toggleComplete(task.id)}
                        onEdit={() => setQuadrantTask(task)}
                        showDate
                      />
                    </SwipeToDelete>
                  ))}
                </div>
              )}
              {done.length > 0 && (
                <div className="space-y-1.5 pt-3">
                  <button
                    type="button"
                    onClick={() => setDoneCollapsed((c) => !c)}
                    className="w-full flex items-center justify-between text-xs uppercase tracking-wider text-text-tertiary font-semibold py-1 hover:text-text-secondary transition-colors"
                    aria-expanded={!doneCollapsed}
                  >
                    <span>
                      Done <span className="text-text-tertiary/70">({done.length})</span>
                    </span>
                    <span aria-hidden className="text-base leading-none">
                      {doneCollapsed ? '▸' : '▾'}
                    </span>
                  </button>
                  {!doneCollapsed && done.map((task) => (
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
            </>
          )}
        </>
      )}

      <TaskEditSheet
        task={quadrantTask}
        onClose={() => setQuadrantTask(null)}
      />
    </div>
  );
}
