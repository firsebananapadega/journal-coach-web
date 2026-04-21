'use client';

// Onboarding step 1 — Choose your guide.
// Reuses GuideSelector; on pick, the chosen guide mascot waves with
// their name — the "awakens" beat (Finch pattern). CTA always visible
// at the bottom via h-[100dvh] flex layout.

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

  useEffect(() => {
    setAwakeKey(value);
  }, [value]);

  const guide = getGuideOrDefault(value);

  return (
    <div className="relative flex flex-col h-[100dvh] overflow-hidden bg-bg">
      <div
        aria-hidden
        className="absolute top-16 left-1/2 -translate-x-1/2 w-[60vmin] h-[60vmin] rounded-full blur-3xl pointer-events-none"
        style={{ background: 'var(--theme-primary-glow)' }}
      />

      {/* Content — scrolls if the guide cards exceed the viewport */}
      <div
        className="relative z-10 flex-1 overflow-y-auto px-6"
        style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))' }}
      >
        <div className="max-w-md w-full mx-auto">
          {/* Guide awakens — key swap re-fires the enter animation */}
          <div className="flex justify-center mb-5 h-28">
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

          <h2 className="text-xl font-bold text-text-primary text-center mb-1">
            {t('onboarding.guide.title')}
          </h2>
          <p className="text-sm text-text-secondary text-center mb-5">
            {t('onboarding.guide.subtitle')}
          </p>

          <GuideSelector value={value} onChange={(id) => onChange(id as GuideId)} />
          <div className="h-6" />
        </div>
      </div>

      {/* CTA pinned to bottom */}
      <div
        className="relative z-10 shrink-0 px-6 pt-2"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <motion.button
          type="button"
          whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
          onClick={onContinue}
          className="w-full max-w-md mx-auto block py-3.5 bg-primary text-white font-semibold rounded-2xl shadow-warm-md hover:bg-primary-dark transition-colors"
        >
          {t('common.next')}
        </motion.button>
      </div>
    </div>
  );
}
