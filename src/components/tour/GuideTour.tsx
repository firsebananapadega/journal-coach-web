'use client';

// GuideTour — mounted in the authenticated app shell. Auto-starts on
// first paint for a user whose `tour_pending` localStorage flag is
// set (that flag is written when onboarding completes, so legacy
// users never see the tour). Orchestrates:
//   - anchor measurement (getBoundingClientRect + MutationObserver
//     for async mounts like WallNav swapping center-pill meaning
//     after a wall flip)
//   - step advancement via ambient events:
//       'wall-changed' — useWallState().activeWall switches
//   - wiggle on the wall-edge-tab during its step
//   - persisting tour_completed on complete or skip

import { useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { useWallState } from '@/lib/wallState';
import { getLocalizedTourLine, type GuideId } from '@/lib/guideConfigs';
import { getLocale } from '@/lib/language';
import { t } from '@/lib/translations';
import { useTourStore } from '@/lib/tourStore';
import { TOUR_STEPS } from '@/lib/tourSteps';
import Spotlight from './Spotlight';
import TourCard from './TourCard';

export default function GuideTour() {
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const activeWall = useWallState((s) => s.activeWall);

  const active = useTourStore((s) => s.active);
  const stepIdx = useTourStore((s) => s.stepIdx);
  const anchorRect = useTourStore((s) => s.anchorRect);
  const nudge = useTourStore((s) => s.nudge);
  const finished = useTourStore((s) => s.finished);
  const start = useTourStore((s) => s.start);
  const advance = useTourStore((s) => s.advance);
  const skip = useTourStore((s) => s.skip);
  const setAnchorRect = useTourStore((s) => s.setAnchorRect);
  const setNudge = useTourStore((s) => s.setNudge);

  const step = TOUR_STEPS[stepIdx];
  const guide = (profile?.preferred_guide ?? 'ben') as GuideId;

  // Auto-start: localStorage 'tour_pending' flag gated on profile
  // being loaded + onboarding complete. Legacy users (no flag) never
  // trigger.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!profile) return;
    if (profile.tour_completed) return;
    if (!profile.onboarding_completed) return;
    if (startedRef.current) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('tour_pending') !== '1') return;
    const id = window.setTimeout(() => {
      startedRef.current = true;
      start();
    }, 400);
    return () => window.clearTimeout(id);
  }, [profile, start]);

  // Persist completion (skip or complete).
  const persistedRef = useRef(false);
  useEffect(() => {
    if (!finished || persistedRef.current) return;
    if (!profile || profile.tour_completed) return;
    persistedRef.current = true;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('tour_pending');
    }
    updateProfile({ tour_completed: true }).catch(() => {
      // localStorage clear is enough to prevent re-fire even if
      // Supabase write fails.
    });
  }, [finished, profile, updateProfile]);

  // Anchor measurement — re-measure on resize, scroll, and DOM mutations.
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

  // Idle nudge — only steps that opt in (currently none, but retained
  // so future steps can use `idleNudgeMs`).
  useEffect(() => {
    setNudge(false);
    if (!active || !step?.idleNudgeMs) return;
    const id = window.setTimeout(() => setNudge(true), step.idleNudgeMs);
    return () => window.clearTimeout(id);
  }, [active, step, setNudge]);

  // Wall-changed auto-advance.
  const prevWallRef = useRef(activeWall);
  useEffect(() => {
    if (!active) return;
    if (step?.autoAdvance === 'wall-changed' && activeWall !== prevWallRef.current) {
      advance();
    }
    prevWallRef.current = activeWall;
  }, [activeWall, active, step, advance]);

  // Wiggle the anchor while the step that opts in is active.
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

  const locale = getLocale();
  const copyKey = nudge && step.nudgeKey ? step.nudgeKey : step.copyKey;
  const text = getLocalizedTourLine(guide, copyKey, locale);

  return (
    <>
      <Spotlight rect={anchorRect} />

      <AnimatePresence mode="wait">
        <TourCard
          key={step.id}
          guide={guide}
          pose={step.pose}
          text={text}
          anchorRect={anchorRect}
          nextLabel={t(step.nextLabelKey)}
          skipLabel={t('tour.skip')}
          showNextButton={step.showNextButton}
          onNext={advance}
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
