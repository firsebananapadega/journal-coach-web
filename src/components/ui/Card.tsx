'use client';

import { motion } from 'framer-motion';
import { prefersReducedMotion } from '@/lib/motionVariants';
import type { ReactNode } from 'react';

interface CardProps {
  variant?: 'default' | 'glass' | 'gradient-primary' | 'gradient-warm' | 'elevated';
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}

const variantClasses: Record<string, string> = {
  default: 'bg-surface rounded-2xl border border-border p-4 shadow-sm',
  glass: 'glass-card rounded-2xl p-4',
  'gradient-primary': 'card-gradient-primary rounded-2xl p-4 text-white',
  'gradient-warm': 'card-gradient-warm rounded-2xl p-4 text-white',
  elevated: 'bg-surface-elevated rounded-2xl p-4 shadow-md',
};

export default function Card({ variant = 'default', className = '', children, onClick }: CardProps) {
  const base = variantClasses[variant] || variantClasses.default;

  return (
    <motion.div
      className={`${base} ${className}`}
      whileTap={!prefersReducedMotion && onClick ? { scale: 0.98 } : undefined}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      {children}
    </motion.div>
  );
}
