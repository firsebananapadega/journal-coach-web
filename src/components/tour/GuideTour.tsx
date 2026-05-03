'use client';

// GuideTour — orchestrates the bucket-aware onboarding tour.
//
// What it does:
//   1. On mount: if the user just completed onboarding (tour_pending
//      localStorage flag) AND tour_completed === false, kick the tour.
//   2. Picks the right step list based on profile.primary_use:
//        - 'both'    → full 6-step flow (pulse welcome → free-write
//                      → wall switch → mic → wall switch back → outro)
//        - 'tasks'   → tasks-only subset (welcome → mic → outro)
//        - 'journal' → journal-only subset (welcome → free-write → outro)
//   3. On step change: if step.route is set and the current pathname
//      differs, router.push() there. The page mounts, the anchor
//      element appears, the spotlight measurement effect runs.
//   4. Anchor measurement: getBoundingClientRect + MutationObserver
//      so anchors that mount async (e.g. wall-nav after a wall flip)
//      still get measured.
//   5. Auto-advance: 'wall-changed' fires when the user taps the
//      highlighted wall edge tab themselves — saves them having to
//      hunt for the Next button.
//   6. On finish or skip: tour_completed = true (DB + localStorage
//      flag cleared), tour goes inactive.

import { useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { type GuideId } from '@/lib/guideConfigs';
import { t } from '@/lib/translations';
import { useTourStore } from '@/lib/tourStore';
import { getStepsForBucket } from '@/lib/tourSteps';
import Spotlight from './Spotlight';
import TourCard from './TourCard';

export default function GuideTour() {
  const router = useRouter();
  const pathname = usePathname();
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const active = useTourStore((s) => s.active);
  const stepIdx = useTourStore((s) => s.stepIdx);
  const steps = useTourStore((s) => s.steps);
  const anchorRect = useTourStore((s) => s.anchorRect);
  const finished = useTourStore((s) => s.finished);
  const start = useTourStore((s) => s.start);
  const advance = useTourStore((s) => s.advance);
  const skip = useTourStore((s) => s.skip);
  const setAnchorRect = useTourStore((s) => s.setAnchorRect);

  const step = steps[stepIdx];
  const guide = (profile?.preferred_guide ?? 'bodhi') as GuideId;

  // ── Auto-start ────────────────────────────────────────────────
  // Same gating as before: profile must be loaded, onboarding done,
  // tour_completed === false, AND localStorage flag set. Bucket comes
  // from primary_use; default to 'both' if somehow null.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!profile) return;
    if (profile.tour_completed) return;
    if (!profile.onboarding_completed) return;
    if (startedRef.current) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('tour_pending') !== '1') return;
    startedRef.current = true;
    const bucket = profile.primary_use ?? 'both';
    const filteredSteps = getStepsForBucket(bucket);
    if (filteredSteps.length === 0) {
      // Defensive: bucket has no steps (shouldn't happen). Mark
      // complete and bail.
      localStorage.removeItem('tour_pending');
      updateProfile({ tour_completed: true }).catch(() => {});
      return;
    }
    // Tiny delay so the post-signup celebrate animation finishes
    // and the destination page mounts before we measure anchors.
    const id = window.setTimeout(() => start(filteredSteps), 500);
    return () => window.clearTimeout(id);
  }, [profile, start, updateProfile]);

  // ── Auto-navigate on step change ──────────────────────────────
  // If the new step lives on a route the user isn't on, push there.
  // The auto-advance effects + anchor measurement effect run AFTER
  // the route mounts, so pixel positioning lands on real geometry.
  useEffect(() => {
    if (!active || !step) return;
    if (!step.route) return;
    if (pathname === step.route) return;
    router.push(step.route);
  }, [active, step, stepIdx, pathname, router]);

  // ── Persist completion ───────────────────────────────────────
  // Fired exactly once per finish/skip. Clears the localStorage
  // flag and flips tour_completed in the DB.
  const persistedRef = useRef(false);
  useEffect(() => {
    if (!finished || persistedRef.current) return;
    if (!profile || profile.tour_completed) return;
    persistedRef.current = true;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('tour_pending');
    }
    updateProfile({ tour_completed: true }).catch(() => {
      // localStorage clear is enough to prevent re-fire on this
      // device even if Supabase write fails.
    });
  }, [finished, profile, updateProfile]);

  // ── Anchor measurement ───────────────────────────────────────
  // Re-measure on resize, scroll, and DOM mutations so anchors that
  // mount async (e.g. wall-nav after a wall flip animation) get
  // their box updated.
  useEffect(() => {
    if (!active || !step?.anchorSelector) {
      setAnchorRect(null);
      return;
    }
    let raf = 0;
    const measure = () => {
      const el = document.querySelector(step.anchorSelector!);
      if (!el) {
        setAnchorRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setAnchorRect({ x: r.x, y: r.y, width: r.width, height: r.height });
    };
    measure();
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, { passive: true });
    const mo = new MutationObserver(onResize);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize);
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [active, step, setAnchorRect]);

  // ── Wall-changed auto-advance ────────────────────────────────
  // PR 2 retired the wall-flip mechanism; the 'wall-changed'
  // auto-advance trigger no longer fires (single wall now). Tour
  // steps that previously used this auto-advance fall back to the
  // user tapping Next to continue.

  // ── Anchor wiggle ────────────────────────────────────────────
  useEffect(() => {
    if (!active || !step?.wiggleAnchor) return;
    const el = document.querySelector<HTMLElement>(step.anchorSelector!);
    if (!el) return;
    el.style.animation = 'tourWiggle 1.6s ease-in-out infinite';
    return () => {
      el.style.animation = '';
    };
  }, [active, step]);

  if (!active || !profile || !step) return null;

  // For wallSwitchToTasks specifically, Next should ALSO flip the
  // wall (router.push handles this via the next step's route). For
  // wallSwitchToJournal, same. The dispatcher above handles the nav
  // — Next just needs to advance().
  const onNext = () => advance();

  return (
    <>
      <Spotlight rect={anchorRect} />
      <AnimatePresence mode="wait">
        <TourCard
          key={step.id}
          guide={guide}
          pose={step.pose}
          text={t(step.copyKey)}
          anchorRect={anchorRect}
          nextLabel={t(step.nextLabelKey)}
          skipLabel={t('tour.skip')}
          showNextButton={step.showNextButton}
          onNext={onNext}
          onSkip={skip}
        />
      </AnimatePresence>
      <style>{`
        @keyframes tourWiggle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(4px); }
        }
      `}</style>
    </>
  );
}
