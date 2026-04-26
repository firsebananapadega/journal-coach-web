'use client';

// Onboarding step — primary use.
// Side-by-side multi-select: each card toggles independently. The
// final value is derived from which cards are selected:
//   - tasks only      → 'tasks'
//   - journal only    → 'journal'
//   - both selected   → 'both'
// Continue activates as soon as ≥1 card is selected. The choice
// determines:
//   - which wall(s) are visible (Tasks Wall, Journal Wall, or both
//     with the WallEdgeTab switcher pill)
//   - whether the Guide selection step appears next (skipped on
//     tasks-only since guides are journaling-flavored)
//   - whether weekly/monthly/quarterly letter crons run for this user
// Editable later via the three-way toggle in /settings.

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { PrimaryUse } from '@/stores/authStore';
import { prefersReducedMotion } from '@/lib/motionVariants';

interface Props {
  value: PrimaryUse | null;
  onChange: (next: PrimaryUse) => void;
  onContinue: () => void;
}

function deriveValue(tasks: boolean, journal: boolean): PrimaryUse | null {
  if (tasks && journal) return 'both';
  if (tasks) return 'tasks';
  if (journal) return 'journal';
  return null;
}

export default function PrimaryUseStep({ value, onChange, onContinue }: Props) {
  // Hydrate the per-card selection from the incoming value so a back-
  // navigation to this step preserves the user's prior pick.
  const [tasks, setTasks] = useState<boolean>(value === 'tasks' || value === 'both');
  const [journal, setJournal] = useState<boolean>(value === 'journal' || value === 'both');

  const flip = (which: 'tasks' | 'journal') => {
    const nextTasks = which === 'tasks' ? !tasks : tasks;
    const nextJournal = which === 'journal' ? !journal : journal;
    setTasks(nextTasks);
    setJournal(nextJournal);
    const derived = deriveValue(nextTasks, nextJournal);
    if (derived) onChange(derived);
  };

  const ready = tasks || journal;

  return (
    <div className="relative flex flex-col h-[100dvh] overflow-hidden bg-bg">
      <div
        className="relative z-10 flex-1 overflow-y-auto px-5"
        style={{ paddingTop: 'max(3rem, env(safe-area-inset-top))' }}
      >
        <div className="max-w-md w-full mx-auto">
          <h1 className="text-2xl font-bold text-text-primary text-center">
            What did you come here for?
          </h1>
          <p className="text-sm text-text-secondary text-center mt-2 mb-6 leading-snug">
            Pick one — or tap both. You can change this any time in Settings.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Card
              selected={tasks}
              onClick={() => flip('tasks')}
              glyph="✓"
              title="Tasks"
              subtext="Get better organized."
            />
            <Card
              selected={journal}
              onClick={() => flip('journal')}
              glyph="📓"
              title="Journal"
              subtext="Reflect and grow."
            />
          </div>

          {tasks && journal && (
            <p className="text-xs text-text-tertiary text-center mt-4 leading-snug">
              You'll see both walls with a switcher at the top to flip
              between them.
            </p>
          )}
        </div>
      </div>

      <div
        className="px-5 pt-3"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <motion.button
          whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
          onClick={onContinue}
          disabled={!ready}
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
  subtext,
}: {
  selected: boolean;
  onClick: () => void;
  glyph: string;
  title: string;
  subtext: string;
}) {
  return (
    <motion.button
      whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
      onClick={onClick}
      className={`relative w-full text-left p-4 pt-5 rounded-2xl border-2 transition-colors flex flex-col items-start gap-2 min-h-[160px] ${
        selected
          ? 'border-primary bg-primary/10'
          : 'border-border bg-surface hover:border-primary/40'
      }`}
    >
      <span className="text-3xl leading-none" aria-hidden>
        {glyph}
      </span>
      <span
        className={`text-base font-bold ${
          selected ? 'text-primary' : 'text-text-primary'
        }`}
      >
        {title}
      </span>
      <span className="text-xs text-text-secondary leading-snug">{subtext}</span>
      {selected && (
        <span
          className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center"
          aria-hidden
        >
          ✓
        </span>
      )}
    </motion.button>
  );
}
