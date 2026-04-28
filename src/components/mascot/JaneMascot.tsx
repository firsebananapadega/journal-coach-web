'use client';

// JaneMascot — the assistant avatar for /ask. Mirrors Mascot.tsx's
// rendering shell (motion svg, 100×100 viewBox, idle float) but skips
// the GuideId/palette registry since Jane isn't a persona-bearing
// guide — she's a bare Gemini pipe with her own one-off look (see
// bodies/JaneBody.tsx).

import { motion, useReducedMotion } from 'framer-motion';
import { SIZE_PX, getPoseMotion, type BodhiPose, type BodhiSize } from './poses';
import JaneBody from './bodies/JaneBody';

interface Props {
  pose?: BodhiPose;
  size?: BodhiSize;
  animate?: boolean;
  glow?: boolean;
  className?: string;
  fill?: boolean;
}

export default function JaneMascot({
  pose = 'idle',
  size = 'md',
  animate = true,
  glow = false,
  className = '',
  fill = false,
}: Props) {
  const reduce = useReducedMotion();
  const shouldAnimate = animate && !reduce;
  const px = SIZE_PX[size];
  const { anim, transition } = getPoseMotion(pose, shouldAnimate);

  const wrapperStyle = fill
    ? ({ width: '100%', height: '100%' } as const)
    : ({ width: px, height: px } as const);
  const svgDims = fill
    ? ({ width: '100%', height: '100%' } as const)
    : ({ width: px, height: px } as const);

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={wrapperStyle}
    >
      {glow && (
        <div
          aria-hidden
          className="absolute inset-0 rounded-full blur-2xl pointer-events-none"
          style={{
            background: 'rgba(185, 164, 214, 0.30)',
            transform: 'scale(1.8)',
          }}
        />
      )}
      <motion.svg
        viewBox="0 0 100 100"
        {...svgDims}
        xmlns="http://www.w3.org/2000/svg"
        animate={anim}
        transition={transition}
        style={{ position: 'relative', zIndex: 1, overflow: 'visible' }}
        role="img"
        aria-label={`Jane, ${pose}`}
      >
        <JaneBody pose={pose} />
      </motion.svg>
    </div>
  );
}
