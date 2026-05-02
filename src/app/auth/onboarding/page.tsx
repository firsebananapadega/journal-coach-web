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
import { useAuthStore, type PrimaryUse, type Profile } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { prefersReducedMotion } from '@/lib/motionVariants';
import type { GuideId } from '@/lib/guideConfigs';
import WelcomeStep from '@/components/onboarding/WelcomeStep';
import PrimaryUseStep from '@/components/onboarding/PrimaryUseStep';
import InstallStep from '@/components/onboarding/InstallStep';

// 3-screen onboarding (was 5). guide + name steps removed — guide
// is picked on first /guided visit, name defaults to Google auth or
// 'Friend'. The component files (GuideStep.tsx, NameStep.tsx) stay
// in the codebase so a git revert to the `pre-copy-rewrite` tag
// restores them cleanly.
type StepKey = 'welcome' | 'primaryUse' | 'install';

export default function OnboardingPage() {
  const router = useRouter();
  const { completeOnboarding, updateProfile, user } = useAuthStore();
  const celebrate = useUiStore((s) => s.celebrate);

  // Default name from Google auth, falling back to 'Friend'. The
  // separate NameStep was removed (it asked for info we already had
  // from Google or could default sanely) — name is settable later
  // via Settings if the user cares.
  const googleName =
    user?.user_metadata?.full_name || user?.user_metadata?.name || '';
  const [name] = useState(googleName);
  // Default guide is Bodhi (the meditative mascot from the welcome
  // screen). Guide selection moved to /guided's first-visit picker
  // so users see what they're picking BEFORE they commit. Setter
  // unused now — keeping the state slot so completeOnboarding's
  // signature doesn't change.
  const [guide] = useState<GuideId>('bodhi');
  const [primaryUse, setPrimaryUse] = useState<PrimaryUse | null>(null);
  const [stepKey, setStepKey] = useState<StepKey>('welcome');
  // Install step has a sub-view (overview vs carousel). Lifted here
  // so the page-level Back can collapse carousel → overview before
  // it falls through to "go to previous step."
  const [installView, setInstallView] = useState<'overview' | 'carousel'>('overview');
  const [error, setError] = useState('');

  // 3-screen onboarding (was 5). GuideStep moved to /guided first
  // visit so users pick their guide in context. NameStep dropped —
  // we already have the Google name and 'Friend' is a fine default
  // for users who skip it. Same flow regardless of bucket.
  const flow = useMemo<StepKey[]>(() => {
    return ['welcome', 'primaryUse', 'install'];
  }, []);

  const stepIndex = flow.indexOf(stepKey);
  const totalSteps = flow.length;

  const next = () => {
    setError('');
    const nextStep = flow[stepIndex + 1];
    if (nextStep) setStepKey(nextStep);
  };
  const back = () => {
    setError('');
    // Context-aware back: if we're on the install step's carousel
    // sub-view, collapse back to its overview before stepping
    // out of the install step entirely.
    if (stepKey === 'install' && installView === 'carousel') {
      setInstallView('overview');
      return;
    }
    const prevStep = flow[Math.max(0, stepIndex - 1)];
    if (prevStep) setStepKey(prevStep);
  };

  const handleComplete = async () => {
    try {
      setError('');
      // Default to 'both' if somehow we got here without a pick —
      // shouldn't be possible since PrimaryUseStep gates Continue
      // on a selection, but defensive.
      const chosenUse: PrimaryUse = primaryUse ?? 'both';
      await completeOnboarding(name.trim() || 'Friend', '', [], guide, chosenUse);
      // Defensively reset tour state — if the user signed up before
      // (e.g. their Supabase profile already had tour_completed=true
      // from a prior incarnation), GuideTour's auto-start would skip
      // the tour because tour_completed gate is true. Resetting here
      // mirrors what Settings → Replay Onboarding does so completing
      // the welcome flow always lands on a fresh tour state.
      try {
        await updateProfile({
          tour_completed: false,
          tour_seen_tabs: [],
        } as Partial<Profile>);
      } catch {
        // Non-fatal — the localStorage flag below still triggers the
        // tour for users with tour_completed already false.
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('tour_pending', '1');
        // Also clear any stale tab-popup tracking so the per-tab
        // first-visit popups fire alongside the linear tour.
        localStorage.removeItem('tour_seen_tabs.v1');
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
      // If the user got here via a share link, route them straight to
      // the invite acceptance after onboarding instead of the default
      // wall destination.
      let destination = chosenUse === 'tasks' ? '/today' : '/home';
      if (typeof window !== 'undefined') {
        try {
          const pending = window.sessionStorage.getItem('pendingShareNext');
          if (pending && pending.startsWith('/') && !pending.startsWith('//')) {
            destination = pending;
            window.sessionStorage.removeItem('pendingShareNext');
          }
        } catch {}
      }
      window.setTimeout(
        () => router.replace(destination),
        prefersReducedMotion ? 200 : 900,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  // Install is now the LAST step. Both handlers complete onboarding
  // directly instead of advancing to the (removed) NameStep.
  const handleInstalled = async () => {
    updateProfile({ pwa_installed: true }).catch(() => {});
    await handleComplete();
  };

  const handleInstallSkip = async () => {
    updateProfile({ install_prompt_dismissed_at: new Date().toISOString() }).catch(() => {});
    await handleComplete();
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
          {stepKey === 'install' && (
            <InstallStep
              guide={guide}
              onInstalled={handleInstalled}
              onSkip={handleInstallSkip}
              view={installView}
              onViewChange={setInstallView}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {stepIndex > 0 && (
        <motion.button
          initial={prefersReducedMotion ? undefined : { opacity: 0 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1 }}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
          onClick={back}
          className="fixed top-3 left-4 z-30 inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors px-3.5 py-2 rounded-full bg-surface/70 backdrop-blur border border-border shadow-warm-sm"
          style={{ marginTop: 'env(safe-area-inset-top)' }}
          aria-label="Back"
        >
          <span aria-hidden className="text-base leading-none">←</span>
          <span>Back</span>
        </motion.button>
      )}
    </div>
  );
}
