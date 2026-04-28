import type { Transition } from 'framer-motion';

export type BodhiPose =
  | 'wave'
  | 'think'
  | 'celebrate'
  | 'meditate'
  | 'write'
  | 'peek'
  | 'listen'
  | 'idle';

export type BodhiSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export const SIZE_PX: Record<BodhiSize, number> = {
  xs: 24,
  sm: 32,
  md: 48,
  lg: 80,
  xl: 120,
};

export interface PoseMotion {
  anim: Record<string, number | number[]>;
  transition: Transition;
}

export function getPoseMotion(pose: BodhiPose, enabled: boolean): PoseMotion {
  if (!enabled) return { anim: {}, transition: {} };
  const loop = { repeat: Infinity, ease: 'easeInOut' as const };
  switch (pose) {
    case 'idle':
      return { anim: { y: [0, -2, 0] }, transition: { duration: 3.5, ...loop } };
    case 'meditate':
      return { anim: { y: [0, -1.2, 0] }, transition: { duration: 4.5, ...loop } };
    case 'wave':
      return {
        anim: { rotate: [0, 4, -2, 4, 0] },
        transition: { duration: 1.8, repeatDelay: 0.7, ...loop },
      };
    case 'celebrate':
      return {
        anim: { y: [0, -5, 0], rotate: [0, 4, -4, 0] },
        transition: { duration: 0.9, ...loop },
      };
    case 'listen':
      return { anim: { y: [0, -1, 0] }, transition: { duration: 2.6, ...loop } };
    case 'think':
      return { anim: { rotate: [0, -2.5, 0] }, transition: { duration: 3.2, ...loop } };
    case 'write':
      return { anim: { rotate: [0, 1.5, -1, 0] }, transition: { duration: 2, ...loop } };
    case 'peek':
      return { anim: { y: [0, -1.5, 0] }, transition: { duration: 2.8, ...loop } };
    default:
      return { anim: {}, transition: {} };
  }
}

export function headTransform(pose: BodhiPose): string {
  switch (pose) {
    case 'listen':
      return 'rotate(5)';
    case 'think':
      return 'rotate(-6)';
    case 'peek':
      return 'translate(0 42)';
    default:
      return '';
  }
}
