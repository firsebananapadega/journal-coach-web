'use client';

// TaskEditSheet — rich bottom sheet for editing a Task. Replaces the
// minimal TaskQuadrantSheet on the Upcoming tab and List detail pages
// so the user gets the inline-edit feel they liked from the old Plans
// tab: tap text to edit, tap time to change, change list, etc.
//
// What's editable:
//   - text (auto-saves on blur or after a short debounce)
//   - due_date (native date picker)
//   - time (preset chips + free HH:MM input + clear)
//   - list_id (dropdown of all the user's lists)
//   - urgent / important (switches — same as quadrant sheet)
// Plus a Delete button.
//
// Each change calls taskStore.updateTask(id, patch) immediately so
// the cache stays in sync; the sheet can be closed at any time.

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Task } from '@/stores/taskStore';
import { useTaskStore } from '@/stores/taskStore';
import { useListStore, type ListRecord } from '@/stores/listStore';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';
import TaskReminderChip from '@/components/tasks/TaskReminderChip';

interface Props {
  task: Task | null;
  onClose: () => void;
}

const TIME_PRESETS = ['morning', 'afternoon', 'evening', 'night'] as const;

function Switch({
  on,
  onChange,
  label,
  hint,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-surface-elevated hover:bg-surface-elevated/80 transition-colors"
    >
      <div className="flex flex-col items-start min-w-0">
        <span className="text-sm font-semibold text-text-primary">{label}</span>
        {hint && (
          <span className="text-[11px] text-text-tertiary leading-snug mt-0.5">
            {hint}
          </span>
        )}
      </div>
      <span
        className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${
          on ? 'bg-primary' : 'bg-border'
        }`}
        aria-hidden
      >
        <motion.span
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm"
          animate={{ x: on ? 20 : 0 }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 500, damping: 30 }
          }
        />
      </span>
    </button>
  );
}

function ListPicker({
  value,
  lists,
  onChange,
}: {
  value: string | null;
  lists: ListRecord[];
  onChange: (next: string | null) => void;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-text-primary outline-none"
    >
      <option value="">🗓 Upcoming (no list)</option>
      {lists.map((l) => (
        <option key={l.id} value={l.id}>
          {l.is_inbox ? '📥 Inbox' : `${l.icon ?? '📁'} ${l.name}`}
        </option>
      ))}
    </select>
  );
}

export function TaskEditSheet({ task, onClose }: Props) {
  const updateTask = useTaskStore((s) => s.updateTask);
  const removeTask = useTaskStore((s) => s.removeTask);
  const lists = useListStore((s) => s.lists);

  const [text, setText] = useState('');
  const [dueDate, setDueDate] = useState<string>('');
  const [time, setTime] = useState<string>('');
  const [listId, setListId] = useState<string | null>(null);
  const [urgent, setUrgent] = useState(false);
  const [important, setImportant] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!task) return;
    setText(task.text);
    setDueDate(task.due_date ?? '');
    setTime(task.time ?? '');
    setListId(task.list_id);
    setUrgent(task.urgent);
    setImportant(task.important);
  }, [task]);

  if (!task) {
    return (
      <AnimatePresence>{null}</AnimatePresence>
    );
  }

  const commitText = (next: string) => {
    setText(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (next.trim() && next.trim() !== task.text) {
        void updateTask(task.id, { text: next.trim() });
      }
    }, 400);
  };

  const commitDueDate = (next: string) => {
    setDueDate(next);
    void updateTask(task.id, { due_date: next || null });
  };
  const commitTime = (next: string) => {
    setTime(next);
    void updateTask(task.id, { time: next || null });
  };
  const commitList = (next: string | null) => {
    setListId(next);
    void updateTask(task.id, { list_id: next });
  };
  const commitUrgent = (next: boolean) => {
    setUrgent(next);
    void updateTask(task.id, { urgent: next });
  };
  const commitImportant = (next: boolean) => {
    setImportant(next);
    void updateTask(task.id, { important: next });
  };
  const commitRemindAt = (next: string | null) => {
    void updateTask(task.id, { remind_at: next, remind_sent_at: null });
  };

  const reminderFired =
    !!task.remind_sent_at &&
    !!task.remind_at &&
    new Date(task.remind_at).getTime() < Date.now();

  const handleDelete = async () => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Delete "${task.text}"?`);
      if (!ok) return;
    }
    await removeTask(task.id);
    onClose();
  };

  const isPresetTime = (TIME_PRESETS as readonly string[]).includes(time);

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/40 z-50"
      />

      <motion.div
        key="sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={
          prefersReducedMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 380, damping: 36 }
        }
        className="fixed bottom-0 inset-x-0 z-50 bg-surface rounded-t-3xl border-t border-border shadow-warm-lg flex flex-col overflow-hidden"
        style={{
          maxHeight: '92dvh',
        }}
      >
        {/* Drag handle pinned at the top so it's always visible. */}
        <div className="shrink-0 pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border mx-auto" />
        </div>

        {/* Scrollable content. The Delete + Done buttons live OUTSIDE
            this container in a sticky footer so when the iOS keyboard
            opens during text editing, the buttons stay reachable.
            Previously they were inside this scroll area and got
            pushed below the keyboard / fold of the sheet. */}
        <div className="flex-1 overflow-y-auto max-w-lg mx-auto w-full px-5 pb-4 space-y-4">
          {/* Editable text */}
          <textarea
            value={text}
            onChange={(e) => commitText(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-bg border border-border focus:border-primary rounded-xl text-base text-text-primary outline-none resize-none"
          />

          {/* Date + List row */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-text-tertiary mb-1">
                Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => commitDueDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-text-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-text-tertiary mb-1">
                List
              </label>
              <ListPicker value={listId} lists={lists} onChange={commitList} />
            </div>
          </div>

          {/* Time row */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-text-tertiary mb-1">
              Time
            </label>
            <div className="flex flex-wrap gap-1.5">
              {TIME_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => commitTime(p)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize ${
                    time === p
                      ? 'bg-primary text-white'
                      : 'bg-surface-elevated text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {p}
                </button>
              ))}
              <input
                type="time"
                value={isPresetTime ? '' : time}
                onChange={(e) => commitTime(e.target.value)}
                className="px-3 py-1.5 bg-surface-elevated border border-border rounded-full text-xs text-text-primary outline-none w-[110px]"
              />
              {time && (
                <button
                  onClick={() => commitTime('')}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold text-text-tertiary hover:text-error"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Reminder */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-text-tertiary mb-1">
              Reminder
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <TaskReminderChip
                value={task.remind_at}
                alreadyFired={reminderFired}
                onChange={commitRemindAt}
              />
              {reminderFired && (
                <span className="text-[10px] text-text-tertiary">
                  Already fired
                </span>
              )}
            </div>
          </div>

          {/* Switches */}
          <div className="space-y-2">
            <Switch
              on={urgent}
              onChange={commitUrgent}
              label={t('matrix.urgent')}
              hint="Has a near-term deadline or consequence."
            />
            <Switch
              on={important}
              onChange={commitImportant}
              label={t('matrix.important')}
              hint="Moves you toward what actually matters."
            />
          </div>

        </div>

        {/* Sticky footer — stays visible above the iOS keyboard
            because it's outside the scrollable content. The
            previous layout put the buttons inside the scroll area
            and the keyboard pushed them off-screen, leaving the
            user with no way to save without dismissing the
            keyboard first. */}
        <div
          className="shrink-0 border-t border-border bg-surface"
          style={{
            paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
          }}
        >
          <div className="max-w-lg mx-auto w-full px-5 pt-3 flex gap-2">
            <button
              onClick={handleDelete}
              className="flex-1 py-3 rounded-xl bg-error/10 text-error text-sm font-semibold hover:bg-error/20 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={onClose}
              className="flex-[2] py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors"
            >
              {t('common.done')}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
