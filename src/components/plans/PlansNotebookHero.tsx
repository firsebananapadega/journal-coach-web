'use client';

// Hero block at the top of /notebooks/plans. Renders only when the
// user is viewing the Plans system notebook (gated upstream by
// BookPage). Shows what WOOP planning is + the "Make a plan" CTA +
// the active-plan card if a plan is already running. Below the hero,
// BookPage renders the Started:/Closed: journal-entry feed.
//
// Why a dedicated hero (vs. inline blurb): WOOP only works if the user
// understands the contrast — wish vs. obstacle — before answering the
// prompts. A short framed intro on this surface gives that mental
// model in 2 short sentences before we ask them to commit to a plan.

import { motion } from 'framer-motion';
import { usePlanStore } from '@/stores/planStore';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';
import MakeAChangeButton from './MakeAChangeButton';
import ActivePlanCard from './ActivePlanCard';

interface Props {
  onTapMake: () => void;
}

export default function PlansNotebookHero({ onTapMake }: Props) {
  const activePlan = usePlanStore((s) => s.active);

  return (
    <motion.section
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-4"
    >
      {/* Title + intro */}
      <div className="space-y-2.5">
        <h1 className="text-2xl font-bold text-text-primary leading-tight flex items-center gap-2">
          <span className="text-primary" aria-hidden>
            ✦
          </span>
          {t('plans.notebookHero.title')}
        </h1>
        <p className="text-sm text-text-secondary leading-relaxed">
          {t('plans.notebookHero.description')}
        </p>
      </div>

      {/* Either the active plan card OR the make-a-plan CTA. The card
          becomes the primary surface once a plan is running because the
          daily check-offs are the actual work — the CTA is only useful
          to non-active users. */}
      {activePlan ? (
        <ActivePlanCard />
      ) : (
        <MakeAChangeButton onTap={onTapMake} />
      )}

      {/* Soft therapy line. Lives here (vs. only inside the WoopSheet)
          so users see it before they invest the time of opening the
          flow. */}
      <p className="text-xs text-text-tertiary text-center leading-snug">
        {t('plans.disclaimer')}
      </p>
    </motion.section>
  );
}
