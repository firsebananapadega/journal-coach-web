'use client';

// Install step dispatcher — resolves platform + renders the right
// carousel variant, narrated by the chosen guide.
//
//   installed / desktop  → auto-skip (nothing meaningful to ask).
//   ios                  → 3-slide carousel (Safari → share sheet → Add)
//                          with "I added it" CTA.
//   android + canPrompt  → single slide showing native prompt
//                          preview, CTA fires beforeinstallprompt.
//   android − canPrompt  → 2-slide carousel (menu → Install app)
//                          with "I added it" CTA.

import { useEffect, useMemo } from 'react';
import Mascot from '@/components/mascot/Mascot';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { getGuideOrDefault, type GuideId } from '@/lib/guideConfigs';
import { t } from '@/lib/translations';
import InstallCarousel, { InstallCarouselFinalActions, type InstallSlide } from './InstallCarousel';
import { getIosSlides } from './InstallIosSlides';
import { getAndroidPromptSlides, getAndroidManualSlides } from './InstallAndroidSlides';

interface Props {
  guide: GuideId;
  onInstalled: () => void;
  onSkip: () => void;
}

export default function InstallStep({ guide, onInstalled, onSkip }: Props) {
  const { platform, canPrompt, promptInstall } = usePwaInstall();
  const guideCfg = useMemo(() => getGuideOrDefault(guide), [guide]);

  // Auto-skip desktop / already-installed — no useful UI here.
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
        className="absolute top-24 left-1/2 -translate-x-1/2 w-[60vmin] h-[60vmin] rounded-full blur-3xl pointer-events-none"
        style={{ background: 'var(--theme-primary-glow)' }}
      />

      <div
        className="relative z-10 flex-1 overflow-y-auto px-6"
        style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}
      >
        <div className="max-w-md w-full mx-auto">
          {/* Guide + teaser line */}
          <div className="flex items-start gap-3 mb-3">
            <div style={{ width: 48, height: 48 }} className="shrink-0">
              <Mascot guide={guide} pose="wave" size="sm" animate />
            </div>
            <div className="flex-1 pt-1">
              <p className="text-[11px] text-text-tertiary mb-0.5">{guideCfg.name}</p>
              <p className="text-sm text-text-primary leading-snug">
                {t('onboarding.install.teaser')}
              </p>
            </div>
          </div>

          <h2 className="text-lg font-bold text-text-primary text-center mb-1">
            {platform === 'ios'
              ? t('onboarding.install.iosTitle')
              : t('onboarding.install.androidTitle')}
          </h2>
          <p className="text-xs text-text-secondary text-center mb-4">
            {platform === 'ios'
              ? t('onboarding.install.iosBody')
              : t('onboarding.install.androidBody')}
          </p>

          <InstallCarousel slides={slides} onDone={onInstalled} onSkip={onSkip} />
        </div>
      </div>

      <div
        className="relative z-10 shrink-0 px-6 pt-2"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-md mx-auto">
          <InstallCarouselFinalActions onDone={onInstalled} onSkip={onSkip} finalCta={finalCta} />
        </div>
      </div>
    </div>
  );
}
