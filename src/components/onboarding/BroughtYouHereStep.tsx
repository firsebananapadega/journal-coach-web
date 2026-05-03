'use client';

// Onboarding Screen 2 — "What brought you here?"
//
// Multi-select chip card list, mirroring the Confirmafy reference
// (full-width tap targets, leading icon, bold label, optional
// sub-text). The user can pick 0-N chips; Continue is always
// enabled. The picks drive feature-flag auto-flips at the end of
// onboarding (see authStore.completeOnboarding):
//
//   gratitude   → ensure Gratitude system notebook
//   plans/goals → plans_enabled = true + ensure Plans notebook
//   feelings    → guided_enabled = true
//   habit       → no flag (handled by reflection-time pre-fill)
//   exploring   → no flips
//
// Skip = continuing with 0 selections. Allowed; the user just lands
// on the default home shape.

import { motion } from 'framer-motion';
import type { IntentChip } from '@/stores/authStore';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';

interface Props {
  value: IntentChip[];
  onChange: (next: IntentChip[]) => void;
  onContinue: () => void;
  onBack: () => void;
}

interface ChipDef {
  key: IntentChip;
  glyph: string;
  labelKey: string;
  hintKey: string;
}

const CHIPS: ChipDef[] = [
  { key: 'reflection_habit', glyph: '📔', labelKey: 'onboarding.broughtYouHere.habit.label', hintKey: 'onboarding.broughtYouHere.habit.hint' },
  { key: 'goals', glyph: '🎯', labelKey: 'onboarding.broughtYouHere.goals.label', hintKey: 'onboarding.broughtYouHere.goals.hint' },
  { key: 'gratitude', glyph: '✦', labelKey: 'onboarding.broughtYouHere.gratitude.label', hintKey: 'onboarding.broughtYouHere.gratitude.hint' },
  { key: 'feelings', glyph: '💭', labelKey: 'onboarding.broughtYouHere.feelings.label', hintKey: 'onboarding.broughtYouHere.feelings.hint' },
  { key: 'plans', glyph: '🌱', labelKey: 'onboarding.broughtYouHere.plans.label', hintKey: 'onboarding.broughtYouHere.plans.hint' },
  { key: 'exploring', glyph: '🌤', labelKey: 'onboarding.broughtYouHere.exploring.label', hintKey: 'onboarding.broughtYouHere.exploring.hint' },
];

export default function BroughtYouHereStep({ value, onChange, onContinue, onBack }: Props) {
  const toggle = (key: IntentChip) => {
    if (value.includes(key)) {
      onChange(value.filter((k) => k !== key));
    } else {
      onChange([...value, key]);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-text-primary leading-tight">
          {t('onboarding.broughtYouHere.title')}
        </h2>
        <p className="text-sm text-text-secondary mt-2 leading-relaxed">
          {t('onboarding.broughtYouHere.subtitle')}
        </p>
      </div>

      <div className="space-y-2">
        {CHIPS.map((chip) => {
          const active = value.includes(chip.key);
          return (
            <motion.button
              key={chip.key}
              type="button"
              onClick={() => toggle(chip.key)}
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
                  active ? 'border-primary bg-primary text-white' : 'border-border'
                }`}
                aria-hidden
              >
                {active && (
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
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
