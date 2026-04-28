'use client';

// AddTaskSheet — bottom sheet for manually creating a new task.
// Bypasses the AI capture engine entirely; the only path on /today
// for users who want to type a task in directly. Mirrors
// TaskEditSheet's visual conventions (floating sheet, sticky footer,
// drag handle) but collects state locally and writes ONCE on Add via
// taskStore.addTask, since there's no row to update field-by-field.

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '@/stores/taskStore';
import { useListStore, type ListRecord } from '@/stores/listStore';
import { toLocalDateStr } from '@/lib/dateUtils';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { useVisualViewport } from '@/hooks/useVisualViewport';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Folder to pre-select when the sheet opens. Pass `undefined` to
   *  default to the user's Inbox; pass `null` to default to "no
   *  folder" (Upcoming). */
  defaultListId?: string | null;
  /** Pre-fills due_date so a task added from /today's selected day
   *  lands on that day. YYYY-MM-DD. */
  defaultDueDate?: string | null;
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
          <span className="text-[11px] text-text-tertiary leading-snug mt-0.5 text-left">
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
      <option value="">🗓 Upcoming (no folder)</option>
      {lists.map((l) => (
        <option key={l.id} value={l.id}>
          {l.is_inbox ? '📥 Inbox' : `${l.icon ?? '📁'} ${l.name}`}
        </option>
      ))}
    </select>
  );
}

export function AddTaskSheet({
  open,
  onClose,
  defaultListId,
  defaultDueDate,
}: Props) {
  const addTask = useTaskStore((s) => s.addTask);
  const lists = useListStore((s) => s.lists);
  const fetchLists = useListStore((s) => s.fetchLists);
  // Visual-viewport tracking so we can pin the sheet's bottom edge
  // to the actual visible region when the iOS keyboard is up. CSS
  // dvh-based positioning is unreliable across iOS Safari versions —
  // see useVisualViewport for the full rationale.
  const vv = useVisualViewport();
  const keyboardOpen = vv?.keyboardOpen ?? false;

  const [text, setText] = useState('');
  const [listId, setListId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [time, setTime] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [important, setImportant] = useState(false);
  const [reminderHHMM, setReminderHHMM] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Lazy-load lists if the picker would be empty. /today already
  // fetches them but other consumers might not; cheap insurance.
  useEffect(() => {
    if (open && lists.length === 0) void fetchLists();
  }, [open, lists.length, fetchLists]);

  // Reset state every time the sheet opens. The "advanced" disclosure
  // collapses again on each open so the next-add starts fast.
  useEffect(() => {
    if (!open) return;
    setText('');
    setShowAdvanced(false);
    setUrgent(false);
    setImportant(false);
    setTime('');
    setReminderHHMM('');
    setDueDate(defaultDueDate ?? '');
    if (defaultListId !== undefined) {
      setListId(defaultListId);
    } else {
      const inbox = lists.find((l) => l.is_inbox);
      setListId(inbox?.id ?? null);
    }
  }, [open, defaultListId, defaultDueDate, lists]);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      // Build remind_at from due_date (or today as base) + HH:MM. Same
      // pattern as TaskEditSheet's commitReminderTime so a reminder
      // created here behaves identically to one set on an existing row.
      let remindAt: string | null = null;
      if (reminderHHMM) {
        const [hh, mm] = reminderHHMM.split(':').map((n) => parseInt(n, 10));
        if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
          const baseDateStr = dueDate || toLocalDateStr(new Date());
          const [y, mo, d] = baseDateStr.split('-').map((n) => parseInt(n, 10));
          const local = new Date(y, mo - 1, d, hh, mm, 0, 0);
          if (!isNaN(local.getTime())) remindAt = local.toISOString();
        }
      }
      await addTask({
        text: trimmed,
        list_id: listId,
        due_date: dueDate || null,
        time: time || null,
        urgent,
        important,
        remind_at: remindAt,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[60]"
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
            className="fixed inset-x-3 z-[70] bg-surface rounded-3xl border border-border shadow-warm-xl flex flex-col overflow-hidden"
            style={
              vv && keyboardOpen
                ? {
                    // Pin sheet's bottom edge 12px above the visible
                    // viewport's bottom (= 12px above the keyboard's
                    // top edge). Cap maxHeight to vv.height − 24px so
                    // the sheet never extends past the visible top.
                    bottom: `${vv.layoutHeight - vv.offsetTop - vv.height + 12}px`,
                    maxHeight: `${vv.height - 24}px`,
                  }
                : {
                    // Keyboard closed: existing floating mid-bottom
                    // position so the sheet doesn't glue to the bottom
                    // edge and the user can still tap below it to
                    // dismiss.
                    bottom: 'max(18dvh, env(safe-area-inset-bottom) + 0.75rem)',
                    maxHeight: '80dvh',
                  }
            }
          >
            <div className="shrink-0 pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-border mx-auto" />
            </div>

            {/* Scrollable content. Same min-h-0 + overflow-y-auto
                pattern as TaskEditSheet so the sticky footer stays
                visible above the iOS keyboard. */}
            <div className="flex-1 min-h-0 overflow-y-auto max-w-lg mx-auto w-full px-5 pb-4 space-y-4">
              <div className="flex items-center justify-between -mt-1">
                <h2 className="text-base font-bold text-text-primary">New task</h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="w-9 h-9 flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary text-lg"
                >
                  ✕
                </button>
              </div>

              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (text.trim()) void handleSubmit();
                  }
                }}
                rows={2}
                placeholder="What do you want to do?"
                className="w-full px-3 py-2.5 bg-bg border border-border focus:border-primary rounded-xl text-base text-text-primary outline-none resize-none placeholder:text-text-tertiary"
              />

              <div>
                <label className="block text-[11px] uppercase tracking-widest text-text-tertiary font-semibold mb-1">
                  Folder
                </label>
                <ListPicker value={listId} lists={lists} onChange={setListId} />
              </div>

              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="w-full flex items-center justify-between text-sm font-medium text-text-secondary hover:text-text-primary py-1"
              >
                <span>{showAdvanced ? 'Hide options' : 'More options'}</span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                  aria-hidden
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {showAdvanced && (
                <motion.div
                  initial={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
                  animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Switch
                      on={urgent}
                      onChange={setUrgent}
                      label={t('matrix.urgent')}
                      hint="Has a near-term deadline or consequence."
                    />
                    <Switch
                      on={important}
                      onChange={setImportant}
                      label={t('matrix.important')}
                      hint="Moves you toward what actually matters."
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-widest text-text-tertiary font-semibold mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-text-primary outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-widest text-text-tertiary font-semibold mb-1">
                      Time
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {TIME_PRESETS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setTime(p)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize ${
                            time === p
                              ? 'bg-primary text-white'
                              : 'bg-surface-elevated text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                      {time && (
                        <button
                          type="button"
                          onClick={() => setTime('')}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold text-text-tertiary hover:text-error"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-widest text-text-tertiary font-semibold mb-1">
                      Reminder
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span aria-hidden className="text-base leading-none">
                        🔔
                      </span>
                      <input
                        type="time"
                        value={reminderHHMM}
                        onChange={(e) => setReminderHHMM(e.target.value)}
                        className="px-3 py-1.5 bg-surface-elevated border border-border rounded-full text-xs text-text-primary outline-none w-[110px]"
                      />
                      {reminderHHMM && (
                        <button
                          type="button"
                          onClick={() => setReminderHHMM('')}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold text-text-tertiary hover:text-error"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            <div
              className="shrink-0 border-t border-border bg-surface"
              style={{
                paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
              }}
            >
              <div className="max-w-lg mx-auto w-full px-5 pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl border border-border text-text-primary text-sm font-medium hover:bg-surface-elevated transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!text.trim() || submitting}
                  className="flex-[2] py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
