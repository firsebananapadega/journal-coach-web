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
      className={`${variantClasses[variant]} ${sizeClasses[size]} transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-2 ${className}`}
      whileTap={!prefersReducedMotion && !isDisabled ? { scale: 0.96 } : undefined}
      disabled={isDisabled}
      {...(props as Record<string, unknown>)}
    >
      {loading && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="spin-smooth" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      <span>{children}</span>
    </motion.button>
  );
}
