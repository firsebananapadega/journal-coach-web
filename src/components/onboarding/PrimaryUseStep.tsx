'use client';

// Onboarding step — primary use.
// Determines which wall (Journal / Tasks) loads on first app open.
// Stored on profile.primary_use; after first launch, wallState
// localStorage owns subsequent defaults.

import { motion } from 'framer-motion';
import type { PrimaryUse } from '@/stores/authStore';
import { prefersReducedMotion } from '@/lib/motionVariants';

interface Props {
  value: PrimaryUse | null;
  onChange: (next: PrimaryUse) => void;
  onContinue: () => void;
}

export default function PrimaryUseStep({ value, onChange, onContinue }: Props) {
  return (
    <div className="relative flex flex-col h-[100dvh] overflow-hidden bg-bg">
      <div
        className="relative z-10 flex-1 overflow-y-auto px-6"
        style={{ paddingTop: 'max(3rem, env(safe-area-inset-top))' }}
      >
        <div className="max-w-md w-full mx-auto">
          <h1 className="text-2xl font-bold text-text-primary text-center">
            What will you use this for most?
          </h1>
          <p className="text-sm text-text-secondary text-center mt-2 mb-6">
            We'll open to the right place each day. You can switch any time.
          </p>

          <div className="space-y-3">
            <Card
              selected={value === 'journal'}
              onClick={() => onChange('journal')}
              glyph="📓"
              title="Journaling"
              subtitle="Voice notes, daily reflections, and patterns over time."
            />
            <Card
              selected={value === 'tasks'}
              onClick={() => onChange('tasks')}
              glyph="✓"
              title="Tasks"
              subtitle="Capture, lists, reminders, groceries — keep the day on rails."
            />
          </div>
        </div>
      </div>

      <div
        className="px-6 pt-3"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <motion.button
          whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
          onClick={onContinue}
          disabled={!value}
          className="w-full py-3.5 bg-primary text-white text-base font-semibold rounded-2xl disabled:opacity-40"
        >
          Continue
        </motion.button>
      </div>
    </div>
  );
}

function Card({
  selected,
  onClick,
  glyph,
  title,
  subtitle,
}: {
  selected: boolean;
  onClick: () => void;
  glyph: string;
  title: string;
  subtitle: string;
}) {
  return (
    <motion.button
      whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
      onClick={onClick}
      className={`w-full text-left p-4 rounded-2xl border transition-colors ${
        selected
          ? 'border-primary bg-primary/10'
          : 'border-border bg-surface hover:border-primary/40'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-3xl leading-none" aria-hidden>
          {glyph}
        </span>
        <div className="flex-1 min-w-0">
          <p
            className={`text-base font-semibold ${
              selected ? 'text-primary' : 'text-text-primary'
            }`}
          >
            {title}
          </p>
          <p className="text-xs text-text-secondary mt-0.5 leading-snug">
            {subtitle}
          </p>
        </div>
        {selected && (
          <span className="text-primary text-lg leading-none" aria-hidden>
            ✓
          </span>
        )}
      </div>
    </motion.button>
  );
}
