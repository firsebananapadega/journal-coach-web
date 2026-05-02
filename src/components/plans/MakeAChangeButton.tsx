'use client';

// Subtle pill button on /home (Pulse tab) — the entry point to the
// WOOP flow. Renders only when there's no active plan; the
// ActivePlanCard takes its place once a plan exists.
//
// Visually: outline-only primary pill with a sparkle glyph. Less
// loud than the DailyPulseCard below it (which is the daily ritual)
// but more visible than a plain text link.

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
      className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-surface border border-primary/30 hover:border-primary/60 text-primary font-semibold text-sm transition-colors shadow-warm-sm"
    >
      <span aria-hidden>✦</span>
      {t('plans.makeAChange')}
    </motion.button>
  );
}
