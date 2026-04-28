'use client';

// Back-compat shim: existing imports of `Bodhi` continue to work after the
// move to a multi-guide mascot system. New code should prefer `Mascot` (with
// an explicit `guide` prop) or `GuideMascot` (auto-selects from auth store).

import Mascot from './Mascot';
import type { BodhiPose, BodhiSize } from './poses';

export type { BodhiPose, BodhiSize };

interface BodhiProps {
  pose?: BodhiPose;
  size?: BodhiSize;
  animate?: boolean;
  glow?: boolean;
  className?: string;
}

export default function Bodhi(props: BodhiProps) {
  return <Mascot {...props} guide="bodhi" />;
}
