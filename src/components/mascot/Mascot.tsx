'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { SIZE_PX, getPoseMotion, type BodhiPose, type BodhiSize } from './poses';
import { getPalette } from './palettes';
import type { GuideId } from '@/lib/guideConfigs';
import BodhiBody from './bodies/BodhiBody';
import BenBody from './bodies/BenBody';
import QuinnBody from './bodies/QuinnBody';
import SageBody from './bodies/SageBody';

const BODIES: Record<GuideId, typeof BodhiBody> = {
  bodhi: BodhiBody,
  ben: BenBody,
  quinn: QuinnBody,
  sage: SageBody,
};

interface MascotProps {
  guide: GuideId;
  pose?: BodhiPose;
  size?: BodhiSize;
  animate?: boolean;
  glow?: boolean;
  className?: string;
  // When true, the mascot stretches to fill its parent container
  // instead of using a fixed SIZE_PX value. Useful inside fixed-size
  // circular buttons (e.g. the WallNav center pill) where the mascot
  // should match the pill exactly so the figure sits centered.
  fill?: boolean;
}

export default function Mascot({
  guide,
  pose = 'idle',
  size = 'md',
  animate = true,
  glow = false,
  className = '',
  fill = false,
}: MascotProps) {
  const reduce = useReducedMotion();
  const shouldAnimate = animate && !reduce;
  const px = SIZE_PX[size];
  const palette = getPalette(guide);
  const Body = BODIES[guide] ?? BODIES.bodhi;
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
          style={{ background: palette.glow, transform: 'scale(1.8)' }}
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
        aria-label={`${guide}, ${pose}`}
      >
        <Body pose={pose} palette={palette} />
      </motion.svg>
    </div>
  );
}
