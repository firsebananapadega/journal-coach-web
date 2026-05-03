'use client';

// Primary CTA inside the Plans notebook. Renders only when the user
// has no active plan; ActivePlanCard takes its place once a plan
// exists.
//
// This is intentionally prominent — it's the page's primary action.
// The earlier loud-on-/home version was wrong because it competed with
// DailyPulseCard there; inside the Plans notebook surface it should
// lead the eye.

import { motion } from 'framer-motion';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';

interface Props {
  onTap: () => void;
}

export default function MakeAChangeButton({ onTap }: Props) {
  return (
    <motion.button
      type="button"
      onClick={onTap}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-white font-semibold text-sm shadow-warm-md hover:bg-primary-dark transition-colors"
    >
      <span aria-hidden>✦</span>
      {t('plans.makeAChange')}
    </motion.button>
  );
}
