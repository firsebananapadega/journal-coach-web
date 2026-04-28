'use client';

// TaskQuadrantSheet — bottom sheet for assigning Eisenhower matrix
// flags to a task. Two switches (Urgent? / Important?) save instantly
// via a caller-provided callback so the same sheet works for both
// PriorityItem (priorityStore) and Task (taskStore) records.
//
// Mounted by the page that owns the Matrix view (currently
// /priorities and /lists/[id]). Open/close controlled by the `task`
// prop — null = closed.

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';

export interface QuadrantSheetTask {
  id: string;
  text: string;
  urgent?: boolean;
  important?: boolean;
}

interface Props {
  task: QuadrantSheetTask | null;
  onClose: () => void;
  onSetFlags: (
    id: string,
    flags: { urgent: boolean; important: boolean },
  ) => void | Promise<void>;
}

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

export function TaskQuadrantSheet({ task, onClose, onSetFlags }: Props) {
  const [urgent, setUrgent] = useState(false);
  const [important, setImportant] = useState(false);

  useEffect(() => {
    if (task) {
      setUrgent(!!task.urgent);
      setImportant(!!task.important);
    }
  }, [task]);

  const handleUrgent = (next: boolean) => {
    setUrgent(next);
    if (task) {
      void onSetFlags(task.id, { urgent: next, important });
    }
  };
  const handleImportant = (next: boolean) => {
    setImportant(next);
    if (task) {
      void onSetFlags(task.id, { urgent, important: next });
    }
  };

  return (
    <AnimatePresence>
      {task && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-50"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 400, damping: 36 }
            }
            className="fixed bottom-0 inset-x-0 z-50 bg-surface rounded-t-3xl border-t border-border shadow-warm-lg"
            style={{
              paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
            }}
          >
            <div className="max-w-lg mx-auto px-5 pt-3 pb-4 space-y-4">
              {/* Drag handle */}
              <div className="w-10 h-1 rounded-full bg-border mx-auto" />

              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wider text-text-tertiary">
                  Task
                </p>
                <p className="text-base font-semibold text-text-primary leading-snug">
                  {task.text}
                </p>
              </div>

              <div className="space-y-2">
                <Switch
                  on={urgent}
                  onChange={handleUrgent}
                  label={t('matrix.urgent')}
                  hint="Has a near-term deadline or consequence."
                />
                <Switch
                  on={important}
                  onChange={handleImportant}
                  label={t('matrix.important')}
                  hint="Moves you toward what actually matters."
                />
              </div>

              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors"
              >
                {t('common.done')}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
