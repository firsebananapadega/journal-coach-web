'use client';

// Onboarding Screen 3 — "When do you usually reflect?"
//
// Single-select 4-chip card list. Defaults to 'anytime' so the
// user can always advance without picking. Drives the
// notification-reminder pre-fill on Screen 5 (only fires if push
// is granted there).
//
// Design mirrors BroughtYouHereStep — same chip-card shape but
// single-select (radio-style).

import { motion } from 'framer-motion';
import type { ReflectionTime } from '@/stores/authStore';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';

interface Props {
  value: ReflectionTime;
  onChange: (next: ReflectionTime) => void;
  onContinue: () => void;
  onBack: () => void;
}

interface ChipDef {
  key: ReflectionTime;
  glyph: string;
  labelKey: string;
  hintKey: string;
}

const CHIPS: ChipDef[] = [
  { key: 'morning', glyph: '☀', labelKey: 'onboarding.reflectionTime.morning.label', hintKey: 'onboarding.reflectionTime.morning.hint' },
  { key: 'midday', glyph: '🌤', labelKey: 'onboarding.reflectionTime.midday.label', hintKey: 'onboarding.reflectionTime.midday.hint' },
  { key: 'evening', glyph: '🌙', labelKey: 'onboarding.reflectionTime.evening.label', hintKey: 'onboarding.reflectionTime.evening.hint' },
  { key: 'anytime', glyph: '✨', labelKey: 'onboarding.reflectionTime.anytime.label', hintKey: 'onboarding.reflectionTime.anytime.hint' },
];

export default function ReflectionTimeStep({ value, onChange, onContinue, onBack }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-text-primary leading-tight">
          {t('onboarding.reflectionTime.title')}
        </h2>
        <p className="text-sm text-text-secondary mt-2 leading-relaxed">
          {t('onboarding.reflectionTime.subtitle')}
        </p>
      </div>

      <div className="space-y-2">
        {CHIPS.map((chip) => {
          const active = value === chip.key;
          return (
            <motion.button
              key={chip.key}
              type="button"
              onClick={() => onChange(chip.key)}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
              className={`w-full flex items-start gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-colors ${
                active
                  ? 'border-primary bg-primary/8'
                  : 'border-border bg-surface hover:border-primary/40'
              }`}
              aria-pressed={active}
            >
              <span
                className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-lg ${
                  active ? 'bg-primary/15' : 'bg-surface-elevated'
                }`}
                aria-hidden
              >
                {chip.glyph}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-text-primary">
                  {t(chip.labelKey)}
                </span>
                <span className="block text-xs text-text-tertiary mt-0.5 leading-snug">
                  {t(chip.hintKey)}
                </span>
              </span>
              <span
                className={`shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  active ? 'border-primary' : 'border-border'
                }`}
                aria-hidden
              >
                {active && <span className="block w-2.5 h-2.5 rounded-full bg-primary" />}
              </span>
            </motion.button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-text-secondary hover:text-text-primary px-2 py-2"
        >
          ← {t('common.back')}
        </button>
        <motion.button
          type="button"
          onClick={onContinue}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
          className="px-5 py-3 rounded-xl bg-primary text-white text-sm font-semibold shadow-warm-sm hover:bg-primary-dark transition-colors flex items-center gap-1.5"
        >
          {t('common.continue')}
          <span aria-hidden>→</span>
        </motion.button>
      </div>
    </div>
  );
}
