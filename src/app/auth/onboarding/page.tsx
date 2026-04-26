'use client';

// Onboarding v3.1 — Welcome → PrimaryUse → Guide* → Install → Name.
// PrimaryUse moved before Guide because the guide selection is
// journaling-flavored (Ben/Quinn/Sage/Bodhi each have a guide voice
// for letters and reflective prompts). Tasks-only users skip the
// Guide step entirely and default to Ben — they'll never see guide
// content unless they later toggle Both/Journal in Settings.
//
// Steps are addressed by string key, not numeric index, so the
// "skip guide" branch reorders cleanly without index gymnastics.

import { useMemo, useState } from 'react';
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

type StepKey = 'welcome' | 'primaryUse' | 'guide' | 'install' | 'name';

export default function OnboardingPage() {
  const router = useRouter();
  const { completeOnboarding, updateProfile, loading, user } = useAuthStore();
  const celebrate = useUiStore((s) => s.celebrate);

  const googleName =
    user?.user_metadata?.full_name || user?.user_metadata?.name || '';
  const [name, setName] = useState(googleName);
  const [guide, setGuide] = useState<GuideId>('ben');
  const [primaryUse, setPrimaryUse] = useState<PrimaryUse | null>(null);
  const [stepKey, setStepKey] = useState<StepKey>('welcome');
  const [error, setError] = useState('');

  // Recompute the active flow whenever the user's primary-use pick
  // changes. Tasks-only flow drops the Guide step.
  const flow = useMemo<StepKey[]>(() => {
    const isTasksOnly = primaryUse === 'tasks';
    return isTasksOnly
      ? ['welcome', 'primaryUse', 'install', 'name']
      : ['welcome', 'primaryUse', 'guide', 'install', 'name'];
  }, [primaryUse]);

  const stepIndex = flow.indexOf(stepKey);
  const totalSteps = flow.length;

  const next = () => {
    setError('');
    const nextStep = flow[stepIndex + 1];
    if (nextStep) setStepKey(nextStep);
  };
  const back = () => {
    setError('');
    const prevStep = flow[Math.max(0, stepIndex - 1)];
    if (prevStep) setStepKey(prevStep);
  };

  const handleInstalled = async () => {
    updateProfile({ pwa_installed: true }).catch(() => {});
    next();
  };

  const handleInstallSkip = async () => {
    updateProfile({ install_prompt_dismissed_at: new Date().toISOString() }).catch(() => {});
    next();
  };

  const handleComplete = async () => {
    try {
      setError('');
      // Default to 'both' if somehow we got here without a pick —
      // shouldn't be possible since PrimaryUseStep gates Continue
      // on a selection, but defensive.
      const chosenUse: PrimaryUse = primaryUse ?? 'both';
      await completeOnboarding(name.trim() || 'Friend', '', [], guide, chosenUse);
      if (typeof window !== 'undefined') {
        localStorage.setItem('tour_pending', '1');
        // Seed wallState so the first render lands on the right
        // wall. 'both' defaults to journal-side as the friendlier
        // first impression (pulse + letters intro).
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
        prefersReducedMotion ? 200 : 900,
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
      {stepIndex > 0 && (
        <div className="fixed top-0 inset-x-0 z-20 h-0.5 bg-border/50">
          <motion.div
            className="h-full bg-primary"
            initial={false}
            animate={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
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
          key={stepKey}
          initial={prefersReducedMotion ? undefined : { opacity: 0, x: 18 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, x: 0 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0, x: -18 }}
          transition={{ duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full"
        >
          {stepKey === 'welcome' && <WelcomeStep onContinue={next} />}
          {stepKey === 'primaryUse' && (
            <PrimaryUseStep
              value={primaryUse}
              onChange={setPrimaryUse}
              onContinue={next}
            />
          )}
          {stepKey === 'guide' && (
            <GuideStep value={guide} onChange={setGuide} onContinue={next} />
          )}
          {stepKey === 'install' && (
            <InstallStep
              guide={guide}
              onInstalled={handleInstalled}
              onSkip={handleInstallSkip}
            />
          )}
          {stepKey === 'name' && (
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

      {stepIndex > 0 && (
        <motion.button
          initial={prefersReducedMotion ? undefined : { opacity: 0 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1 }}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
          onClick={back}
          className="fixed top-3 left-4 z-30 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          style={{ marginTop: 'env(safe-area-inset-top)' }}
        >
          ← Back
        </motion.button>
      )}
    </div>
  );
}
