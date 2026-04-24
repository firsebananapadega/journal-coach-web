'use client';

// Bottom-sheet that asks the user to enable push reminders. Shown
// whenever a reminder is captured AND ensureSubscribed returned
// anything other than 'ok'. Renders different copy per state so
// the user always sees something actionable — never a silent fail.

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  enablePushReminders,
  getPushSupport,
  markPromptDismissed,
  type PushSupport,
} from '@/lib/push';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';

interface Props {
  open: boolean;
  onClose: (result: 'enabled' | 'dismissed' | 'unsupported') => void;
}

export default function PushPermissionSheet({ open, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [debug, setDebug] = useState<string | null>(null);

  // Resolve the support state on open so the copy + CTA match the
  // user's actual situation.
  useEffect(() => {
    if (!open) {
      setStatus(null);
      setDebug(null);
      return;
    }
    (async () => {
      const s = await getPushSupport();
      setSupport(s);
      // Surface any earlier error that ensureSubscribed stashed on
      // window so the user (or us, in a support chat) can see what
      // actually failed instead of a silent sheet.
      try {
        const lastErr = (window as unknown as { __lastPushError?: string }).__lastPushError;
        if (lastErr) setDebug(lastErr);
      } catch {}
    })();
  }, [open]);

  const handleEnable = async () => {
    if (support === 'standalone-required') {
      markPromptDismissed();
      onClose('unsupported');
      return;
    }
    if (support === 'blocked') {
      // Permission is denied — can't re-prompt from JS. User must
      // flip the toggle in iOS Settings → Notifications → JournalCoach.
      markPromptDismissed();
      onClose('unsupported');
      return;
    }
    if (support === 'unsupported') {
      markPromptDismissed();
      onClose('unsupported');
      return;
    }
    setBusy(true);
    const res = await enablePushReminders();
    setBusy(false);
    if (res === 'ok') {
      onClose('enabled');
    } else if (res === 'unsupported') {
      setStatus(t('push.unsupported'));
      markPromptDismissed();
      window.setTimeout(() => onClose('unsupported'), 1800);
    } else if (res === 'denied') {
      setStatus(t('push.denied'));
      markPromptDismissed();
      window.setTimeout(() => onClose('dismissed'), 1800);
    } else {
      setStatus(t('push.retry'));
      window.setTimeout(() => onClose('dismissed'), 1800);
    }
  };

  const handleSkip = () => {
    markPromptDismissed();
    onClose('dismissed');
  };

  // Copy per support state.
  let title = t('push.title');
  let body = t('push.body');
  let cta = t('push.enable');

  if (support === 'standalone-required') {
    title = t('push.installGateTitle');
    body = t('push.installGateBody');
    cta = t('push.installGateCta');
  } else if (support === 'blocked') {
    title = t('push.blockedTitle');
    body = t('push.blockedBody');
    cta = t('push.blockedCta');
  } else if (support === 'unsupported') {
    title = t('push.unsupportedTitle');
    body = t('push.unsupportedBody');
    cta = t('push.installGateCta');
  } else if (support === 'granted') {
    title = t('push.retryTitle');
    body = t('push.retryBody');
    cta = t('push.retryCta');
  } else if (support === 'subscribed') {
    title = t('push.resyncTitle');
    body = t('push.resyncBody');
    cta = t('push.resyncCta');
  }

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
                {title}
              </h2>
              <p className="text-sm text-text-secondary text-center leading-relaxed mb-5">
                {body}
              </p>

              {status && (
                <p className="text-xs text-warning text-center mb-4">{status}</p>
              )}
              {debug && (
                <p className="text-[10px] text-text-tertiary text-center mb-4 font-mono">
                  [{debug}]
                </p>
              )}

              <button
                type="button"
                onClick={handleEnable}
                disabled={busy}
                className="w-full py-3.5 rounded-2xl bg-primary text-white font-semibold shadow-warm-md hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {busy ? t('common.loading') : cta}
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
