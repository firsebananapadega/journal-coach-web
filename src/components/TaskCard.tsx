'use client';

// Reusable task row used in /lists/[id], /upcoming Week view, and
// future surfaces. Renders text + completion checkbox + optional
// time/date chips + a trailing menu trigger.
//
// Behaviors:
//   - Tap checkbox → onToggle (completed flip)
//   - Tap text →
//       inlineEdit=true  → swap text with auto-focused textarea so
//         the user can fix typos with just the keyboard (used on
//         /today; no full sheet)
//       inlineEdit=false → click bubbles up to the row's onTap
//         (used on /lists and /upcoming, where tap-text means toggle)
//   - Tap empty area of the row → onTap (callers wire to onToggle on
//     /lists and /upcoming so the row body acts as an extended
//     checkbox; /priorities still wires onTap to the quadrant sheet)
//   - Tap pencil (when onEdit supplied) → full TaskEditSheet
//
// Stays presentational — the page owns the store calls.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Task } from '@/stores/taskStore';
import { prefersReducedMotion } from '@/lib/motionVariants';
import TaskReminderChip from '@/components/tasks/TaskReminderChip';
import { useTaskStore } from '@/stores/taskStore';

interface Props {
  task: Task;
  onToggle: () => void;
  /** Called when the user taps the body of the row (not the
   *  checkbox or the edit button). Pages typically wire this to
   *  the same toggle handler — tapping the text marks done/undone. */
  onTap?: () => void;
  /** Renders a trailing pencil icon when supplied. Tap opens the
   *  caller's edit sheet (TaskEditSheet on /lists/[id] etc.).
   *  Replaces the previous trash-icon delete affordance — delete
   *  is now inside the edit sheet so the row stays focused. */
  onEdit?: () => void;
  /** When true, tapping the text starts inline-edit mode instead of
   *  bubbling up to the row's onTap. The text is replaced with an
   *  auto-focused textarea; saving on blur or Enter calls
   *  taskStore.updateTask. Used on /today where the user wants to
   *  fix a typo with just the keyboard, no modal. */
  inlineEdit?: boolean;
  showDate?: boolean;
  // Optional priority number (1-based) rendered as a leading bubble.
  // Used by Today / Upcoming / List views where users order tasks by
  // importance. Omit on contexts where a number would be meaningless
  // (e.g. Month-view day preview with mixed dates).
  index?: number;
  // Drag handle listeners from useSortable. When present, a handle
  // icon is rendered and receives the listeners; when absent, the
  // card is static. Keeps the card dumb — no dnd-kit import required.
  dragHandleProps?: Record<string, unknown>;
}

export function TaskCard({
  task,
  onToggle,
  onTap,
  onEdit,
  inlineEdit = false,
  showDate,
  index,
  dragHandleProps,
}: Props) {
  const updateTask = useTaskStore((s) => s.updateTask);
  const reminderFired =
    !!task.remind_sent_at && !!task.remind_at && new Date(task.remind_at).getTime() < Date.now();

  // Inline-edit state. Local to TaskCard so a re-render of the
  // parent list doesn't blow it away while the user is typing.
  const [isEditingInline, setIsEditingInline] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Reset draft when the task text changes from outside (e.g.
  // someone just edited it via the full sheet) and we're not
  // currently editing inline.
  useEffect(() => {
    if (!isEditingInline) setEditText(task.text);
  }, [task.text, isEditingInline]);
  // Auto-grow the textarea so multi-line tasks don't clip.
  useEffect(() => {
    if (!isEditingInline) return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [isEditingInline, editText]);

  const exitInlineEdit = (commit: boolean) => {
    if (commit) {
      const trimmed = editText.trim();
      if (trimmed && trimmed !== task.text) {
        void updateTask(task.id, { text: trimmed });
      } else if (!trimmed) {
        // Reject empty save — restore previous text.
        setEditText(task.text);
      }
    } else {
      setEditText(task.text);
    }
    setIsEditingInline(false);
  };
  // The row container itself listens for taps. The checkbox + text +
  // pencil + chips each stop propagation so they own their gesture
  // and don't double-fire the row's onTap. The "empty space" tap
  // (gap to the right of the text, padding around the row) bubbles
  // up to the row and fires onTap → typically toggleComplete.
  const handleRowClick = () => {
    if (onTap) onTap();
  };
  return (
    <div
      role="button"
      tabIndex={onTap ? 0 : -1}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (!onTap) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap();
        }
      }}
      className={`flex items-center gap-3 p-3 rounded-xl transition-colors cursor-pointer ${
        task.completed ? 'bg-success/5' : 'bg-surface'
      }`}
    >
      {typeof index === 'number' && (
        <span
          className={`w-6 text-right text-base font-bold tabular-nums flex-shrink-0 ${
            task.completed ? 'text-text-tertiary' : 'text-text-secondary'
          }`}
        >
          {index + 1}
        </span>
      )}
      <motion.button
        whileTap={prefersReducedMotion ? undefined : { scale: 0.85 }}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="p-1 -m-1 flex-shrink-0"
        aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        <div
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
            task.completed
              ? 'bg-success border-success'
              : 'border-border hover:border-primary'
          }`}
        >
          {task.completed && (
            <span className="text-white text-xs font-bold">✓</span>
          )}
        </div>
      </motion.button>

      <div className="flex-1 min-w-0">
        {isEditingInline ? (
          // Inline edit — keyboard-only typo fix. Auto-focuses,
          // grows with content, saves on blur or Enter.
          <textarea
            ref={textareaRef}
            value={editText}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={() => exitInlineEdit(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                exitInlineEdit(false);
              }
            }}
            rows={1}
            className="w-full text-sm leading-snug bg-transparent text-text-primary outline-none border-b border-primary resize-none py-0.5"
          />
        ) : inlineEdit ? (
          // Tapping the text itself starts inline edit (only when
          // the caller opted in). Row onTap (toggle) doesn't fire
          // because we stopPropagation here.
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsEditingInline(true);
            }}
            className="block w-full text-left"
          >
            <p
              className={`text-sm leading-snug ${
                task.completed
                  ? 'text-text-tertiary line-through'
                  : 'text-text-primary'
              }`}
            >
              {task.text}
            </p>
          </button>
        ) : (
          // No inline-edit opt-in — text is a static element; clicks
          // bubble up to the row's onTap (typically toggleComplete).
          // Pencil button (when onEdit is set) is the explicit way
          // to open the full edit sheet.
          <p
            className={`text-sm leading-snug ${
              task.completed
                ? 'text-text-tertiary line-through'
                : 'text-text-primary'
            }`}
          >
            {task.text}
          </p>
        )}
        <div
          className="flex items-center gap-1.5 mt-1 flex-wrap"
          onClick={(e) => e.stopPropagation()}
        >
          {showDate && task.due_date && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
              {task.due_date}
            </span>
          )}
          {task.time && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-elevated text-text-tertiary font-medium">
              {task.time}
            </span>
          )}
          {/* Reminder chip — only render when a reminder is actually
              set. Otherwise the row would carry a permanent
              "+ REMINDER" placeholder cluttering every task; users
              who want to add one tap the pencil → TaskEditSheet
              has the picker. Once set, the chip shows the time so
              the user can read the reminder at a glance. */}
          {task.remind_at && (
            <TaskReminderChip
              value={task.remind_at}
              alreadyFired={reminderFired}
              onChange={(next) => {
                void updateTask(task.id, { remind_at: next, remind_sent_at: null });
              }}
            />
          )}
          {task.urgent && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 font-medium">
              Urgent
            </span>
          )}
          {task.important && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
              Important
            </span>
          )}
        </div>
      </div>

      {onEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="p-2 -m-1 flex-shrink-0 text-text-tertiary hover:text-primary transition-colors"
          aria-label="Edit task"
        >
          {/* Pencil icon — opens the TaskEditSheet for this row.
              Replaces the previous trash icon; delete moved inside
              the edit sheet so destructive action requires a
              deliberate two-step. */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
          </svg>
        </button>
      )}
      {dragHandleProps && (
        <div
          className="p-2 -m-1 text-text-tertiary flex-shrink-0"
          style={{ touchAction: 'none' }}
          onClick={(e) => e.stopPropagation()}
          {...dragHandleProps}
          aria-label="Reorder"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
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
