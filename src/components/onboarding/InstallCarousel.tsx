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

export default function InstallCarousel({ slides }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const goto = useCallback((next: number) => {
    const target = slideRefs.current[next];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, []);

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
            <div className="self-end mr-1 mb-1 text-[10px] font-semibold text-text-tertiary tracking-wide">
              {i + 1} / {slides.length}
            </div>
            <div
              className="flex items-center justify-center w-full"
              style={{ height: 400 }}
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
            <p className="text-sm font-medium text-text-primary text-center mt-2 px-3 min-h-[2.5em]">
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
              onClick={() => goto(i)}
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

// Final action area below the carousel. The "I added it" CTA was
// removed per user feedback ("if I really added it, I'd open from
// the home screen — not click a button here"). On Android with a
// finalCta we still render the native-prompt button. On iOS we
// only render Skip.
export function InstallCarouselFinalActions({
  onSkip,
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
  return (
    <div className="flex flex-col items-center gap-2 w-full">
      {finalCta && (
        <motion.button
          type="button"
          whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
          onClick={finalCta.onClick}
          disabled={finalCta.busy}
          className="w-full max-w-md py-3.5 bg-primary text-white font-semibold rounded-2xl shadow-warm-md hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {finalCta.busy ? t('common.loading') : finalCta.label}
        </motion.button>
      )}
      <button
        type="button"
        onClick={onSkip}
        className="text-sm text-text-tertiary hover:text-text-secondary py-2"
      >
        {t('onboarding.install.skip')}
      </button>
    </div>
  );
}
