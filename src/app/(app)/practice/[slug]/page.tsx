'use client';

// Full-screen practice route. Reads the practice by slug from the
// URL, renders a dedicated player with its own chrome (back, end,
// pause, skip). Records a `journal_entries` row of type 'practice'
// when the user reaches the end of the final step's full duration so
// the Patterns Play button can show a completion counter.
//
// Layout:
//   ┌─────────────────────────────┐
//   │ [←]      ● ● ○ ○ ○      [×] │
//   │                             │
//   │       (visual)              │
//   │     step text here          │
//   │                             │
//   │ 2:14 left  [⏸]   Skip step  │
//   └─────────────────────────────┘

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { getPracticeBySlug } from '@/lib/intentionPractices';
import PracticeVisual from '@/components/practice-visuals/PracticeVisual';
import { useJournalStore } from '@/stores/journalStore';
import { useUiStore } from '@/stores/uiStore';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function PracticeRoutePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const router = useRouter();
  const { slug } = use(params);
  const practice = getPracticeBySlug(slug);
  const createEntry = useJournalStore((s) => s.createEntry);
  const showToast = useUiStore((s) => s.showToast);

  const [stepIdx, setStepIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(
    practice?.steps[0]?.durationSec ?? 0,
  );
  const [paused, setPaused] = useState(false);
  // Guard so the completion-record write only fires once even if React
  // re-renders / strict-mode invokes the effect twice.
  const [recorded, setRecorded] = useState(false);

  const isLast = practice ? stepIdx >= practice.steps.length - 1 : false;
  const currentStep = practice?.steps[stepIdx];

  // Total seconds remaining across this step + all upcoming steps.
  const totalRemaining = practice
    ? secondsLeft +
      practice.steps.slice(stepIdx + 1).reduce((sum, s) => sum + s.durationSec, 0)
    : 0;

  // 1-second tick. Pauses cleanly when `paused` is true (no decrement,
  // no auto-advance). On final-step completion: record + return.
  useEffect(() => {
    if (!practice) return;
    if (paused) return;
    if (secondsLeft <= 0) {
      if (isLast) {
        if (!recorded) {
          setRecorded(true);
          // Record completion as a journal entry (filtered out of
          // History; surfaces as the Patterns Play button counter).
          createEntry({
            entry_type: 'practice',
            content_text: null,
            title: `Practice — ${practice.intentionTitle}`,
            metadata: {
              intention_title: practice.intentionTitle,
              slug: practice.slug,
              category: practice.category,
              durationSec: practice.totalSec,
              completed_at: new Date().toISOString(),
            },
          })
            .then(() => {
              showToast('Practice saved ✓');
            })
            .catch((err) => {
              // Surface save failures so the user knows the counter
              // won't tick up (previously swallowed silently, which
              // hid a DB schema bug for weeks).
              console.warn('practice save failed', err);
              showToast("Couldn't save practice — try again");
            });
        }
        const id = window.setTimeout(() => router.back(), 800);
        return () => window.clearTimeout(id);
      }
      const nextIdx = stepIdx + 1;
      setStepIdx(nextIdx);
      setSecondsLeft(practice.steps[nextIdx].durationSec);
      return;
    }
    const id = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [secondsLeft, stepIdx, isLast, practice, paused, recorded, createEntry, router]);

  // Slug not found in our catalog — bounce back gently.
  if (!practice) {
    return (
      <div className="fixed inset-0 z-[80] bg-bg flex flex-col items-center justify-center p-6">
        <p className="text-sm text-text-tertiary">Practice not found.</p>
        <button
          onClick={() => router.back()}
          className="mt-4 text-primary text-sm font-medium"
        >
          ← Back
        </button>
      </div>
    );
  }

  const skip = () => setSecondsLeft(0);
  const togglePause = () => setPaused((p) => !p);

  return (
    <div
      className="fixed inset-0 z-[80] bg-bg flex flex-col"
      style={{
        background:
          'radial-gradient(ellipse at center top, var(--color-surface) 0%, var(--color-bg) 70%)',
      }}
    >
      {/* Header — back arrow, progress dots, end (×) */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <button
          onClick={() => router.back()}
          className="w-11 h-11 flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
          aria-label={t('common.back')}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>

        <div className="flex items-center gap-1.5 flex-1 max-w-xs mx-2">
          {practice.steps.map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-1 rounded-full transition-colors ${
                i < stepIdx
                  ? 'bg-primary'
                  : i === stepIdx
                  ? 'bg-primary/60'
                  : 'bg-border'
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => router.back()}
          className="w-11 h-11 flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
          aria-label={t('practice.end')}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Center — visual + step text */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 relative">
        <PracticeVisual
          slug={practice.slug}
          category={practice.category}
          breathCycle={currentStep?.breathCycle}
          paused={paused}
        />
        <AnimatePresence mode="wait">
          <motion.p
            key={stepIdx}
            initial={prefersReducedMotion ? undefined : { opacity: 0, y: 8 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="relative text-center text-xl text-text-primary font-medium leading-relaxed max-w-md"
          >
            {currentStep?.text}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Footer — timer, big pause/play, skip */}
      <div
        className="px-5 pt-3 grid grid-cols-3 items-center"
        style={{ paddingBottom: 'max(1.75rem, env(safe-area-inset-bottom))' }}
      >
        <span className="text-xs text-text-tertiary tabular-nums">
          {formatSeconds(totalRemaining)} {t('practice.timeLeft')}
        </span>
        <div className="flex justify-center">
          <button
            onClick={togglePause}
            className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center shadow-warm-md hover:bg-primary-dark transition-colors"
            aria-label={paused ? t('practice.resume') : t('practice.pause')}
          >
            {paused ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <polygon points="6 4 20 12 6 20" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            )}
          </button>
        </div>
        <button
          onClick={skip}
          className="text-sm text-primary font-medium px-2 py-1.5 rounded-lg hover:bg-surface-elevated justify-self-end"
        >
          {t('practice.skip')}
        </button>
      </div>
    </div>
  );
}
