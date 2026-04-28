'use client';

import { motion } from 'framer-motion';
import GuideMascot from '@/components/mascot/GuideMascot';
import type { BodhiPose } from '@/components/mascot/poses';
import Button from './Button';
import { fadeUp, staggerContainer, staggerItem, prefersReducedMotion } from '@/lib/motionVariants';

interface EmptyStateProps {
  pose?: BodhiPose;
  title: string;
  message?: string;
  cta?: { label: string; onClick: () => void };
  className?: string;
}

export default function EmptyState({
  pose = 'peek',
  title,
  message,
  cta,
  className = '',
}: EmptyStateProps) {
  const initial = prefersReducedMotion ? undefined : 'initial';
  const animate = prefersReducedMotion ? undefined : 'animate';

  return (
    <motion.div
      variants={staggerContainer}
      initial={initial}
      animate={animate}
      className={`flex flex-col items-center text-center py-12 px-6 ${className}`}
    >
      <motion.div variants={staggerItem} {...fadeUp}>
        <GuideMascot pose={pose} size="lg" glow animate />
      </motion.div>
      <motion.h3
        variants={staggerItem}
        className="mt-4 text-lg font-semibold text-text-primary"
      >
        {title}
      </motion.h3>
      {message && (
        <motion.p
          variants={staggerItem}
          className="mt-2 text-sm text-text-secondary max-w-xs"
        >
          {message}
        </motion.p>
      )}
      {cta && (
        <motion.div variants={staggerItem} className="mt-5">
          <Button onClick={cta.onClick} variant="primary" size="md">
            {cta.label}
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}
