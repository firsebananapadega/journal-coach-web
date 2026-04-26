'use client';

// Eisenhower matrix view of a list of tasks. 2×2 grid of quadrants
// plus an Unsorted stack. Tasks can be DRAGGED between quadrants to
// reassign their urgent/important flags — dropping into Q1 sets both
// true, Q2 important-only, Q3 urgent-only, Q4 both false, Unsorted
// both false.
//
// Quadrant colors mirror the standard productivity-matrix palette:
//   Q1 Do        — red    (urgent + important)
//   Q2 Schedule  — amber  (important, not urgent)
//   Q3 Delegate  — blue   (urgent, not important)
//   Q4 Drop      — gray   (neither)
//
// Interaction:
//   - Press-and-hold (250ms) to start dragging a task
//   - Drop on another quadrant → onSetFlags(id, {urgent, important})
//   - Single tap → onTapTask(task) — caller opens a sheet for manual
//     flag editing + completion toggle
//
// Cognitive-load research suggests ≤8 tasks per quadrant; we surface
// a soft warning when a quadrant exceeds that.

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '@/lib/translations';

const SOFT_LIMIT = 8;

export interface MatrixTask {
  id: string;
  text: string;
  urgent?: boolean;
  important?: boolean;
  /** True once the user has explicitly placed this into ANY quadrant
   *  (Q1/Q2/Q3/Q4). Distinguishes Q4 (Drop) from Unsorted — both
   *  have urgent=false + important=false. */
  triaged?: boolean;
  completed: boolean;
}

type QuadrantId = 'q1' | 'q2' | 'q3' | 'q4' | 'unsorted';

interface QuadrantFlags {
  urgent: boolean;
  important: boolean;
  triaged: boolean;
}

const QUADRANT_FLAGS: Record<QuadrantId, QuadrantFlags> = {
  q1: { urgent: true, important: true, triaged: true },
  q2: { urgent: false, important: true, triaged: true },
  q3: { urgent: true, important: false, triaged: true },
  q4: { urgent: false, important: false, triaged: true },
  // Unsorted is the only state where triaged=false. That's the bit
  // that disambiguates it from Q4: both have urgent=false +
  // important=false, but only Unsorted has triaged=false.
  unsorted: { urgent: false, important: false, triaged: false },
};

interface QuadrantStyle {
  border: string;
  bg: string;
  accent: string;
  text: string;
  ring: string;
}

const QUADRANT_STYLES: Record<QuadrantId, QuadrantStyle> = {
  q1: {
    border: 'border-red-500/40',
    bg: 'bg-red-500/5',
    accent: 'text-red-600 dark:text-red-400',
    text: 'text-red-700 dark:text-red-300',
    ring: 'ring-red-500/50',
  },
  q2: {
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/5',
    accent: 'text-amber-600 dark:text-amber-400',
    text: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-500/50',
  },
  q3: {
    border: 'border-blue-500/40',
    bg: 'bg-blue-500/5',
    accent: 'text-blue-600 dark:text-blue-400',
    text: 'text-blue-700 dark:text-blue-300',
    ring: 'ring-blue-500/50',
  },
  q4: {
    border: 'border-gray-400/40',
    bg: 'bg-gray-400/5',
    accent: 'text-gray-500 dark:text-gray-400',
    text: 'text-gray-600 dark:text-gray-300',
    ring: 'ring-gray-400/50',
  },
  unsorted: {
    border: 'border-border',
    bg: 'bg-surface',
    accent: 'text-text-tertiary',
    text: 'text-text-secondary',
    ring: 'ring-primary/50',
  },
};

function quadrantOf(item: MatrixTask): QuadrantId {
  const u = !!item.urgent;
  const i = !!item.important;
  // Untriaged + neither flag = the "haven't sorted this yet" pile.
  // Anything triaged falls into Q1/Q2/Q3/Q4 by its flag combo —
  // Q4 (Drop) is the explicit "neither urgent nor important AND
  // I've decided that on purpose" state.
  if (!item.triaged && !u && !i) return 'unsorted';
  if (u && i) return 'q1';
  if (!u && i) return 'q2';
  if (u && !i) return 'q3';
  return 'q4';
}

// Draggable task chip. `onTap` fires only on a clean tap (no drag);
// dnd-kit's press delay + tolerance disambiguate.
function DraggableTask({
  task,
  onTap,
  variant = 'q',
}: {
  task: MatrixTask;
  onTap: () => void;
  variant?: 'q' | 'unsorted';
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
  });
  const base =
    variant === 'unsorted'
      ? 'block w-full text-left text-sm px-3 py-2 rounded-lg bg-surface-elevated border border-transparent hover:border-border transition-colors leading-snug'
      : 'block w-full text-left text-xs px-2 py-1.5 rounded-md bg-surface/80 border border-transparent hover:border-border transition-colors leading-snug';
  // No `whileTap` here on purpose — framer-motion's tap-shrink fights
  // @dnd-kit's 250 ms press-and-hold for the same gesture window and
  // makes the drag activation point misalign with the finger. The
  // DragOverlay below provides the visual feedback during drag; the
  // press itself doesn't need its own animation.
  return (
    <button
      ref={setNodeRef}
      onClick={onTap}
      className={`${base} ${
        task.completed ? 'line-through text-text-tertiary' : 'text-text-primary'
      } ${isDragging ? 'opacity-0' : ''}`}
      style={{ touchAction: 'none' }}
      {...listeners}
      {...attributes}
    >
      {task.text}
    </button>
  );
}

interface QuadrantProps {
  id: QuadrantId;
  title: string;
  subtitle: string;
  tasks: MatrixTask[];
  onTapTask: (t: MatrixTask) => void;
}

function Quadrant({ id, title, subtitle, tasks, onTapTask }: QuadrantProps) {
  const style = QUADRANT_STYLES[id];
  const overflow = tasks.length > SOFT_LIMIT;
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-2xl border ${style.border} ${style.bg} p-3 min-h-[140px] transition-shadow ${
        isOver ? `ring-2 ${style.ring}` : ''
      }`}
    >
      <div className="flex items-baseline justify-between gap-1 mb-2">
        <p className={`text-sm font-bold ${style.text} leading-none`}>{title}</p>
        <span
          className={`text-[11px] font-semibold tabular-nums ${style.accent}`}
        >
          {tasks.length}
        </span>
      </div>
      <p className={`text-[10px] uppercase tracking-wider ${style.accent} mb-2`}>
        {subtitle}
      </p>

      <div className="flex-1 space-y-1.5 overflow-hidden">
        {tasks.length === 0 ? (
          <p className="text-[11px] text-text-tertiary italic">—</p>
        ) : (
          tasks.slice(0, 5).map((task) => (
            <DraggableTask
              key={task.id}
              task={task}
              onTap={() => onTapTask(task)}
            />
          ))
        )}
        {tasks.length > 5 && (
          <p className={`text-[10px] ${style.accent} italic pl-1`}>
            +{tasks.length - 5} more
          </p>
        )}
      </div>

      {overflow && (
        <p className={`text-[10px] ${style.accent} mt-2 italic`}>
          {t('matrix.tooMany')}
        </p>
      )}
    </div>
  );
}

interface MatrixViewProps {
  items: MatrixTask[];
  onTapTask: (item: MatrixTask) => void;
  // Fires after a successful drag-drop between quadrants. Callers
  // wire this to priorityStore.setQuadrant / taskStore.setQuadrant.
  // `triaged` flips false → true when dropped into Q1/Q2/Q3/Q4 and
  // back to false when dropped into Unsorted.
  onSetFlags?: (
    id: string,
    flags: { urgent: boolean; important: boolean; triaged: boolean },
  ) => void;
}

export function MatrixView({ items, onTapTask, onSetFlags }: MatrixViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // 250ms press-and-hold before drag starts — matches the /today list
  // drag timing so the two interactions feel identical. Short enough
  // that a deliberate press is clearly a drag, long enough that a tap
  // is still a tap. Touch + pointer both wired.
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  if (items.length === 0) {
    return (
      <div className="bg-surface rounded-2xl border border-border p-8 text-center">
        <p className="text-sm text-text-tertiary leading-snug">
          {t('matrix.empty')}
        </p>
      </div>
    );
  }

  const buckets: Record<QuadrantId, MatrixTask[]> = {
    q1: [], q2: [], q3: [], q4: [], unsorted: [],
  };
  for (const item of items) buckets[quadrantOf(item)].push(item);

  const activeTask = activeId ? items.find((i) => i.id === activeId) ?? null : null;

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as string);
  };
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const targetQ = over.id as QuadrantId;
    const flags = QUADRANT_FLAGS[targetQ];
    if (!flags) return;
    const current = items.find((i) => i.id === active.id);
    if (!current) return;
    // No-op when dropped on the same quadrant it was already in
    // (urgent + important + triaged all match).
    if (
      !!current.urgent === flags.urgent &&
      !!current.important === flags.important &&
      !!current.triaged === flags.triaged
    ) {
      return;
    }
    onSetFlags?.(active.id as string, flags);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Quadrant
            id="q1"
            title={t('matrix.q1.title')}
            subtitle={t('matrix.q1.subtitle')}
            tasks={buckets.q1}
            onTapTask={onTapTask}
          />
          <Quadrant
            id="q2"
            title={t('matrix.q2.title')}
            subtitle={t('matrix.q2.subtitle')}
            tasks={buckets.q2}
            onTapTask={onTapTask}
          />
          <Quadrant
            id="q3"
            title={t('matrix.q3.title')}
            subtitle={t('matrix.q3.subtitle')}
            tasks={buckets.q3}
            onTapTask={onTapTask}
          />
          <Quadrant
            id="q4"
            title={t('matrix.q4.title')}
            subtitle={t('matrix.q4.subtitle')}
            tasks={buckets.q4}
            onTapTask={onTapTask}
          />
        </div>

        {buckets.unsorted.length > 0 && (
          <UnsortedZone
            tasks={buckets.unsorted}
            onTapTask={onTapTask}
          />
        )}
      </div>

      {/* Portal the DragOverlay to <body> so it's never trapped inside
          a transformed ancestor (WallShell applies a transform during
          flip animations). DndContext is React-context-based and works
          through portals — defense-in-depth against future ancestors
          that might add a transform. */}
      {typeof document !== 'undefined' &&
        createPortal(
          <DragOverlay dropAnimation={null}>
            {activeTask ? (
              <div className="px-2 py-1.5 rounded-md bg-surface border border-primary shadow-warm-md text-xs text-text-primary leading-snug max-w-[240px]">
                {activeTask.text}
              </div>
            ) : null}
          </DragOverlay>,
          document.body,
        )}
    </DndContext>
  );
}

function UnsortedZone({
  tasks,
  onTapTask,
}: {
  tasks: MatrixTask[];
  onTapTask: (t: MatrixTask) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unsorted' });
  return (
    <div
      ref={setNodeRef}
      className={`bg-surface rounded-2xl border border-border p-3 space-y-2 transition-shadow ${
        isOver ? 'ring-2 ring-primary/50' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-text-tertiary font-semibold">
          {t('matrix.unsorted')}{' '}
          <span className="text-text-secondary">({tasks.length})</span>
        </p>
      </div>
      <p className="text-[11px] text-text-tertiary leading-snug">
        {t('matrix.unsortedHint')}
      </p>
      <div className="space-y-1.5 pt-1">
        {tasks.map((task) => (
          <DraggableTask
            key={task.id}
            task={task}
            onTap={() => onTapTask(task)}
            variant="unsorted"
          />
        ))}
      </div>
    </div>
  );
}
