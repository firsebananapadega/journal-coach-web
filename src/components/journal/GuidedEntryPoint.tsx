'use client';

// Entry point for guided sessions, mounted at the top of the Journal
// system notebook (/notebooks/journal) when profile.guided_enabled
// is on. Mirrors the MakeAChangeButton shape used by the Plans
// notebook. Tapping navigates to /guided which renders the full
// conversational session UI.
//
// PR 2 of the wall restructure folded the previous /guided
// journal-wall tab into this Settings-toggle + Journal-notebook
// entry-point shape.

import Link from 'next/link';
import { motion } from 'framer-motion';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';

export default function GuidedEntryPoint() {
  return (
    <motion.div
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Link
        href="/guided"
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-white font-semibold text-sm shadow-warm-md hover:bg-primary-dark transition-colors"
      >
        <span aria-hidden>✦</span>
        {t('guided.entry.cta')}
      </Link>
    </motion.div>
  );
}
