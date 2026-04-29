'use client';

// Post-onboarding ritual demo — a brief 3-card walkthrough of the
// daily flow (morning Pulse → tasks → evening Pulse) shown ONCE to
// new users right after they complete onboarding. Modeled on the
// Bullet Journal "demonstrate one day" pattern: not a feature tour,
// a lived ritual.
//
// Gating mechanics:
//   - localStorage flag `ritual_demo_pending` set by onboarding's
//     handleComplete (alongside tour_pending). Survives a refresh
//     so even if the user navigates away mid-load, the demo will
//     still fire on the next mount.
//   - profiles.ritual_demo_completed boolean (server-of-record). On
//     skip OR completion we both clear the flag AND flip the column
//     so reinstalls / cleared localStorage don't re-fire the demo.
//
// Bucket adaptation (driven by profile.primary_use):
//   - 'both'    → 3 cards: Morning Pulse · Tasks · Evening Pulse
//   - 'journal' → 2 cards: Morning Pulse · Evening Pulse
//                 (no task card; journal-only users don't have /today)
//   - 'tasks'   → 1 card:  Tasks-only intro
//                 (no Pulse cards; tasks-only users don't have /pulse)
//
// Order of operations on first launch: this demo runs BEFORE the
// existing GuideTour, so the user sees: ritual demo → tour → app.
// (app)/layout.tsx mounts RitualDemo above GuideTour and the gating
// in GuideTour's auto-start effect already waits for tour_pending,
// which is independent — the two won't fight.

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore, type Profile } from '@/stores/authStore';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { getMorningPrompt } from '@/lib/morningPrompts';

type CardKind = 'morning' | 'tasks' | 'evening' | 'journal' | 'tasksOnly';

interface CardSpec {
  kind: CardKind;
  emoji: string;
}

function getCardsForBucket(primaryUse: string | null | undefined): CardSpec[] {
  if (primaryUse === 'tasks') {
    return [{ kind: 'tasksOnly', emoji: '✅' }];
  }
  if (primaryUse === 'journal') {
    return [
      { kind: 'morning', emoji: '☀️' },
      { kind: 'journal', emoji: '📝' },
      { kind: 'evening', emoji: '🌙' },
    ];
  }
  // 'both' (or null fallback) — full ritual.
  return [
    { kind: 'morning', emoji: '☀️' },
    { kind: 'tasks', emoji: '✅' },
    { kind: 'evening', emoji: '🌙' },
  ];
}

export default function RitualDemo() {
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);

  // Auto-start gate: matches GuideTour's pattern — only fires when
  // profile is loaded, onboarding done, demo not yet completed,
  // AND the localStorage `ritual_demo_pending` flag is set (the
  // explicit handshake from onboarding's handleComplete).
  useEffect(() => {
    if (!profile) return;
    if (profile.ritual_demo_completed) return;
    if (!profile.onboarding_completed) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('ritual_demo_pending') !== '1') return;
    // Small delay so the post-signup celebrate animation finishes
    // before the demo overlays the screen.
    const id = window.setTimeout(() => setActive(true), 600);
    return () => window.clearTimeout(id);
  }, [profile]);

  const cards = useMemo(
    () => getCardsForBucket(profile?.primary_use),
    [profile?.primary_use],
  );

  const finish = () => {
    if (closing) return;
    setClosing(true);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ritual_demo_pending');
    }
    // Fire-and-forget — clearing localStorage already prevents
    // re-fire on this device; the column flip is for cross-device.
    updateProfile({ ritual_demo_completed: true } as Partial<Profile>).catch(() => {});
    // Let the exit animation play before unmounting.
    window.setTimeout(() => setActive(false), 320);
  };

  const next = () => {
    if (step < cards.length - 1) {
      setStep((s) => s + 1);
    } else {
      finish();
    }
  };

  if (!active) return null;
  const card = cards[step]!;
  const isLast = step === cards.length - 1;

  return (
    <AnimatePresence>
      {!closing && (
        <motion.div
          key="ritual-demo"
          initial={prefersReducedMotion ? undefined : { opacity: 0 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.32 }}
          className="fixed inset-0 z-[60] bg-bg flex flex-col"
          aria-modal="true"
          role="dialog"
        >
          {/* Ambient warm glow — same signature used in onboarding so
              this overlay feels like a continuation, not an intrusion. */}
          <div
            aria-hidden
            className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[80vmin] h-[80vmin] rounded-full blur-3xl pointer-events-none opacity-60"
            style={{ background: 'var(--theme-primary-glow)' }}
          />

          {/* Top bar — progress dots + skip */}
          <div
            className="relative z-10 flex items-center justify-between px-5"
            style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
          >
            <div className="flex gap-1.5" aria-hidden>
              {cards.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full transition-all ${
                    i === step
                      ? 'w-6 bg-primary'
                      : i < step
                      ? 'w-2 bg-primary/60'
                      : 'w-2 bg-border'
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={finish}
              className="text-sm font-medium text-text-tertiary hover:text-text-secondary transition-colors px-3 py-2 rounded-full"
            >
              {t('ritualDemo.skip')}
            </button>
          </div>

          {/* Card content — animates between steps */}
          <div className="relative z-10 flex-1 overflow-y-auto px-6 pt-6 pb-4 flex flex-col items-center justify-center text-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={card.kind}
                initial={prefersReducedMotion ? undefined : { opacity: 0, y: 12 }}
                animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -12 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="w-full max-w-md mx-auto flex flex-col items-center"
              >
                <div className="text-5xl mb-5" aria-hidden>
                  {card.emoji}
                </div>
                <h2 className="text-2xl font-semibold text-text-primary leading-tight mb-3 max-w-[20ch]">
                  {t(titleKey(card.kind))}
                </h2>
                <p className="text-base text-text-secondary leading-relaxed mb-7 max-w-sm">
                  {t(captionKey(card.kind))}
                </p>

                {/* Mock content — the "show, don't tell" piece. */}
                <MockContent kind={card.kind} />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Bottom CTA */}
          <div
            className="relative z-10 shrink-0 px-6 pt-2"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
          >
            <motion.button
              type="button"
              whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
              onClick={next}
              className="w-full max-w-md mx-auto block py-3.5 bg-primary text-white font-semibold rounded-2xl shadow-warm-md hover:bg-primary-dark transition-colors"
            >
              {isLast ? t('ritualDemo.start') : t('ritualDemo.next')}
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function titleKey(kind: CardKind): string {
  switch (kind) {
    case 'morning':
      return 'ritualDemo.morning.title';
    case 'tasks':
      return 'ritualDemo.tasks.title';
    case 'evening':
      return 'ritualDemo.evening.title';
    case 'journal':
      return 'ritualDemo.journal.title';
    case 'tasksOnly':
      return 'ritualDemo.tasksOnly.title';
  }
}

function captionKey(kind: CardKind): string {
  switch (kind) {
    case 'morning':
      return 'ritualDemo.morning.caption';
    case 'tasks':
      return 'ritualDemo.tasks.caption';
    case 'evening':
      return 'ritualDemo.evening.caption';
    case 'journal':
      return 'ritualDemo.journal.caption';
    case 'tasksOnly':
      return 'ritualDemo.tasksOnly.caption';
  }
}

// Visual mocks — each card shows a small example of what the surface
// looks like with content, NOT a screenshot. Hand-rolled so they
// inherit the live theme colors and stay in sync with the actual
// component aesthetics over time.

function MockContent({ kind }: { kind: CardKind }) {
  if (kind === 'morning') {
    return (
      <div className="w-full bg-surface border border-border rounded-2xl p-4 shadow-warm-sm text-left space-y-2.5">
        <p className="text-[15px] text-text-primary font-medium leading-snug">
          {getMorningPrompt(new Date())}
        </p>
        <div className="bg-bg/50 border border-border/50 rounded-xl px-3.5 py-3">
          <p className="text-[14px] text-text-secondary leading-relaxed italic">
            {t('ritualDemo.morning.exampleAnswer')}
          </p>
        </div>
      </div>
    );
  }
  if (kind === 'tasks' || kind === 'tasksOnly') {
    return (
      <div className="w-full bg-surface border border-border rounded-2xl p-3 shadow-warm-sm text-left space-y-1.5">
        {[
          t('ritualDemo.tasks.example1'),
          t('ritualDemo.tasks.example2'),
          t('ritualDemo.tasks.example3'),
        ].map((label, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-2 py-2.5 rounded-lg"
          >
            <span
              className={`w-5 h-5 rounded-md border-2 ${
                i === 0
                  ? 'border-primary bg-primary text-white text-[12px] flex items-center justify-center'
                  : 'border-border'
              }`}
              aria-hidden
            >
              {i === 0 ? '✓' : ''}
            </span>
            <span
              className={`text-[15px] leading-snug ${
                i === 0
                  ? 'text-text-tertiary line-through'
                  : 'text-text-primary'
              }`}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'evening') {
    return (
      <div className="w-full bg-surface border border-border rounded-2xl p-4 shadow-warm-sm text-left space-y-3">
        <div>
          <span className="text-xs font-semibold text-primary uppercase tracking-wide">
            {t('pulse.wentRightLabel')}
          </span>
          <p className="text-[14px] text-text-primary mt-0.5 leading-relaxed">
            {t('ritualDemo.evening.exampleWentRight')}
          </p>
        </div>
        <div>
          <span className="text-xs font-semibold text-accent uppercase tracking-wide">
            {t('pulse.doneBetterLabel')}
          </span>
          <p className="text-[14px] text-text-primary mt-0.5 leading-relaxed">
            {t('ritualDemo.evening.exampleDoneBetter')}
          </p>
        </div>
      </div>
    );
  }
  if (kind === 'journal') {
    return (
      <div className="w-full bg-surface border border-border rounded-2xl p-4 shadow-warm-sm text-left">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl" aria-hidden>📓</span>
          <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wide">
            Journal
          </span>
        </div>
        <div className="space-y-1.5">
          <div className="h-2 w-full bg-border/60 rounded" />
          <div className="h-2 w-[88%] bg-border/60 rounded" />
          <div className="h-2 w-[72%] bg-border/60 rounded" />
          <div className="h-2 w-[80%] bg-border/60 rounded" />
        </div>
      </div>
    );
  }
  return null;
}
