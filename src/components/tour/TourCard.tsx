'use client';

// Tour card — the floating mascot + speech bubble + skip button.
//
// Positioning and animation are split into two wrappers. The outer
// wrapper handles layout (fixed-center for modal steps, absolute
// pixel coords for anchored steps). The inner motion.div handles
// opacity / y animation only — so Framer's transform doesn't clash
// with a CSS translate(-50%, -50%).

import { motion } from 'framer-motion';
import Mascot from '@/components/mascot/Mascot';
import SpeechBubble from './SpeechBubble';
import type { GuideId } from '@/lib/guideConfigs';
import type { BodhiPose } from '@/components/mascot/poses';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TourCardProps {
  guide: GuideId;
  pose: BodhiPose;
  text: string;
  anchorRect: Rect | null;
  nextLabel?: string;
  skipLabel: string;
  showNextButton: boolean;
  onNext: () => void;
  onSkip: () => void;
}

// Pixel position for anchored steps. For modal (anchorRect null) we
// return nothing — the outer wrapper centers via flex.
function computeAnchoredPosition(rect: Rect): { left: number; top: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 360;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 640;
  const cardW = 340;
  const cardH = 180;
  const gap = 14;

  // Place below if the anchor is high on the screen; above otherwise.
  const anchorMidY = rect.y + rect.height / 2;
  const placeBelow = anchorMidY < vh * 0.45;

  // Horizontal: try to hover the anchor's midX, but keep the card on
  // screen with a safe margin.
  const desiredLeft = rect.x + rect.width / 2 - cardW / 2;
  const clampedLeft = Math.max(12, Math.min(vw - cardW - 12, desiredLeft));

  const top = placeBelow
    ? Math.min(vh - cardH - 12, rect.y + rect.height + gap)
    : Math.max(12, rect.y - gap - cardH);

  return { left: clampedLeft, top };
}

export default function TourCard({
  guide,
  pose,
  text,
  anchorRect,
  nextLabel,
  skipLabel,
  showNextButton,
  onNext,
  onSkip,
}: TourCardProps) {
  const isModal = !anchorRect;
  const anchoredStyle = !isModal
    ? computeAnchoredPosition(anchorRect!)
    : undefined;

  return (
    <div
      className={
        isModal
          ? 'fixed inset-0 z-[80] pointer-events-none flex items-center justify-center p-6'
          : 'fixed z-[80] pointer-events-none'
      }
      style={anchoredStyle ? { left: anchoredStyle.left, top: anchoredStyle.top, width: 340 } : undefined}
    >
      <motion.div
        className="pointer-events-auto w-full max-w-[360px]"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      >
        <div className="flex items-end gap-3">
          <div style={{ width: 72, height: 72 }} className="shrink-0">
            <Mascot guide={guide} pose={pose} size="md" animate />
          </div>
          <div className="flex-1 min-w-0 pb-2">
            <SpeechBubble text={text} />
          </div>
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-text-tertiary hover:text-text-secondary px-4 py-2"
          >
            {skipLabel}
          </button>
          {showNextButton && nextLabel && (
            <button
              type="button"
              onClick={onNext}
              className="text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-full px-5 py-2 shadow-warm-md"
            >
              {nextLabel}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
