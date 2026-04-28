'use client';

import { motion } from 'framer-motion';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';

const MOODS = [
  { score: 5, label: 'great', emoji: '😊' },
  { score: 4, label: 'good', emoji: '🙂' },
  { score: 3, label: 'okay', emoji: '😐' },
  { score: 2, label: 'low', emoji: '😔' },
  { score: 1, label: 'tough', emoji: '😢' },
];

interface MoodSelectorProps {
  value: number | null;
  onChange: (score: number, label: string) => void;
}

export function MoodSelector({ value, onChange }: MoodSelectorProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm text-text-secondary">{t('mood.howFeeling')}</p>
      <div className="flex gap-3">
        {MOODS.map((mood) => {
          const isSelected = value === mood.score;
          return (
            <motion.button
              key={mood.score}
              onClick={() => onChange(mood.score, mood.label)}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.9 }}
              animate={
                prefersReducedMotion
                  ? undefined
                  : isSelected
                  ? { scale: 1.18, y: -2 }
                  : { scale: 1, y: 0 }
              }
              transition={{ type: 'spring', stiffness: 420, damping: 18 }}
              className={`relative flex flex-col items-center gap-1 p-2 rounded-xl ${
                isSelected ? 'opacity-100' : 'opacity-55 hover:opacity-100'
              }`}
            >
              {isSelected && (
                <motion.span
                  layoutId="moodSelectorRing"
                  className="absolute inset-0 rounded-xl bg-surface-elevated ring-2 ring-primary shadow-warm-md"
                  transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 28 }}
                />
              )}
              <span className="relative z-10 text-2xl">{mood.emoji}</span>
              <span className="relative z-10 text-xs text-text-secondary capitalize">{t('mood.' + mood.label)}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
