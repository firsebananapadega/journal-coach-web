'use client';

// Bottom-sheet date picker for rescheduling an overdue task. Mounted
// from OverdueSection when the user taps the swipe-revealed
// "Reschedule" button.
//
// Implementation notes:
// - Native <input type="date"> for the picker. iOS opens a familiar
//   date wheel; Android opens its native picker. Avoids a 3rd-party
//   calendar lib for ~30 lines of code.
// - Quick-pick chips (Today / Tomorrow / Next week) above the date
//   input for the common cases — one tap saves a tap-then-pick flow.
// - The sheet itself reuses the same motion vocabulary as
//   GroceryShareSheet / SessionModeInfoSheet so visual rhythm stays
//   consistent across modal surfaces.

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Task } from '@/stores/taskStore';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';

interface Props {
  task: Task;
  /** YYYY-MM-DD lower bound — the picker disables earlier dates so
   *  the user can't reschedule to a date that would still be overdue. */
  minDate: string;
  onClose: () => void;
  onConfirm: (newDate: string) => Promise<void>;
}

export default function RescheduleSheet({ task, minDate, onClose, onConfirm }: Props) {
  // Default the input to "tomorrow" — the most common reschedule
  // target for an overdue item the user wants to deal with soon
  // but not today.
  const tomorrowStr = useMemo(() => addDays(minDate, 1), [minDate]);
  const nextWeekStr = useMemo(() => addDays(minDate, 7), [minDate]);
  const [selected, setSelected] = useState(tomorrowStr);
  const [busy, setBusy] = useState(false);

  // Body scroll lock while the sheet is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleConfirm = async () => {
    if (busy || !selected) return;
    setBusy(true);
    try {
      await onConfirm(selected);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/50"
        onClick={onClose}
      />
      <motion.div
        key="sheet"
        initial={prefersReducedMotion ? undefined : { y: '100%' }}
        animate={prefersReducedMotion ? undefined : { y: 0 }}
        exit={prefersReducedMotion ? undefined : { y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="fixed inset-x-0 bottom-0 z-[70] bg-bg rounded-t-3xl shadow-warm-xl max-h-[85vh] overflow-y-auto"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div
          className="px-6 pt-2 pb-6 max-w-md mx-auto space-y-5"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
          <div>
            <h2 className="text-xl font-bold text-text-primary">
              {t('reschedule.title')}
            </h2>
            <p className="text-sm text-text-secondary mt-1 leading-snug truncate">
              {task.text}
            </p>
          </div>

          {/* Quick-pick chips — single tap selects the date. */}
          <div className="flex gap-2 flex-wrap">
            <Chip
              label={t('reschedule.today')}
              selected={selected === minDate}
              onClick={() => setSelected(minDate)}
            />
            <Chip
              label={t('reschedule.tomorrow')}
              selected={selected === tomorrowStr}
              onClick={() => setSelected(tomorrowStr)}
            />
            <Chip
              label={t('reschedule.nextWeek')}
              selected={selected === nextWeekStr}
              onClick={() => setSelected(nextWeekStr)}
            />
          </div>

          {/* Custom date — native picker. */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider block">
              {t('reschedule.pickDate')}
            </label>
            <input
              type="date"
              value={selected}
              min={minDate}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-base text-text-primary outline-none focus:border-primary"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 py-3 rounded-2xl border border-border text-text-primary text-sm font-medium hover:bg-surface-elevated disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy || !selected}
              className="flex-1 py-3 rounded-2xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? t('common.saving') : t('reschedule.confirm')}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
        selected
          ? 'bg-primary text-white shadow-warm-sm'
          : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
      }`}
    >
      {label}
    </button>
  );
}

// Add `days` to a YYYY-MM-DD string and return the resulting
// YYYY-MM-DD. Pure string math via Date intermediate — handles month/
// year boundaries correctly.
function addDays(yyyymmdd: string, days: number): string {
  const d = new Date(`${yyyymmdd}T00:00:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
