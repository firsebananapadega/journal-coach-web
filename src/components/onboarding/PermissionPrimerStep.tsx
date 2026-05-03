'use client';

// Onboarding Screen 5 — push-permission primer.
//
// Instead of triggering the iOS system prompt cold (which costs
// ~30+% of opt-ins per OneSignal/Hurree), we render a soft pre-
// permission card. The user picks "Sure" or "Not yet"; only on
// "Sure" do we fire the native prompt.
//
// The pre-prompt copy adapts to the user's reflection-time pick
// from Screen 3:
//   morning  → "Mind if we ping you at 8:00 AM?"
//   midday   → "Mind if we ping you at 1:00 PM?"
//   evening  → "Mind if we ping you at 9:30 PM?"
//   anytime  → "Mind if we send a gentle daily nudge?"
//
// Permission outcome (granted vs denied vs error) is reported back
// to the parent via onComplete(granted) so the caller can persist
// it in completeOnboarding's notification_preferences pre-fill.

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { ReflectionTime } from '@/stores/authStore';
import { enablePushReminders } from '@/lib/push';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';
import { getLanguage } from '@/lib/language';

interface Props {
  reflectionTime: ReflectionTime;
  onComplete: (granted: boolean) => void;
  onBack: () => void;
}

const DEFAULT_TIMES: Record<Exclude<ReflectionTime, 'anytime'>, string> = {
  morning: '08:00',
  midday: '13:00',
  evening: '21:30',
};

/** Format an HH:MM string in the user's locale (12h en-US, 12h es-MX
 *  with the dot conventions). */
function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return new Intl.DateTimeFormat(getLanguage(), { hour: 'numeric', minute: '2-digit' }).format(d);
}

export default function PermissionPrimerStep({ reflectionTime, onComplete, onBack }: Props) {
  const [pending, setPending] = useState(false);

  const headline = useMemo(() => {
    if (reflectionTime === 'anytime') {
      return t('onboarding.primer.headlineAnytime');
    }
    const time = formatClock(DEFAULT_TIMES[reflectionTime]);
    return t('onboarding.primer.headlineTimed', { time });
  }, [reflectionTime]);

  const handleAccept = async () => {
    if (pending) return;
    setPending(true);
    try {
      const result = await enablePushReminders();
      onComplete(result === 'ok');
    } catch {
      onComplete(false);
    } finally {
      setPending(false);
    }
  };

  const handleSkip = () => {
    onComplete(false);
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center mb-3" aria-hidden>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-text-primary leading-tight">
          {headline}
        </h2>
        <p className="text-sm text-text-secondary mt-2 leading-relaxed">
          {t('onboarding.primer.subtitle')}
        </p>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-4 space-y-2">
        <p className="text-sm text-text-secondary leading-relaxed">
          {t('onboarding.primer.detail')}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={onBack}
          disabled={pending}
          className="text-sm font-medium text-text-secondary hover:text-text-primary px-2 py-2 disabled:opacity-50"
        >
          ← {t('common.back')}
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSkip}
            disabled={pending}
            className="text-xs font-medium text-text-tertiary hover:text-text-secondary px-2 py-2 disabled:opacity-50"
          >
            {t('onboarding.primer.notYet')}
          </button>
          <motion.button
            type="button"
            onClick={handleAccept}
            disabled={pending}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
            className="px-5 py-3 rounded-xl bg-primary text-white text-sm font-semibold shadow-warm-sm hover:bg-primary-dark transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {pending ? t('common.saving') : t('onboarding.primer.sure')}
            <span aria-hidden>→</span>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
