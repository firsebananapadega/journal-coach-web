'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import GuideMascot from '@/components/mascot/GuideMascot';
import { useUiStore, type ToastAction, type ToastVariant } from '@/stores/uiStore';

const ICON_COLOR: Record<ToastVariant, string> = {
  success: 'var(--theme-primary)',
  info: 'var(--theme-text-secondary)',
  error: 'var(--theme-error)',
};

export default function ToastStack() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  return (
    <div className="fixed top-4 inset-x-0 z-[90] flex flex-col items-center gap-2 pointer-events-none px-4">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem
            key={t.id}
            id={t.id}
            message={t.message}
            variant={t.variant}
            action={t.action}
            durationMs={t.durationMs}
            dismiss={dismiss}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({
  id,
  message,
  variant,
  action,
  durationMs,
  dismiss,
}: {
  id: number;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
  durationMs?: number;
  dismiss: (id: number) => void;
}) {
  useEffect(() => {
    // Give action toasts (e.g. Undo after delete) a longer window so
    // the user actually has time to tap before it auto-dismisses and
    // the destructive op commits.
    const ms = durationMs ?? (action ? 5000 : 2200);
    const timeout = window.setTimeout(() => dismiss(id), ms);
    return () => window.clearTimeout(timeout);
  }, [id, dismiss, action, durationMs]);

  return (
    <motion.div
      layout
      initial={{ y: -24, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: -16, opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="glass-card shadow-warm-lg rounded-full pl-4 pr-2 py-2 pointer-events-auto max-w-sm flex items-center gap-3"
      role="status"
    >
      {variant === 'success' ? (
        <GuideMascot pose="celebrate" size="sm" animate />
      ) : (
        <span
          aria-hidden
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{ background: ICON_COLOR[variant] }}
        />
      )}
      <span className="text-sm font-medium text-text-primary flex-1">{message}</span>
      {action && (
        <button
          type="button"
          onClick={() => {
            action.onClick();
            dismiss(id);
          }}
          className="text-xs font-semibold uppercase tracking-wider text-primary hover:text-primary-dark px-3 py-1 rounded-full hover:bg-surface-elevated transition-colors"
        >
          {action.label}
        </button>
      )}
    </motion.div>
  );
}
