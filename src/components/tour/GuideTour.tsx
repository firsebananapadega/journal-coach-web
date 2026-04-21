'use client';

// GuideTour — mounted in the authenticated app shell. Auto-starts on
// first paint for a user whose profile.tour_completed === false.
// Orchestrates:
//   - anchor measurement (getBoundingClientRect + MutationObserver
//     for async-mounted anchors like the CapturePreviewSheet)
//   - step advancement via ambient events:
//       'pathname-voice'   — pathname becomes /voice
//       'preview-closed'   — capture-preview anchor unmounts
//       'wall-changed'     — useWallState().activeWall switches
//   - idle nudge timer on steps that declare idleNudgeMs
//   - wiggle on the wall-edge-tab during its step
//   - persisting tour_completed on complete or skip

import { useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
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
  const pathname = usePathname();
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

  // Auto-start when onboarding just completed AND tour_completed is
  // falsy. Gated additionally by a localStorage flag set at onboarding
  // completion — so legacy users (pre-migration) never see the tour
  // even if their profile row lacks the tour_completed column.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!profile) return;
    if (profile.tour_completed) return;
    if (!profile.onboarding_completed) return;
    if (startedRef.current) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('tour_pending') !== '1') return;
    // Delay one tick so the home screen paints first.
    const id = window.setTimeout(() => {
      startedRef.current = true;
      start();
    }, 400);
    return () => window.clearTimeout(id);
  }, [profile, start]);

  // Persist completion (and skip) to Supabase; also clear the
  // localStorage flag so the tour doesn't re-arm on next login.
  const persistedRef = useRef(false);
  useEffect(() => {
    if (!finished || persistedRef.current) return;
    if (!profile || profile.tour_completed) return;
    persistedRef.current = true;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('tour_pending');
    }
    updateProfile({ tour_completed: true }).catch(() => {
      // Swallow — UI has already advanced; localStorage clear is enough
      // to prevent a re-fire even if the migration hasn't run yet.
    });
  }, [finished, profile, updateProfile]);

  // ── Anchor measurement ──
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
    // Re-measure on resize + scroll + DOM mutations (catches async mounts
    // like CapturePreviewSheet and layout shifts from wall flips).
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

  // ── Idle nudge ──
  useEffect(() => {
    setNudge(false);
    if (!active || !step?.idleNudgeMs) return;
    const id = window.setTimeout(() => setNudge(true), step.idleNudgeMs);
    return () => window.clearTimeout(id);
  }, [active, step, setNudge]);

  // ── Ambient event: pathname became /voice → capture step done ──
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    if (!active) return;
    const prev = pathnameRef.current;
    pathnameRef.current = pathname;
    if (step?.autoAdvance === 'pathname-voice' && pathname === '/voice' && prev !== '/voice') {
      advance();
    }
  }, [pathname, active, step, advance]);

  // ── Ambient event: capture-preview anchor unmounted → preview step done ──
  // We watch the anchor-rect: once it was measured (rect non-null) and
  // then disappears (rect null with DOM no longer containing the
  // selector), we advance. Deferred by a short timeout so a mid-measure
  // flicker doesn't fire the transition.
  const sawPreviewRef = useRef(false);
  useEffect(() => {
    if (!active || step?.autoAdvance !== 'preview-closed') {
      sawPreviewRef.current = false;
      return;
    }
    if (anchorRect) {
      sawPreviewRef.current = true;
      return;
    }
    if (!sawPreviewRef.current) return;
    // Anchor was present, now gone — give a beat so we don't trip
    // on a momentary re-render.
    const id = window.setTimeout(() => {
      const stillGone = !document.querySelector('[data-tour="capture-preview"]');
      if (stillGone) advance();
    }, 250);
    return () => window.clearTimeout(id);
  }, [active, step, anchorRect, advance]);

  // ── Ambient event: wall changed ──
  const prevWallRef = useRef(activeWall);
  useEffect(() => {
    if (!active) return;
    if (step?.autoAdvance === 'wall-changed' && activeWall !== prevWallRef.current) {
      advance();
    }
    prevWallRef.current = activeWall;
  }, [activeWall, active, step, advance]);

  // ── Wiggle the wall-edge-tab during its step ──
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

  // ── Copy ──
  const locale = getLocale();
  const copyKey = nudge && step.nudgeKey ? step.nudgeKey : step.copyKey;
  const text = getLocalizedTourLine(guide, copyKey, locale);

  return (
    <>
      {/* Spotlight dim + hole */}
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

      {/* Global keyframes for the wiggle on the wall-edge-tab. Scoped
          via a unique animation name so it doesn't collide with anything. */}
      <style>{`
        @keyframes tourWiggle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(4px); }
        }
      `}</style>
    </>
  );
}
