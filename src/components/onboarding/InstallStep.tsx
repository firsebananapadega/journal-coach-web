'use client';

// Install step dispatcher — resolves platform and renders the right
// variant. The chosen guide hosts the moment via a small mascot +
// speech line above the variant content.

import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import Mascot from '@/components/mascot/Mascot';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { getGuideOrDefault, type GuideId } from '@/lib/guideConfigs';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';
import InstallIosPrimer from './InstallIosPrimer';
import InstallAndroidPrompt from './InstallAndroidPrompt';

interface Props {
  guide: GuideId;
  onInstalled: () => void;
  onSkip: () => void;
}

export default function InstallStep({ guide, onInstalled, onSkip }: Props) {
  const { platform } = usePwaInstall();
  const guideCfg = useMemo(() => getGuideOrDefault(guide), [guide]);

  // Auto-advance if the platform is desktop or already installed —
  // nothing meaningful to ask. Marks as skipped silently.
  useEffect(() => {
    if (platform === 'installed' || platform === 'desktop') {
      const id = window.setTimeout(onSkip, 350);
      return () => window.clearTimeout(id);
    }
  }, [platform, onSkip]);

  if (platform === 'installed' || platform === 'desktop') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Mascot guide={guide} pose="celebrate" size="md" animate />
        <p className="text-sm text-text-secondary">{t('onboarding.install.installed')}</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col min-h-screen px-6 pt-10 pb-8 bg-bg overflow-hidden">
      <div
        aria-hidden
        className="absolute top-24 left-1/2 -translate-x-1/2 w-[60vmin] h-[60vmin] rounded-full blur-3xl pointer-events-none"
        style={{ background: 'var(--theme-primary-glow)' }}
      />

      <div className="relative z-10 max-w-md w-full mx-auto flex-1 flex flex-col">
        {/* Guide + teaser line */}
        <div className="flex items-start gap-3 mb-4">
          <div style={{ width: 56, height: 56 }} className="shrink-0">
            <Mascot guide={guide} pose="wave" size="sm" animate />
          </div>
          <div className="flex-1 pt-1">
            <p className="text-xs text-text-tertiary mb-1">{guideCfg.name}</p>
            <p className="text-sm text-text-primary leading-snug">
              {t('onboarding.install.teaser')}
            </p>
          </div>
        </div>

        {platform === 'ios' && (
          <>
            <h2 className="text-lg font-bold text-text-primary text-center mb-1">
              {t('onboarding.install.iosTitle')}
            </h2>
            <p className="text-sm text-text-secondary text-center mb-4">
              {t('onboarding.install.iosBody')}
            </p>
            <InstallIosPrimer />
          </>
        )}

        {platform === 'android' && (
          <div className="flex-1 flex items-center">
            <InstallAndroidPrompt onInstalled={onInstalled} onSkip={onSkip} />
          </div>
        )}
      </div>

      {/* Action row — iOS only (Android has its own buttons in the variant) */}
      {platform === 'ios' && (
        <div className="relative z-10 flex flex-col items-center gap-2 mt-2">
          <motion.button
            type="button"
            whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
            onClick={onInstalled}
            className="w-full max-w-md py-3.5 bg-primary text-white font-semibold rounded-2xl shadow-warm-md hover:bg-primary-dark transition-colors"
          >
            {t('onboarding.install.added')}
          </motion.button>
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-text-tertiary hover:text-text-secondary py-1"
          >
            {t('onboarding.install.skip')}
          </button>
        </div>
      )}
    </div>
  );
}
