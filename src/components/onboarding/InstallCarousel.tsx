'use client';

// Generic horizontal carousel for the install walkthrough.
// Now uses CSS scroll-snap with adjacent-slide peek so the user
// can SEE there's more to swipe — solves the prior bug where a
// full-width single-slide layout made it ambiguous whether the
// view was a carousel at all.
//
// Layout: a horizontally scrollable track with each slide sized at
// ~85% of the viewport width and snap-center alignment. The 7-8%
// of the next/previous slide that bleeds in on each side is the
// "peek" affordance.
//
// Slide shape:
//   { id, Illustration: React.FC, caption, imageSrc? }

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';

export interface InstallSlide {
  id: string;
  Illustration: React.FC;
  caption: string;
  imageSrc?: string;
  /** Optional step number rendered as a small circular badge above
   *  the caption. Used by the SVG carousel (iOS non-Safari) so the
   *  three instructions read as a numbered sequence. iOS Safari's
   *  5-screenshot carousel intentionally omits this — its slides are
   *  conceptual taps rather than discrete steps. */
  stepNumber?: number;
}

interface Props {
  slides: InstallSlide[];
  onDone: () => void;
  onSkip: () => void;
  finalCta?: {
    label: string;
    onClick: () => void | Promise<void>;
    busy?: boolean;
  };
}

// How long to dwell on each slide during autoplay. Per user — they
// want a brisk pace that keeps the user's attention without making
// each slide feel like a wait.
const AUTOPLAY_MS = 2000;
// After any user interaction (touch / dot tap), suspend autoplay for
// this long so the user can study the current slide without fighting
// the timer. Resumes silently afterwards.
const AUTOPLAY_PAUSE_AFTER_INTERACTION_MS = 5000;

export default function InstallCarousel({ slides }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // Autoplay reads activeIndex via a ref to dodge stale-closure bugs
  // (the interval callback is created once but activeIndex changes).
  const activeIndexRef = useRef(0);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  // Pause-on-interaction. The interval keeps firing but skips when
  // this ref is true; a timeout flips it back after the cooldown.
  const interactionPausedRef = useRef(false);
  const interactionTimerRef = useRef<number | null>(null);
  const markInteraction = useCallback(() => {
    interactionPausedRef.current = true;
    if (interactionTimerRef.current !== null) {
      window.clearTimeout(interactionTimerRef.current);
    }
    interactionTimerRef.current = window.setTimeout(() => {
      interactionPausedRef.current = false;
      interactionTimerRef.current = null;
    }, AUTOPLAY_PAUSE_AFTER_INTERACTION_MS);
  }, []);

  const goto = useCallback(
    (next: number, behavior: ScrollBehavior = 'smooth') => {
      const target = slideRefs.current[next];
      if (target) {
        target.scrollIntoView({ behavior, inline: 'center', block: 'nearest' });
      }
    },
    [],
  );

  // Track which slide is centered. IntersectionObserver fires
  // whenever a slide crosses the threshold of the track viewport.
  useEffect(() => {
    if (!trackRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > 0.6) {
            const idx = Number((e.target as HTMLElement).dataset.slideIndex ?? -1);
            if (idx >= 0) setActiveIndex(idx);
          }
        }
      },
      { root: trackRef.current, threshold: [0.6, 0.9] },
    );
    slideRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [slides.length]);

  // Autoplay loop. Advances every AUTOPLAY_MS, wraps from last → 0.
  // The wrap uses behavior:'auto' (instant) so the user doesn't see
  // a long backwards-scroll "rewind" between cycles — slide 5 just
  // snaps back to slide 1 between ticks. Forward advances stay
  // smooth. Skipped entirely when prefersReducedMotion.
  useEffect(() => {
    if (prefersReducedMotion) return;
    if (slides.length < 2) return;
    const id = window.setInterval(() => {
      if (interactionPausedRef.current) return;
      const current = activeIndexRef.current;
      const next = (current + 1) % slides.length;
      const isWrap = current === slides.length - 1 && next === 0;
      goto(next, isWrap ? 'auto' : 'smooth');
    }, AUTOPLAY_MS);
    return () => {
      window.clearInterval(id);
      if (interactionTimerRef.current !== null) {
        window.clearTimeout(interactionTimerRef.current);
      }
    };
  }, [slides.length, goto]);

  // Preload imageSrc assets so the slide flip doesn't flash.
  useEffect(() => {
    slides.forEach((s) => {
      if (s.imageSrc && typeof window !== 'undefined') {
        const img = new Image();
        img.src = s.imageSrc;
      }
    });
  }, [slides]);

  return (
    <div className="flex flex-col items-center w-full">
      {/* Scrollable track. The container itself is full width; each
          slide is ~82% wide with horizontal padding so the
          snap-centered slide leaves the next/prev partially visible. */}
      <div
        ref={trackRef}
        onTouchStart={markInteraction}
        onMouseDown={markInteraction}
        onWheel={markInteraction}
        className="w-full overflow-x-auto snap-x snap-mandatory flex gap-3 px-[9%] no-scrollbar"
        style={{
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {slides.map((s, i) => (
          <div
            key={s.id}
            ref={(el) => { slideRefs.current[i] = el; }}
            data-slide-index={i}
            className="snap-center shrink-0 w-[82%] flex flex-col items-center"
          >
            {/* "1 / N" header was here. Removed — the dots indicator
                below the carousel already conveys position, and the
                header was eating vertical space that pushed the dots
                off the bottom of small viewports. */}
            <div
              className="flex items-center justify-center w-full"
              style={{ height: 'min(56vh, 440px)' }}
            >
              {s.imageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.imageSrc}
                  alt={s.caption}
                  className="max-h-full max-w-full object-contain"
                  draggable={false}
                />
              ) : (
                <s.Illustration />
              )}
            </div>
            {/* Numbered step badge (SVG carousel only — see InstallSlide
                docstring). Sits directly above the caption so the three
                instructions read as 1 → 2 → 3 across the carousel. */}
            {s.stepNumber !== undefined && (
              <div
                className="mt-3 w-8 h-8 rounded-full bg-primary/15 text-primary text-sm font-bold flex items-center justify-center ring-1 ring-primary/30"
                aria-hidden
              >
                {s.stepNumber}
              </div>
            )}
            <p
              className={`text-base font-semibold text-text-primary text-center px-3 leading-snug min-h-[2.75em] ${
                s.stepNumber !== undefined ? 'mt-1.5' : 'mt-3'
              }`}
            >
              {s.caption}
            </p>
          </div>
        ))}
      </div>

      {/* Hide the native scrollbar across browsers. */}
      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {/* Dots indicator — sync to the centered slide. */}
      {slides.length > 1 && (
        <div className="flex gap-1.5 mt-3">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Go to step ${i + 1}`}
              onClick={() => {
                markInteraction();
                goto(i);
              }}
              className={`h-1.5 rounded-full transition-all ${
                i === activeIndex ? 'w-6 bg-primary' : 'w-1.5 bg-border hover:bg-text-tertiary'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Final action area below the carousel. Skip + "I added it" both
// removed per user feedback — the page-level Back button is now
// the single way to leave the carousel. This component only renders
// the Android native-prompt CTA when one is provided. On iOS this
// component is not invoked at all (the parent CarouselView gates on
// finalCta presence).
export function InstallCarouselFinalActions({
  finalCta,
}: {
  onDone: () => void;
  onSkip: () => void;
  finalCta?: {
    label: string;
    onClick: () => void | Promise<void>;
    busy?: boolean;
  };
}) {
  if (!finalCta) return null;
  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <motion.button
        type="button"
        whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
        onClick={finalCta.onClick}
        disabled={finalCta.busy}
        className="w-full max-w-md py-3.5 bg-primary text-white font-semibold rounded-2xl shadow-warm-md hover:bg-primary-dark transition-colors disabled:opacity-50"
      >
        {finalCta.busy ? t('common.loading') : finalCta.label}
      </motion.button>
    </div>
  );
}
