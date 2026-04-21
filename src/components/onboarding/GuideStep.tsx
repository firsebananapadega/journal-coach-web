'use client';

// Onboarding step 1 — Choose your guide.
// Reuses GuideSelector. After a pick lingers for ~1s with no change,
// the chosen guide's mascot scales up in the center and waves — the
// "awakens" beat (Finch pattern). Then Continue advances.

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GuideSelector } from '@/components/GuideSelector';
import Mascot from '@/components/mascot/Mascot';
import { getGuideOrDefault, type GuideId } from '@/lib/guideConfigs';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';

interface GuideStepProps {
  value: GuideId;
  onChange: (g: GuideId) => void;
  onContinue: () => void;
}

export default function GuideStep({ value, onChange, onContinue }: GuideStepProps) {
  const [awakeKey, setAwakeKey] = useState<GuideId>(value);

  // Re-trigger the "awaken" animation each time the user picks a
  // different guide — not on every re-render.
  useEffect(() => {
    setAwakeKey(value);
  }, [value]);

  const guide = getGuideOrDefault(value);

  return (
    <div className="relative flex flex-col min-h-screen px-6 pt-12 pb-8 bg-bg overflow-hidden">
      <div
        aria-hidden
        className="absolute top-24 left-1/2 -translate-x-1/2 w-[60vmin] h-[60vmin] rounded-full blur-3xl pointer-events-none"
        style={{ background: 'var(--theme-primary-glow)' }}
      />

      <div className="relative z-10 max-w-md w-full mx-auto flex-1">
        {/* Guide awakens — key swaps re-fire the enter animation */}
        <div className="flex justify-center mb-6 h-28">
          <AnimatePresence mode="wait">
            <motion.div
              key={awakeKey}
              initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.6, y: 10 }}
              animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.7 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="flex flex-col items-center gap-2"
            >
              <Mascot guide={value} pose="wave" size="lg" glow animate />
              <p className="text-xs text-text-tertiary">
                {t('onboarding.guide.awake', { name: guide.name })}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <h2 className="text-xl font-bold text-text-primary text-center mb-2">
          {t('onboarding.guide.title')}
        </h2>
        <p className="text-sm text-text-secondary text-center mb-6">
          {t('onboarding.guide.subtitle')}
        </p>

        <GuideSelector value={value} onChange={(id) => onChange(id as GuideId)} />
      </div>

      <motion.button
        type="button"
        whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
        onClick={onContinue}
        className="relative z-10 w-full max-w-md mx-auto block py-3.5 bg-primary text-white font-semibold rounded-2xl shadow-warm-md hover:bg-primary-dark transition-colors"
      >
        {t('common.next')}
      </motion.button>
    </div>
  );
}
