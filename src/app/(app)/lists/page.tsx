'use client';

// Lists landing — projects + Inbox. Inbox is system-created (one per
// user) and pinned to the top whenever it has items waiting. User
// lists follow, with a per-list count of open tasks.
//
// Tap a list → /lists/[id]. Tap "+ New list" → opens the inline
// create form. Tables not yet migrated → friendly empty state with
// a hint that the SQL needs to be applied.

import Link from 'next/link';
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useListStore, type ListRecord } from '@/stores/listStore';
import { useTaskStore } from '@/stores/taskStore';
import { t } from '@/lib/translations';

export default function ListsPage() {
  const lists = useListStore((s) => s.lists);
  const fetchLists = useListStore((s) => s.fetchLists);
  const ensureInbox = useListStore((s) => s.ensureInbox);
  const createList = useListStore((s) => s.createList);
  const reorderLists = useListStore((s) => s.reorderLists);
  const listsError = useListStore((s) => s.error);
  const tasks = useTaskStore((s) => s.tasks);
  const fetchTasks = useTaskStore((s) => s.fetchAll);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  // Reorder mode — only applies to user lists; Inbox stays pinned.
  const [reordering, setReordering] = useState(false);
  const [draftOrder, setDraftOrder] = useState<ListRecord[] | null>(null);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  useEffect(() => {
    fetchLists();
    fetchTasks();
  }, [fetchLists, fetchTasks]);

  // Make sure Inbox exists once we know who the user is.
  useEffect(() => {
    void ensureInbox();
  }, [ensureInbox]);

  const counts = useMemo(() => {
    const map = new Map<string | null, number>();
    for (const task of tasks) {
      if (task.completed) continue;
      const key = task.list_id;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [tasks]);

  const inbox = lists.find((l) => l.is_inbox);
  const userLists = lists.filter((l) => !l.is_inbox);
  const inboxCount = inbox ? counts.get(inbox.id) ?? 0 : 0;
  const displayedUserLists = reordering && draftOrder ? draftOrder : userLists;

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setDraftOrder((prev) => {
        const base = prev ?? userLists;
        const oldIndex = base.findIndex((l) => l.id === active.id);
        const newIndex = base.findIndex((l) => l.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return base;
        return arrayMove(base, oldIndex, newIndex);
      });
    },
    [userLists],
  );

  const enterReorderMode = () => {
    setDraftOrder(userLists);
    setReordering(true);
  };
  const finishReorder = async () => {
    const finalOrder = draftOrder ?? userLists;
    setReordering(false);
    await reorderLists(finalOrder.map((l) => l.id));
    setDraftOrder(null);
  };
  const cancelReorder = () => {
    setReordering(false);
    setDraftOrder(null);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const created = await createList(newName.trim());
      if (created) {
        setNewName('');
        setCreating(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const tablesMissing = listsError === 'lists table not found';

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-24 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-text-primary">{t('tab.lists')}</h1>
        {!tablesMissing && (
          <div className="flex items-center gap-3">
            {/* Reorder button — only when there's >1 user list to
                reorder. Hidden during create-list mode so the
                buttons don't pile up. Inbox is pinned (not reorderable). */}
            {!creating && userLists.length > 1 && !reordering && (
              <button
                type="button"
                onClick={enterReorderMode}
                className="text-xs font-semibold text-primary hover:underline"
              >
                {t('common.reorder')}
              </button>
            )}
            {reordering && (
              <>
                <button
                  type="button"
                  onClick={cancelReorder}
                  className="text-xs text-text-tertiary hover:text-text-secondary"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={finishReorder}
                  className="text-xs font-semibold text-white bg-primary rounded-full px-3 py-1.5 shadow-warm-sm"
                >
                  {t('common.done')}
                </button>
              </>
            )}
            {!creating && !reordering && (
              <button
                onClick={() => setCreating(true)}
                className="text-sm text-primary font-medium"
              >
                + New
              </button>
            )}
          </div>
        )}
      </div>

      {tablesMissing && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            Database setup needed
          </p>
          <p className="text-xs text-amber-700/80 dark:text-amber-300/80 leading-snug">
            Apply the migration in <span className="font-mono">supabase/migrations/20260419_lists_and_tasks.sql</span> via your Supabase SQL editor to enable Lists, Upcoming, and the Eisenhower view in lists.
          </p>
        </div>
      )}

      {creating && (
        <div className="bg-surface rounded-2xl border border-border p-3 space-y-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="List name (e.g. Trip planning, Work)"
            autoFocus
            className="w-full px-3 py-2 bg-bg border border-border focus:border-primary rounded-lg text-sm text-text-primary outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                setCreating(false);
                setNewName('');
              }}
              className="flex-1 px-3 py-2 bg-surface-elevated text-text-secondary rounded-lg text-sm font-medium"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleCreate}
              disabled={busy || !newName.trim()}
              className="flex-1 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-40"
            >
              {busy ? '...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Inbox card — always shown so the concept is discoverable. */}
      {inbox && (
        <Link
          href={`/lists/${inbox.id}`}
          className="block bg-surface rounded-2xl border border-border p-4 flex items-center gap-3 hover:border-primary transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-primary text-lg flex-shrink-0">
            📥
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-text-primary">
              {t('inbox.label')}
            </p>
            <p className="text-xs text-text-tertiary">
              {inboxCount === 0
                ? t('inbox.empty')
                : `${inboxCount} to triage`}
            </p>
          </div>
          {inboxCount > 0 && (
            <span className="text-xs font-bold tabular-nums px-2 py-1 rounded-full bg-primary text-white">
              {inboxCount}
            </span>
          )}
        </Link>
      )}

      {/* User lists — when reordering, rows render via SortableListRow
          and Link navigation is suppressed. Otherwise it's the same
          tap-to-open Link list as before. */}
      {displayedUserLists.length > 0 ? (
        reordering ? (
          <DndContext
            sensors={dndSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={displayedUserLists.map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {displayedUserLists.map((l) => {
                  const count = counts.get(l.id) ?? 0;
                  return (
                    <SortableListRow key={l.id} list={l} count={count} />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="space-y-2">
            {displayedUserLists.map((l) => {
              const count = counts.get(l.id) ?? 0;
              return (
                <Link
                  key={l.id}
                  href={`/lists/${l.id}`}
                  className="block bg-surface rounded-2xl border border-border p-4 flex items-center gap-3 hover:border-primary transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-surface-elevated flex items-center justify-center text-lg flex-shrink-0">
                    {l.icon ?? '📁'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-text-primary truncate">
                      {l.name}
                    </p>
                    <p className="text-xs text-text-tertiary">
                      {count === 0
                        ? 'Empty'
                        : `${count} open`}
                    </p>
                  </div>
                  <span className="text-text-tertiary">›</span>
                </Link>
              );
            })}
          </div>
        )
      ) : (
        !tablesMissing && (
          <p className="text-sm text-text-tertiary leading-snug">
            No lists yet. Create one for each project or area you want to keep separate.
          </p>
        )
      )}
    </div>
  );
}

// Sortable row used during reorder mode. Mirrors the regular list
// card visually but is a draggable element instead of a Link, so
// taps don't navigate while the user is rearranging.
function SortableListRow({ list, count }: { list: ListRecord; count: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: list.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    touchAction: 'none',
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-surface rounded-2xl border border-primary/30 shadow-warm-sm p-4 flex items-center gap-3 cursor-grab active:cursor-grabbing"
    >
      <div className="w-10 h-10 rounded-full bg-surface-elevated flex items-center justify-center text-lg flex-shrink-0">
        {list.icon ?? '📁'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold text-text-primary truncate">{list.name}</p>
        <p className="text-xs text-text-tertiary">
          {count === 0 ? 'Empty' : `${count} open`}
        </p>
      </div>
      <span className="text-text-tertiary shrink-0" aria-hidden>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor">
          <circle cx={9} cy={6} r={1.5} />
          <circle cx={15} cy={6} r={1.5} />
          <circle cx={9} cy={12} r={1.5} />
          <circle cx={15} cy={12} r={1.5} />
          <circle cx={9} cy={18} r={1.5} />
          <circle cx={15} cy={18} r={1.5} />
        </svg>
      </span>
    </div>
  );
}
