'use client';

// Onboarding v5 — productivity-first redesign. 5 mandatory screens
// + 1 conditional install screen.
//
//   1. Welcome           (existing WelcomeStep — language toggle)
//   2. What brought you here?  (productivity-flavored intent chips)
//   3. Voice capture demo      (real classify + real save — magic moment)
//   4. Permission primer       (morning-briefing pre-prompt card)
//   5. Install                 (existing InstallStep, auto-skips)
//
// v4's reflection-time question and text-only first-win were folded
// into Screen 3's voice-capture demo. The intent chips now drive a
// narrower auto-flip set inside completeOnboarding ('reflect' →
// plans_enabled + Gratitude notebook; everything else is core).
//
// Existing users with onboarding_completed=true never see this — the
// (app)/layout redirect only fires when the flag is false.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  useAuthStore,
  type IntentChip,
  type Profile,
} from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { prefersReducedMotion } from '@/lib/motionVariants';
import type { GuideId } from '@/lib/guideConfigs';
import WelcomeStep from '@/components/onboarding/WelcomeStep';
import BroughtYouHereStep from '@/components/onboarding/BroughtYouHereStep';
import OnboardingCaptureStep from '@/components/onboarding/OnboardingCaptureStep';
import PermissionPrimerStep from '@/components/onboarding/PermissionPrimerStep';
import InstallStep from '@/components/onboarding/InstallStep';

type StepKey =
  | 'welcome'
  | 'broughtYouHere'
  | 'capture'
  | 'primer'
  | 'install';

export default function OnboardingPage() {
  const router = useRouter();
  const { completeOnboarding, updateProfile, user } = useAuthStore();
  const celebrate = useUiStore((s) => s.celebrate);

  // Default name from Google auth, falling back to 'Friend'.
  const googleName =
    user?.user_metadata?.full_name || user?.user_metadata?.name || '';
  const [name] = useState(googleName);
  // Default guide is Bodhi; guide picker happens on /guided's first
  // visit so users see who they're picking BEFORE committing.
  const [guide] = useState<GuideId>('bodhi');

  // v5 personalization state — reflectionTime dropped (folded into
  // the morning-briefing primer at fixed 8 AM).
  const [broughtYouHere, setBroughtYouHere] = useState<IntentChip[]>([]);
  const [pushGranted, setPushGranted] = useState<boolean>(false);

  const [stepKey, setStepKey] = useState<StepKey>('welcome');
  // Install step has a sub-view (overview vs carousel). Lifted here
  // so the page-level Back can collapse carousel → overview before
  // it falls through to "go to previous step."
  const [installView, setInstallView] = useState<'overview' | 'carousel'>('overview');
  const [error, setError] = useState('');

  const flow = useMemo<StepKey[]>(() => {
    return ['welcome', 'broughtYouHere', 'capture', 'primer', 'install'];
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
      await completeOnboarding(
        name.trim() || 'Friend',
        '',
        [],
        guide,
        'both',
        {
          broughtYouHere,
          pushGranted,
        },
      );
      // Reset tour state so GuideTour fires fresh.
      try {
        await updateProfile({
          tour_completed: false,
          tour_seen_tabs: [],
        } as Partial<Profile>);
      } catch {
        /* non-fatal */
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('tour_pending', '1');
        localStorage.removeItem('tour_seen_tabs.v1');
      }
      celebrate();
      // PR 2 retired the journal wall, so /today is the only landing.
      // If the user got here via a share link, route them there
      // instead.
      let destination = '/today';
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

  const handleInstalled = async () => {
    updateProfile({ pwa_installed: true }).catch(() => {});
    await handleComplete();
  };

  const handleInstallSkip = async () => {
    updateProfile({ install_prompt_dismissed_at: new Date().toISOString() }).catch(() => {});
    await handleComplete();
  };

  const handlePrimerComplete = (granted: boolean) => {
    setPushGranted(granted);
    next();
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg">
      {/* Soft primary-tinted gradient background — Confirmafy-style
          card-on-color treatment. Welcome step has its own full-bleed
          design so we suppress the gradient there. */}
      {stepKey !== 'welcome' && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at top, rgba(196, 85, 61, 0.18), transparent 55%), radial-gradient(ellipse at bottom, rgba(196, 85, 61, 0.10), transparent 60%)',
          }}
        />
      )}

      {/* Top progress bar — visible from step 2 onward (welcome owns
          its own header animation). Mirrors the Confirmafy reference:
          thin green-fill bar at the very top of the screen. */}
      {stepIndex > 0 && (
        <div className="fixed top-0 inset-x-0 z-20 h-1 bg-border/30">
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
          className="relative w-full"
        >
          {stepKey === 'welcome' && <WelcomeStep onContinue={next} />}

          {/* Steps 2-4 share the card-on-gradient layout. Welcome
              owns its own (existing) layout; Install owns its own. */}
          {(stepKey === 'broughtYouHere'
            || stepKey === 'capture'
            || stepKey === 'primer') && (
            <div className="relative min-h-screen flex items-start justify-center px-5 pt-16 pb-8">
              <div className="w-full max-w-md bg-surface rounded-3xl border border-border shadow-warm-lg p-6">
                {stepKey === 'broughtYouHere' && (
                  <BroughtYouHereStep
                    value={broughtYouHere}
                    onChange={setBroughtYouHere}
                    onContinue={next}
                    onBack={back}
                  />
                )}
                {stepKey === 'capture' && (
                  <OnboardingCaptureStep
                    onComplete={next}
                    onBack={back}
                  />
                )}
                {stepKey === 'primer' && (
                  <PermissionPrimerStep
                    onComplete={handlePrimerComplete}
                    onBack={back}
                  />
                )}
              </div>
            </div>
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

      {error && (
        <p className="fixed bottom-6 inset-x-0 text-center text-sm text-error px-5">
          {error}
        </p>
      )}
    </div>
  );
}
