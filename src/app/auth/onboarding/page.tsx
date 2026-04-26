'use client';

// Onboarding v3 — Philosophy → Guide → Install → Name.
// Each step is a self-contained component; this page just owns the
// tiny bit of cross-step state (name, guide) and calls completeOnboarding.
//
// See docs/ONBOARDING_PLAN.md / .claude/plans/playful-hugging-pebble.md
// for the design rationale.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore, type PrimaryUse } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { prefersReducedMotion } from '@/lib/motionVariants';
import type { GuideId } from '@/lib/guideConfigs';
import WelcomeStep from '@/components/onboarding/WelcomeStep';
import GuideStep from '@/components/onboarding/GuideStep';
import PrimaryUseStep from '@/components/onboarding/PrimaryUseStep';
import InstallStep from '@/components/onboarding/InstallStep';
import NameStep from '@/components/onboarding/NameStep';

type StepIndex = 0 | 1 | 2 | 3 | 4;
const TOTAL_STEPS = 5;

export default function OnboardingPage() {
  const router = useRouter();
  const { completeOnboarding, updateProfile, loading, user } = useAuthStore();
  const celebrate = useUiStore((s) => s.celebrate);

  const [step, setStep] = useState<StepIndex>(0);
  const googleName =
    user?.user_metadata?.full_name || user?.user_metadata?.name || '';
  const [name, setName] = useState(googleName);
  const [guide, setGuide] = useState<GuideId>('ben');
  const [primaryUse, setPrimaryUse] = useState<PrimaryUse | null>(null);
  const [error, setError] = useState('');

  const goto = (n: StepIndex) => {
    setError('');
    setStep(n);
  };

  const handleInstalled = async () => {
    // Fire-and-forget; don't block the onboarding flow on a
    // network hiccup. The profile column is optional metadata.
    updateProfile({ pwa_installed: true }).catch(() => {});
    goto(4);
  };

  const handleInstallSkip = async () => {
    updateProfile({ install_prompt_dismissed_at: new Date().toISOString() }).catch(() => {});
    goto(4);
  };

  const handleComplete = async () => {
    try {
      setError('');
      const chosenUse: PrimaryUse = primaryUse ?? 'journal';
      await completeOnboarding(name.trim() || 'Friend', '', [], guide, chosenUse);
      // Flag the guided tour to run on first /home paint. Using
      // localStorage (rather than profile.tour_completed) because it's
      // set-and-forget and doesn't require the schema migration to
      // have already run — legacy users upgrading won't see a tour,
      // only users who just completed this onboarding flow.
      if (typeof window !== 'undefined') {
        localStorage.setItem('tour_pending', '1');
        // Seed wallState so the first /home or /today render — and
        // any cold reload before the user navigates — lands on the
        // wall they just chose. wallState's hydrate() reads this on
        // mount; without this seed, defaults take over.
        const initialWall = chosenUse === 'tasks' ? 'tasks' : 'journal';
        try {
          localStorage.setItem(
            'wallState.v1',
            JSON.stringify({
              activeWall: initialWall,
              lastTabPerWall: { tasks: 'today', journal: 'pulse' },
            }),
          );
        } catch {}
      }
      celebrate();
      const destination = chosenUse === 'tasks' ? '/today' : '/home';
      window.setTimeout(
        () => router.replace(destination),
        prefersReducedMotion ? 200 : 900
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  return (
    <div className="relative min-h-screen bg-bg">
      {/* Slim progress indicator across the top — skipped on the
          welcome step so the philosophy reveal isn't competing with
          UI chrome. */}
      {step > 0 && (
        <div className="fixed top-0 inset-x-0 z-20 h-0.5 bg-border/50">
          <motion.div
            className="h-full bg-primary"
            initial={false}
            animate={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 240, damping: 32 }
            }
          />
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={prefersReducedMotion ? undefined : { opacity: 0, x: 18 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, x: 0 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0, x: -18 }}
          transition={{ duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full"
        >
          {step === 0 && <WelcomeStep onContinue={() => goto(1)} />}
          {step === 1 && (
            <GuideStep
              value={guide}
              onChange={setGuide}
              onContinue={() => goto(2)}
            />
          )}
          {step === 2 && (
            <PrimaryUseStep
              value={primaryUse}
              onChange={setPrimaryUse}
              onContinue={() => goto(3)}
            />
          )}
          {step === 3 && (
            <InstallStep
              guide={guide}
              onInstalled={handleInstalled}
              onSkip={handleInstallSkip}
            />
          )}
          {step === 4 && (
            <NameStep
              guide={guide}
              value={name}
              onChange={setName}
              onSubmit={handleComplete}
              loading={loading}
              error={error}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Back link — only on steps after welcome */}
      {step > 0 && (
        <motion.button
          initial={prefersReducedMotion ? undefined : { opacity: 0 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1 }}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
          onClick={() => goto(Math.max(0, step - 1) as StepIndex)}
          className="fixed top-3 left-4 z-30 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          style={{ marginTop: 'env(safe-area-inset-top)' }}
        >
          ← Back
        </motion.button>
      )}
    </div>
  );
}
