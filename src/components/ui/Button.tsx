'use client';

import { motion } from 'framer-motion';
import { prefersReducedMotion } from '@/lib/motionVariants';
import type { ReactNode, ButtonHTMLAttributes } from 'react';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<string, string> = {
  primary: 'bg-primary text-white font-semibold hover:opacity-90',
  secondary: 'bg-surface border border-border text-text-secondary hover:text-text-primary',
  ghost: 'text-text-secondary hover:text-text-primary',
  danger: 'bg-error text-white font-semibold hover:opacity-90',
};

const sizeClasses: Record<string, string> = {
  sm: 'py-1.5 px-3 text-xs rounded-lg',
  md: 'py-2.5 px-4 text-sm rounded-xl',
  lg: 'py-3 px-6 text-base rounded-xl',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <motion.button
      className={`${variantClasses[variant]} ${sizeClasses[size]} transition-colors disabled:opacity-40 ${className}`}
      whileTap={!prefersReducedMotion && !isDisabled ? { scale: 0.96 } : undefined}
      disabled={isDisabled}
      {...(props as Record<string, unknown>)}
    >
      {loading ? '...' : children}
    </motion.button>
  );
}
