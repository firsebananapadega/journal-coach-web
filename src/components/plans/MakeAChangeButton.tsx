'use client';

// Quiet entry-point to the WOOP flow on /home. Renders only when
// there's no active plan; ActivePlanCard takes its place once a plan
// exists.
//
// Earlier shape was a full-width primary-tinted card that competed
// visually with DailyPulseCard (the day's actual ritual). User feedback:
// too loud. Switched to a centered inline pill — small, low-contrast at
// rest, primary-tinted on hover so it still reads as a clearly
// tappable affordance.

import { motion } from 'framer-motion';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';

interface Props {
  onTap: () => void;
}

export default function MakeAChangeButton({ onTap }: Props) {
  return (
    <div className="flex justify-center">
      <motion.button
        type="button"
        onClick={onTap}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-surface/60 border border-border text-text-secondary hover:text-primary hover:border-primary/40 text-xs font-medium transition-colors"
      >
        <span aria-hidden className="text-primary/70">✦</span>
        {t('plans.makeAChange')}
      </motion.button>
    </div>
  );
}
