'use client';

// Onboarding Screen 4 — push-permission primer (v5).
//
// Cold OS prompts cost ~30+% of opt-ins (OneSignal/Hurree). This
// pre-permission card asks first; only on "Sure" do we fire the
// native iOS prompt.
//
// v5 reframed the copy from evening-reflection to a fixed
// productivity-shaped morning-briefing default. completeOnboarding
// then flips morning_reminder=true with reminder_times.morning='08:00'
// when push is granted. The user can change the time + opt out per-
// mode in Settings later.

import { useState } from 'react';
import { motion } from 'framer-motion';
import { enablePushReminders } from '@/lib/push';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';

interface Props {
  onComplete: (granted: boolean) => void;
  onBack: () => void;
}

export default function PermissionPrimerStep({ onComplete, onBack }: Props) {
  const [pending, setPending] = useState(false);

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
          {t('onboarding.primer.headline')}
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
