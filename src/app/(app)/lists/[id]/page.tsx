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
  // setQuadrant lives inside TaskEditSheet via useTaskStore directly.
  // removeTask is reachable via the Delete button inside TaskEditSheet.

  const [viewMode, setViewMode] = useState<'list' | 'matrix'>('list');
  const [newText, setNewText] = useState('');
  const [adding, setAdding] = useState(false);
  const [quadrantTask, setQuadrantTask] = useState<Task | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  // Done section is collapsed by default — reduces visual clutter on
  // active lists; expand to verify completed work.
  const [doneCollapsed, setDoneCollapsed] = useState(true);

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
                    <TaskCard
                      key={task.id}
                      task={task}
                      onToggle={() => toggleComplete(task.id)}
                      // Tap on the body of the row toggles done —
                      // the user wants the row to behave like a
                      // checkbox extension, not an edit affordance.
                      onTap={() => toggleComplete(task.id)}
                      // Pencil icon opens the rich edit sheet.
                      onEdit={() => setQuadrantTask(task)}
                      showDate
                    />
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
