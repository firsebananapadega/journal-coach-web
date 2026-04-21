'use client';

// Tour card — the floating mascot + speech bubble + skip button.
// Positions itself relative to the anchor rect when one is present;
// centers on screen for modal steps (welcome, outro).

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

// Places the card above the anchor when there's room, below when
// the anchor is near the top; centers for modal steps.
function computeCardPosition(rect: Rect | null): React.CSSProperties {
  if (!rect || typeof window === 'undefined') {
    return {
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 14;
  const anchorMidY = rect.y + rect.height / 2;
  const placeBelow = anchorMidY < vh * 0.35;
  const anchorLeftHalf = rect.x + rect.width / 2 < vw * 0.5;

  if (placeBelow) {
    return {
      left: Math.max(16, Math.min(vw - 280, rect.x + rect.width / 2 - 140)),
      top: Math.min(vh - 160, rect.y + rect.height + gap),
    };
  }
  // default: above
  return {
    left: anchorLeftHalf
      ? Math.max(16, rect.x)
      : Math.max(16, Math.min(vw - 280, rect.x + rect.width - 260)),
    top: Math.max(16, rect.y - gap - 140),
  };
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
  const pos = computeCardPosition(anchorRect);

  return (
    <motion.div
      layoutId="tour-card"
      className="fixed z-[80] pointer-events-auto"
      style={pos}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
    >
      <div className="flex items-end gap-3">
        <motion.div layoutId="tour-mascot" style={{ width: 72, height: 72 }} className="shrink-0">
          <Mascot guide={guide} pose={pose} size="md" animate />
        </motion.div>
        <div className="flex-1 min-w-0 pb-2">
          <SpeechBubble text={text} />
        </div>
      </div>

      {/* Actions row */}
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="text-[11px] text-text-tertiary hover:text-text-secondary px-2 py-1"
        >
          {skipLabel}
        </button>
        {showNextButton && nextLabel && (
          <button
            type="button"
            onClick={onNext}
            className="text-[11px] font-semibold text-white bg-primary hover:bg-primary-dark rounded-full px-3 py-1 shadow-warm-md"
          >
            {nextLabel}
          </button>
        )}
      </div>
    </motion.div>
  );
}
