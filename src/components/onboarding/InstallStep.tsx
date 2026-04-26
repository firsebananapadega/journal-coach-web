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

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Mascot from '@/components/mascot/Mascot';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { type GuideId } from '@/lib/guideConfigs';
import { t } from '@/lib/translations';
import InstallCarousel, { InstallCarouselFinalActions, type InstallSlide } from './InstallCarousel';
import { getIosSlides } from './InstallIosSlides';
import { getAndroidPromptSlides, getAndroidManualSlides } from './InstallAndroidSlides';
import { prefersReducedMotion } from '@/lib/motionVariants';

interface Props {
  guide: GuideId;
  onInstalled: () => void;
  onSkip: () => void;
}

export default function InstallStep({ guide, onInstalled, onSkip }: Props) {
  const { platform, canPrompt, promptInstall } = usePwaInstall();
  const [view, setView] = useState<'overview' | 'carousel'>('overview');

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
  let slides: InstallSlide[] = [];
  let finalCta: { label: string; onClick: () => Promise<void>; busy?: boolean } | undefined;

  if (platform === 'ios') {
    slides = getIosSlides();
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
          onBack={() => setView('overview')}
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
  platform: 'ios' | 'android' | 'desktop' | 'installed';
  onShowCarousel: () => void;
  onSkip: () => void;
}) {
  const steps =
    platform === 'ios'
      ? [
          'Tap the Share button at the bottom of Safari.',
          'Choose "Add to Home Screen" from the share menu.',
          'Tap "Add" — done.',
        ]
      : [
          'Open the Chrome menu (⋮ in the top-right).',
          'Choose "Install app" or "Add to Home screen."',
          'Tap "Install" — done.',
        ];

  return (
    <div
      className="relative z-10 flex-1 flex flex-col px-6"
      style={{ paddingTop: 'max(3.5rem, env(safe-area-inset-top))' }}
    >
      <div className="max-w-md w-full mx-auto flex-1 flex flex-col">
        <h1 className="text-3xl font-bold text-text-primary text-center leading-tight">
          Add me to your home screen
        </h1>
        <p className="text-base text-text-secondary text-center mt-3 mb-8 leading-snug">
          Just three easy steps — feels like a real app, opens
          instantly, and your reminders work better.
        </p>

        <ol className="space-y-4 mb-8">
          {steps.map((step, i) => (
            <li
              key={i}
              className="flex items-start gap-4 bg-surface/70 backdrop-blur border border-border rounded-2xl p-4"
            >
              <span className="flex-shrink-0 w-9 h-9 rounded-full bg-primary/15 text-primary text-base font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <p className="text-sm text-text-primary leading-relaxed pt-1.5">{step}</p>
            </li>
          ))}
        </ol>

        <div className="flex-1" />

        <div
          className="space-y-2"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
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
  onBack,
  onInstalled,
  onSkip,
  finalCta,
}: {
  slides: InstallSlide[];
  onBack: () => void;
  onInstalled: () => void;
  onSkip: () => void;
  finalCta?: { label: string; onClick: () => Promise<void>; busy?: boolean };
}) {
  return (
    <>
      <div
        className="relative z-10 flex-1 overflow-y-auto px-6"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <div className="max-w-md w-full mx-auto">
          <button
            type="button"
            onClick={onBack}
            className="mb-3 text-sm text-text-tertiary hover:text-text-secondary inline-flex items-center gap-1"
            aria-label="Back to overview"
          >
            <span aria-hidden>←</span>
            <span>Back</span>
          </button>
          <InstallCarousel slides={slides} onDone={onInstalled} onSkip={onSkip} />
        </div>
      </div>

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
    </>
  );
}
