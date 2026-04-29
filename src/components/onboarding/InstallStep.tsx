'use client';

// Install step dispatcher — two-view flow per platform:
//
//   1. Overview ("Add me to your home screen in 3 easy steps")
//      Shown first. Compact list, no carousel — fits on a single
//      screen so the user doesn't have to scroll to know there's
//      content below.
//      Actions:
//        "I will add it now" → switches to carousel view
//        "Skip for now"      → onSkip
//
//   2. Carousel (visual walkthrough)
//      Shows the existing per-step illustrations. Has a Back button
//      that returns to the overview. Final CTA confirms install.
//
//   installed / desktop  → auto-skip (nothing meaningful to ask).
//   ios                  → 3-slide carousel (Safari → share sheet → Add)
//   android + canPrompt  → single slide showing native prompt
//                          preview, CTA fires beforeinstallprompt.
//   android − canPrompt  → 2-slide carousel (menu → Install app)

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Mascot from '@/components/mascot/Mascot';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { type GuideId } from '@/lib/guideConfigs';
import { t } from '@/lib/translations';
import InstallCarousel, { InstallCarouselFinalActions, type InstallSlide } from './InstallCarousel';
import { getIosSlides } from './InstallIosSlides';
import { getSvgIosSlides } from './InstallSvgSlides';
import { getAndroidPromptSlides, getAndroidManualSlides } from './InstallAndroidSlides';
import { prefersReducedMotion } from '@/lib/motionVariants';

interface Props {
  guide: GuideId;
  onInstalled: () => void;
  onSkip: () => void;
  /** Sub-view of the install step. Lifted to the parent so the
   *  page-level Back button can flip carousel → overview without
   *  exiting the step entirely. When omitted, the step manages
   *  its own state (legacy fallback). */
  view?: 'overview' | 'carousel';
  onViewChange?: (next: 'overview' | 'carousel') => void;
}

export default function InstallStep({ guide, onInstalled, onSkip, view: viewProp, onViewChange }: Props) {
  const { platform, canPrompt, promptInstall } = usePwaInstall();
  const [internalView, setInternalView] = useState<'overview' | 'carousel'>('overview');
  const view = viewProp ?? internalView;
  const setView = onViewChange ?? setInternalView;

  // Auto-skip desktop / already-installed — no useful UI here. The
  // user explicitly asked for the install step to NOT show when the
  // PWA is already present.
  useEffect(() => {
    if (platform === 'installed' || platform === 'desktop') {
      const id = window.setTimeout(onSkip, 350);
      return () => window.clearTimeout(id);
    }
  }, [platform, onSkip]);

  if (platform === 'installed' || platform === 'desktop') {
    return (
      <div className="flex flex-col h-[100dvh] items-center justify-center gap-3 bg-bg">
        <Mascot guide={guide} pose="celebrate" size="md" animate />
        <p className="text-sm text-text-secondary">{t('onboarding.install.installed')}</p>
      </div>
    );
  }

  // Compose slides + optional finalCta by platform.
  //
  // iosSafari → photoreal Safari screenshots (5 slides) — the chrome
  //             matches the user's actual browser pixel-for-pixel.
  // iosOther  → SVG carousel (3 slides) — chrome is abstract because
  //             Chrome / DDG / Firefox / Edge each draw their own
  //             toolbar; the iOS share sheet underneath is the same.
  // android   → unchanged native-prompt or manual flow.
  let slides: InstallSlide[] = [];
  let finalCta: { label: string; onClick: () => Promise<void>; busy?: boolean } | undefined;

  if (platform === 'iosSafari') {
    slides = getIosSlides();
  } else if (platform === 'iosOther') {
    slides = getSvgIosSlides();
  } else if (platform === 'android') {
    if (canPrompt) {
      slides = getAndroidPromptSlides();
      finalCta = {
        label: t('onboarding.install.androidCta'),
        onClick: async () => {
          const outcome = await promptInstall();
          if (outcome === 'accepted') onInstalled();
          // If dismissed, user can still tap Skip.
        },
      };
    } else {
      slides = getAndroidManualSlides();
    }
  }

  return (
    <div className="relative flex flex-col h-[100dvh] overflow-hidden bg-bg">
      <div
        aria-hidden
        className="absolute top-24 left-1/2 -translate-x-1/2 w-[60vmin] h-[60vmin] rounded-full blur-3xl pointer-events-none opacity-60"
        style={{ background: 'var(--theme-primary-glow)' }}
      />

      {view === 'overview' ? (
        <OverviewView
          platform={platform}
          onShowCarousel={() => setView('carousel')}
          onSkip={onSkip}
        />
      ) : (
        <CarouselView
          slides={slides}
          onInstalled={onInstalled}
          onSkip={onSkip}
          finalCta={finalCta}
        />
      )}
    </div>
  );
}

// ─── Overview view ──────────────────────────────────────────────
// Compact 3-step list. No carousel, no scrolling required on a
// standard phone viewport. Removes the previous mascot+teaser line
// per user feedback ("I didn't even read it at first glance").

function OverviewView({
  platform,
  onShowCarousel,
  onSkip,
}: {
  platform: 'iosSafari' | 'iosOther' | 'android' | 'desktop' | 'installed';
  onShowCarousel: () => void;
  onSkip: () => void;
}) {
  // Per-platform 3-step overview. The carousel that follows walks
  // every actual tap; here we keep the summary at 3 conceptual
  // actions for psychological simplicity.
  //   iosSafari → mention the Safari ••• menu specifically.
  //   iosOther  → say "share icon in your browser toolbar" — covers
  //               Chrome / DDG / Firefox / Edge whose share buttons
  //               sit in different places (top-right vs bottom-bar).
  //   android   → Chrome menu language.
  const steps =
    platform === 'iosSafari'
      ? [
          'Open Safari’s menu (•••) at the bottom right.',
          'Tap Share, then "Add to Home Screen."',
          'Tap "Add" — done.',
        ]
      : platform === 'iosOther'
      ? [
          t('onboarding.install.iosOtherOverview1'),
          t('onboarding.install.iosOtherOverview2'),
          t('onboarding.install.iosOtherOverview3'),
        ]
      : [
          'Open the Chrome menu (⋮ in the top-right).',
          'Choose "Install app" or "Add to Home screen."',
          'Tap "Install" — done.',
        ];

  // Layout strategy:
  //   - Outer column reserves explicit space for the title block,
  //     the steps list (scrollable on tiny viewports), and a pinned
  //     button area at the bottom.
  //   - `shrink-0` on the button area guarantees the Skip button is
  //     never clipped, regardless of viewport height. Prior bug:
  //     the buttons sat below a flex-1 spacer, so on shorter phones
  //     (iPhone SE / 13 mini) the Skip text was visually cut off.
  //   - `min-h-0` on the scroll region lets it actually scroll
  //     instead of pushing the buttons off-screen.
  // paddingTop note: the page-level Back button sits at top:12 +
  // py-2 (~36px) ≈ 48px below the safe-area inset. The PRIOR code
  // used `max(2.75rem, env(safe-area-inset-top))` which picks the
  // larger of the two — that does NOT clear the back button on
  // notched iPhones (safe-area is ~47px, back button bottom is at
  // ~95px). Using calc(safe-area + 5rem) sits the title 80px below
  // the safe area inset, comfortably below the back button.
  return (
    <div
      className="relative z-10 flex-1 flex flex-col px-6 min-h-0"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 5rem)' }}
    >
      <div className="max-w-md w-full mx-auto flex-1 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto pb-2">
          <h1 className="text-[26px] sm:text-3xl font-bold text-text-primary text-center leading-tight">
            Add me to your home screen
          </h1>
          <p className="text-[15px] text-text-secondary text-center mt-2 mb-7 leading-snug">
            Just three easy steps — feels like a real app, opens
            instantly, and your reminders work better.
          </p>

          {/* Vertically stacked, centered steps. No card containers
              (they read as tappable buttons but aren't). Numbered
              circle on top, single line of explanatory text below. */}
          <ol className="space-y-6">
            {steps.map((step, i) => (
              <li key={i} className="flex flex-col items-center text-center">
                <span className="w-10 h-10 rounded-full bg-primary/15 text-primary text-base font-bold flex items-center justify-center mb-2 ring-1 ring-primary/30">
                  {i + 1}
                </span>
                <p className="text-[14.5px] text-text-primary leading-relaxed max-w-[18rem]">
                  {step}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <div
          className="shrink-0 space-y-2 pt-3"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <motion.button
            whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
            onClick={onShowCarousel}
            className="w-full py-3.5 bg-primary text-white text-base font-semibold rounded-2xl shadow-warm-md"
          >
            I&rsquo;ll add it now
          </motion.button>
          <button
            type="button"
            onClick={onSkip}
            className="w-full py-2.5 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Carousel view ──────────────────────────────────────────────
// Visual walkthrough using the existing iOS/Android slides. Adds a
// Back button at the top so the user can return to the overview.

function CarouselView({
  slides,
  onInstalled,
  onSkip,
  finalCta,
}: {
  slides: InstallSlide[];
  onInstalled: () => void;
  onSkip: () => void;
  finalCta?: { label: string; onClick: () => Promise<void>; busy?: boolean };
}) {
  // No in-view Back button and no Skip button — the page-level Back
  // at top:left is the single affordance to leave this view. Per
  // user feedback: Skip on the carousel was redundant noise; if you
  // really want to skip, hit Back to return to the overview where
  // Skip lives. The bottom action area is now ONLY rendered when an
  // Android-style finalCta exists (the native install prompt button).
  return (
    <>
      <div
        className="relative z-10 flex-1 overflow-y-auto px-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 4rem)' }}
      >
        <div className="w-full">
          <InstallCarousel slides={slides} onDone={onInstalled} onSkip={onSkip} />
        </div>
      </div>

      {finalCta && (
        <div
          className="relative z-10 shrink-0 px-6 pt-2"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        >
          <div className="max-w-md mx-auto">
            <InstallCarouselFinalActions
              onDone={onInstalled}
              onSkip={onSkip}
              finalCta={finalCta}
            />
          </div>
        </div>
      )}
    </>
  );
}
