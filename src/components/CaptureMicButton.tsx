'use client';

// Voice-mic capture button. Replaces the WallNav center "Capture"
// button (which used to be the only entry point to the AI voice
// capture flow) by living per-task-tab so the user's spatial context
// is preserved while still routing the transcript through the same
// AI classifier.
//
// Two variants:
//   • 'fab'    (default) — bottom-right floating action button on
//               /today, /lists, /upcoming, /groceries. Sits above the
//               WallNav with safe-area-aware spacing so the home
//               indicator and nav both clear it.
//   • 'inline' — same primitive in a smaller, flow-aligned shape so
//               it can sit next to the existing "+" on the typed-add
//               row inside /lists/[id].
//
// Both navigate to /voice. The /voice page already AI-routes the
// transcript regardless of where the user came from, so no per-tab
// context is needed at the call site.

import Link from 'next/link';
import { motion } from 'framer-motion';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';

interface Props {
  variant?: 'fab' | 'inline';
}

function MicGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

export default function CaptureMicButton({ variant = 'fab' }: Props) {
  const isFab = variant === 'fab';
  return (
    <Link
      href="/voice"
      aria-label={t('capture.mic.aria')}
      // FAB is intentionally smaller than the WallNav center button
      // (w-14 h-14, 56px) per the user's "slightly smaller" direction
      // — 48px reads as secondary while still being thumb-comfortable.
      // Inline variant matches the +9px height of the existing typed-add
      // "+" button on /lists/[id] so the row aligns.
      className={
        isFab
          ? 'fixed right-5 z-40 w-12 h-12 rounded-full bg-primary text-white shadow-warm-lg flex items-center justify-center hover:bg-primary-dark transition-colors'
          : 'shrink-0 w-9 h-9 rounded-full bg-primary text-white shadow-warm-sm flex items-center justify-center hover:bg-primary-dark transition-colors'
      }
      // Bottom math: WallNav sits at ~88px from the safe-area floor;
      // adding 7.5rem (120px) of bottom on top of the safe-area lifts
      // the FAB ~30px above the WallNav — same trick BookPage's
      // composer FAB uses, so all FABs in the app land at the same
      // visual altitude.
      style={
        isFab
          ? { bottom: 'calc(env(safe-area-inset-bottom, 0px) + 7.5rem)' }
          : undefined
      }
    >
      <motion.span
        whileTap={prefersReducedMotion ? undefined : { scale: 0.92 }}
        className="flex items-center justify-center"
      >
        <MicGlyph size={isFab ? 22 : 18} />
      </motion.span>
    </Link>
  );
}
