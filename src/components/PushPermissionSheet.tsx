'use client';

// CENTER-MODAL prompt that asks the user to enable push reminders.
// Shown whenever a reminder is captured AND ensureSubscribed returned
// anything other than 'ok', and on the user's first Pulse entry when
// no reminders are configured. Renders different copy per state so
// the user always sees something actionable — never a silent fail.
//
// Centered (vs. the prior bottom-sheet design) per user feedback —
// they wanted the permission ask to feel like an explicit, focused
// modal rather than something that slides up alongside the keyboard.

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
          {/* Centered modal wrapper — flex centers the card both
              vertically and horizontally inside the viewport, so the
              dialog sits at eye-level rather than sliding up from
              the bottom edge. */}
          <motion.div
            key="modal-wrapper"
            initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.92 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            className="fixed inset-0 z-[70] flex items-center justify-center px-5"
          >
            <div
              className="w-full max-w-md bg-bg rounded-3xl shadow-warm-xl border border-border"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 pt-7 pb-6">
                <div className="text-5xl text-center mb-4" aria-hidden>
                  🔔
                </div>
                <h2 className="text-xl font-bold text-text-primary text-center mb-2">
                  {title}
                </h2>
                <p className="text-base text-text-secondary text-center leading-relaxed mb-5">
                  {body}
                </p>

                {status && (
                  <p className="text-sm text-warning text-center mb-4">{status}</p>
                )}
                {debug && (
                  <p className="text-[11px] text-text-tertiary text-center mb-4 font-mono">
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
                  className="block mx-auto mt-3 text-sm text-text-tertiary hover:text-text-secondary py-1.5"
                >
                  {t('push.later')}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
