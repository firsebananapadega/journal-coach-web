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

// Custom checklist illustration — stacked rows with checkbox squares
// + meaningful line lengths. Reads as "tasks/list" without using a
// single tick mark (which the user pointed out felt off).
function TasksIllustration({ active }: { active: boolean }) {
  const stroke = active ? 'currentColor' : 'currentColor';
  return (
    <svg
      viewBox="0 0 64 64"
      width="100%"
      height="100%"
      fill="none"
      stroke={stroke}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* row 1 — checked */}
      <rect x="8" y="14" width="10" height="10" rx="2.5" fill={active ? 'currentColor' : 'transparent'} fillOpacity={active ? 0.18 : 0} />
      <path d="M11 19 l2 2 l4 -4" strokeWidth="3" />
      <line x1="24" y1="19" x2="52" y2="19" strokeWidth="3" />
      {/* row 2 — empty */}
      <rect x="8" y="29" width="10" height="10" rx="2.5" />
      <line x1="24" y1="34" x2="56" y2="34" strokeWidth="3" />
      {/* row 3 — empty, shorter */}
      <rect x="8" y="44" width="10" height="10" rx="2.5" />
      <line x1="24" y1="49" x2="46" y2="49" strokeWidth="3" />
    </svg>
  );
}

// Open-book illustration — symmetric pages with text lines and a
// gentle center seam. Replaces the closed-notebook glyph with
// something that reads more clearly as "journaling / reflection."
function JournalIllustration({ active }: { active: boolean }) {
  const stroke = 'currentColor';
  return (
    <svg
      viewBox="0 0 64 64"
      width="100%"
      height="100%"
      fill="none"
      stroke={stroke}
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* book pages — two facing curves meeting at a spine */}
      <path
        d="M6 16 C 14 12, 24 12, 32 16 L 32 52 C 24 48, 14 48, 6 52 Z"
        fill={active ? 'currentColor' : 'transparent'}
        fillOpacity={active ? 0.10 : 0}
      />
      <path
        d="M58 16 C 50 12, 40 12, 32 16 L 32 52 C 40 48, 50 48, 58 52 Z"
        fill={active ? 'currentColor' : 'transparent'}
        fillOpacity={active ? 0.10 : 0}
      />
      {/* spine */}
      <line x1="32" y1="16" x2="32" y2="52" />
      {/* left lines */}
      <line x1="12" y1="24" x2="26" y2="22" strokeWidth="2" opacity="0.7" />
      <line x1="12" y1="32" x2="26" y2="30" strokeWidth="2" opacity="0.7" />
      <line x1="12" y1="40" x2="22" y2="39" strokeWidth="2" opacity="0.7" />
      {/* right lines */}
      <line x1="38" y1="22" x2="52" y2="24" strokeWidth="2" opacity="0.7" />
      <line x1="38" y1="30" x2="52" y2="32" strokeWidth="2" opacity="0.7" />
      <line x1="38" y1="39" x2="48" y2="40" strokeWidth="2" opacity="0.7" />
    </svg>
  );
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
      {/* Ambient glow — same warm signature used elsewhere in onboarding */}
      <div
        aria-hidden
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[70vmin] h-[70vmin] rounded-full blur-3xl pointer-events-none opacity-50"
        style={{ background: 'var(--theme-primary-glow)' }}
      />

      <div
        className="relative z-10 flex-1 flex flex-col px-5 pb-2"
        style={{ paddingTop: 'max(3.5rem, env(safe-area-inset-top))' }}
      >
        <div className="max-w-md w-full mx-auto flex-1 flex flex-col">
          <h1 className="text-3xl font-bold text-text-primary text-center leading-tight">
            What did you come here for?
          </h1>
          <p className="text-base text-text-secondary text-center mt-3 mb-6 leading-snug">
            Pick one — or tap both. You can change this any time in
            Settings.
          </p>

          {/* Cards — flex-1 so they expand vertically until just above
              the Continue button. min-h-0 lets the flex shrink them
              cleanly on shorter viewports. */}
          <div className="grid grid-cols-2 gap-4 flex-1 min-h-0 pb-2">
            <Card
              selected={tasks}
              onClick={() => flip('tasks')}
              title="Tasks"
              subtext="Get better organized."
              illustration={TasksIllustration}
            />
            <Card
              selected={journal}
              onClick={() => flip('journal')}
              title="Journal"
              subtext="Reflect and grow."
              illustration={JournalIllustration}
            />
          </div>

          {tasks && journal && (
            <p className="text-xs text-text-tertiary text-center mt-3 leading-snug">
              You'll see both walls with a switcher at the top to flip
              between them.
            </p>
          )}
        </div>
      </div>

      <div
        className="relative z-10 px-5 pt-3"
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
  title,
  subtext,
  illustration: Illustration,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtext: string;
  illustration: React.ComponentType<{ active: boolean }>;
}) {
  return (
    <motion.button
      whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
      onClick={onClick}
      className={`relative h-full w-full text-left rounded-3xl border-2 transition-all flex flex-col p-5 overflow-hidden ${
        selected
          ? 'border-primary bg-primary/12 shadow-warm-md'
          : 'border-border bg-surface hover:border-primary/40 shadow-warm-sm'
      }`}
    >
      {/* Subtle glow when selected */}
      {selected && (
        <div
          aria-hidden
          className="absolute -top-12 -right-12 w-44 h-44 rounded-full blur-3xl pointer-events-none"
          style={{ background: 'var(--theme-primary-glow)' }}
        />
      )}

      {/* Illustration — sized to fill the card's upper region. The
          color is driven by the parent's text color so it inherits
          the active/inactive treatment cleanly. */}
      <div
        className={`relative flex-1 min-h-0 flex items-center justify-center pb-3 transition-colors ${
          selected ? 'text-primary' : 'text-text-secondary'
        }`}
      >
        <div className="w-[68%] aspect-square">
          <Illustration active={selected} />
        </div>
      </div>

      <div className="relative">
        <p
          className={`text-lg font-bold leading-tight ${
            selected ? 'text-primary' : 'text-text-primary'
          }`}
        >
          {title}
        </p>
        <p className="text-sm text-text-secondary mt-1 leading-snug">{subtext}</p>
      </div>

      {selected && (
        <span
          className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shadow-warm-sm"
          aria-hidden
        >
          ✓
        </span>
      )}
    </motion.button>
  );
}
