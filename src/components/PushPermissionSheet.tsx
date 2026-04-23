'use client';

// Bottom-sheet that asks the user to enable push reminders. Shown
// the first time a user captures a reminder. "Not now" records a
// timestamp so we don't nag for 30 days.

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { enablePushReminders, markPromptDismissed, isIos } from '@/lib/push';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';

interface Props {
  open: boolean;
  onClose: (result: 'enabled' | 'dismissed' | 'unsupported') => void;
}

export default function PushPermissionSheet({ open, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleEnable = async () => {
    setBusy(true);
    const res = await enablePushReminders();
    setBusy(false);
    if (res === 'ok') onClose('enabled');
    else if (res === 'unsupported') {
      setStatus(isIos() ? t('push.iosHint') : t('push.unsupported'));
      // Treat as dismissed so we don't re-nag — the user can still
      // enable from Settings later if support becomes available.
      markPromptDismissed();
      window.setTimeout(() => onClose('unsupported'), 1800);
    } else {
      setStatus(t('push.denied'));
      markPromptDismissed();
      window.setTimeout(() => onClose('dismissed'), 1200);
    }
  };

  const handleSkip = () => {
    markPromptDismissed();
    onClose('dismissed');
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
            className="fixed inset-0 z-[60] bg-black/50"
            onClick={handleSkip}
          />
          <motion.div
            key="sheet"
            initial={prefersReducedMotion ? undefined : { y: '100%' }}
            animate={prefersReducedMotion ? undefined : { y: 0 }}
            exit={prefersReducedMotion ? undefined : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-[70] bg-bg rounded-t-3xl shadow-warm-xl"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            <div
              className="px-6 pt-2 pb-6 max-w-md mx-auto"
              style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            >
              <div className="text-4xl text-center mb-3" aria-hidden>
                🔔
              </div>
              <h2 className="text-lg font-bold text-text-primary text-center mb-2">
                {t('push.title')}
              </h2>
              <p className="text-sm text-text-secondary text-center leading-relaxed mb-5">
                {t('push.body')}
              </p>

              {status && (
                <p className="text-xs text-warning text-center mb-4">{status}</p>
              )}

              <button
                type="button"
                onClick={handleEnable}
                disabled={busy}
                className="w-full py-3.5 rounded-2xl bg-primary text-white font-semibold shadow-warm-md hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {busy ? t('common.loading') : t('push.enable')}
              </button>
              <button
                type="button"
                onClick={handleSkip}
                className="block mx-auto mt-3 text-xs text-text-tertiary hover:text-text-secondary"
              >
                {t('push.later')}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
