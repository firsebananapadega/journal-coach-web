'use client';

// Generic horizontal carousel for the install walkthrough.
// Renders one slide at a time, swipeable left/right via Framer drag,
// with dot indicators + back/next chevrons + an "I added it" final CTA.
//
// Slide shape:
//   { id, Illustration: React.FC, caption, imageSrc? }
// If a slide provides imageSrc, that image is shown instead of the
// Illustration component — makes it trivial for the user to drop in
// real PNG screenshots later.

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
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
  // Optional action button shown on the final slide (used by the
  // Android "prompt" variant, which overrides the "I added it"
  // flow with a real native prompt trigger).
  finalCta?: {
    label: string;
    onClick: () => void | Promise<void>;
    busy?: boolean;
  };
}

const SWIPE_THRESHOLD = 60;

export default function InstallCarousel({ slides, onDone, onSkip, finalCta }: Props) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  const last = slides.length - 1;
  const active = slides[Math.min(index, last)];

  const goto = useCallback(
    (next: number) => {
      if (next < 0 || next > last) return;
      setDirection(next > index ? 1 : -1);
      setIndex(next);
    },
    [index, last]
  );

  const onDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_THRESHOLD) goto(Math.min(index + 1, last));
    else if (info.offset.x > SWIPE_THRESHOLD) goto(Math.max(index - 1, 0));
  };

  // Preload imageSrc assets so the slide flip doesn't flash.
  useEffect(() => {
    slides.forEach((s) => {
      if (s.imageSrc && typeof window !== 'undefined') {
        const img = new Image();
        img.src = s.imageSrc;
      }
    });
  }, [slides]);

  const isLast = index === last;
  const Illustration = active.Illustration;

  return (
    <div className="flex flex-col items-center w-full">
      {/* Slide viewport */}
      <div className="relative w-full max-w-[260px] overflow-hidden" style={{ height: 460 }}>
        <AnimatePresence custom={direction} initial={false} mode="wait">
          <motion.div
            key={active.id}
            custom={direction}
            drag={slides.length > 1 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={onDragEnd}
            initial={prefersReducedMotion ? undefined : { x: direction > 0 ? 80 : -80, opacity: 0 }}
            animate={prefersReducedMotion ? undefined : { x: 0, opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { x: direction > 0 ? -80 : 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="absolute inset-0 flex flex-col items-center"
          >
            {/* Step badge top-right */}
            <div className="self-end mr-1 mb-1 text-[10px] font-semibold text-text-tertiary tracking-wide">
              {index + 1} / {slides.length}
            </div>
            {/* Illustration or user-provided image */}
            <div className="flex items-center justify-center" style={{ height: 400, width: '100%' }}>
              {active.imageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={active.imageSrc}
                  alt={active.caption}
                  className="max-h-full max-w-full object-contain"
                  draggable={false}
                />
              ) : (
                <Illustration />
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Caption */}
      <AnimatePresence mode="wait">
        <motion.p
          key={active.id}
          initial={prefersReducedMotion ? undefined : { opacity: 0, y: 4 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
          className="text-sm font-medium text-text-primary text-center mt-2 px-3"
        >
          {active.caption}
        </motion.p>
      </AnimatePresence>

      {/* Dots indicator */}
      {slides.length > 1 && (
        <div className="flex gap-1.5 mt-3">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Go to step ${i + 1}`}
              onClick={() => goto(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-6 bg-primary' : 'w-1.5 bg-border hover:bg-text-tertiary'
              }`}
            />
          ))}
        </div>
      )}

      {/* Nav buttons inline (chevrons) — only when not on terminal slide */}
      {slides.length > 1 && !isLast && (
        <div className="flex items-center gap-4 mt-4">
          <button
            type="button"
            onClick={() => goto(index - 1)}
            disabled={index === 0}
            className="text-xs text-text-tertiary hover:text-text-secondary disabled:opacity-30"
          >
            ← {t('common.back')}
          </button>
          <button
            type="button"
            onClick={() => goto(index + 1)}
            className="text-xs font-semibold text-primary hover:text-primary-dark"
          >
            {t('common.next')} →
          </button>
        </div>
      )}
    </div>
  );
}

// Re-export for InstallStep to render the final action area.
// Kept at module level to make the InstallStep dispatcher simpler.
export function InstallCarouselFinalActions({
  onDone,
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
      {finalCta ? (
        <motion.button
          type="button"
          whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
          onClick={finalCta.onClick}
          disabled={finalCta.busy}
          className="w-full max-w-md py-3.5 bg-primary text-white font-semibold rounded-2xl shadow-warm-md hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {finalCta.busy ? t('common.loading') : finalCta.label}
        </motion.button>
      ) : (
        <motion.button
          type="button"
          whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
          onClick={onDone}
          className="w-full max-w-md py-3.5 bg-primary text-white font-semibold rounded-2xl shadow-warm-md hover:bg-primary-dark transition-colors"
        >
          {t('onboarding.install.added')}
        </motion.button>
      )}
      <button
        type="button"
        onClick={onSkip}
        className="text-xs text-text-tertiary hover:text-text-secondary py-1"
      >
        {t('onboarding.install.skip')}
      </button>
    </div>
  );
}
