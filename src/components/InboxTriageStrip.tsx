'use client';

// Triage strip rendered above the Inbox task list. Each non-Inbox
// list is a small drop-target tile; press-and-hold a task in the list
// below + drag it onto a tile to reassign it to that folder. Lifts
// the dnd-kit recipe (sensors + portal + touchAction) directly from
// MatrixView so mobile drag works on first paint.
//
// The strip itself only renders the DROPPABLE half (the tiles). The
// DraggableTaskRow + DragOverlay live on the parent /lists/[id] page
// so a single DndContext spans both sides of the gesture.

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { ListRecord } from '@/stores/listStore';

interface Props {
  lists: ListRecord[];                       // pre-filtered: !is_inbox && !archived
  taskCounts: Map<string, number>;           // listId → open-task count for the badge
  onCreateList: (name: string) => Promise<ListRecord | null>;
}

export default function InboxTriageStrip({ lists, taskCounts, onCreateList }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold px-1">
        Triage into …
      </p>
      <div
        className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1 -mx-1 px-1"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {lists.length === 0 && (
          <p className="text-[11px] text-text-tertiary leading-snug self-center pr-2">
            Create a folder, then drag tasks into it.
          </p>
        )}
        {lists.map((list) => (
          <FolderTile
            key={list.id}
            list={list}
            count={taskCounts.get(list.id) ?? 0}
          />
        ))}
        <NewFolderTile onCreate={onCreateList} />
      </div>
    </div>
  );
}

function FolderTile({ list, count }: { list: ListRecord; count: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: list.id });
  return (
    <div
      ref={setNodeRef}
      className={`snap-start shrink-0 w-[88px] h-[88px] rounded-2xl border bg-surface flex flex-col items-center justify-center px-2 text-center transition-all ${
        isOver
          ? 'border-primary ring-2 ring-primary/40 bg-primary/5 scale-105'
          : 'border-border'
      }`}
      aria-label={`Drop here to move into ${list.name}`}
    >
      <span className="text-2xl leading-none mb-1" aria-hidden>
        {list.icon ?? '📁'}
      </span>
      <span className="text-[11px] font-semibold text-text-primary leading-tight line-clamp-1 w-full">
        {list.name}
      </span>
      {count > 0 && (
        <span className="text-[10px] text-text-tertiary tabular-nums mt-0.5">
          {count}
        </span>
      )}
    </div>
  );
}

function NewFolderTile({ onCreate }: { onCreate: (name: string) => Promise<ListRecord | null> }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const commit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) {
      setEditing(false);
      setName('');
      return;
    }
    setBusy(true);
    try {
      await onCreate(trimmed);
    } finally {
      setBusy(false);
      setEditing(false);
      setName('');
    }
  };

  if (editing) {
    return (
      <div className="snap-start shrink-0 w-[120px] h-[88px] rounded-2xl border-2 border-dashed border-primary/60 bg-primary/5 flex flex-col items-center justify-center px-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(false);
              setName('');
            }
          }}
          placeholder="Folder name"
          maxLength={40}
          className="w-full text-[12px] text-center bg-transparent text-text-primary outline-none placeholder:text-text-tertiary"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="snap-start shrink-0 w-[88px] h-[88px] rounded-2xl border-2 border-dashed border-border hover:border-primary/60 bg-transparent flex flex-col items-center justify-center text-text-tertiary hover:text-primary transition-colors"
      aria-label="Create a new folder"
    >
      <span className="text-2xl leading-none mb-1" aria-hidden>+</span>
      <span className="text-[11px] font-semibold leading-tight">New</span>
    </button>
  );
}
