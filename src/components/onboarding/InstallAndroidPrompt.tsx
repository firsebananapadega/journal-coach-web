'use client';

// Android install card — wraps the browser's deferred install prompt.
// If beforeinstallprompt has been captured, we fire it on tap.
// If not (user opened the page from a context that hasn't met PWA
// criteria yet), we fall back to text guidance + skip.

import { useState } from 'react';
import { motion } from 'framer-motion';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';

interface Props {
  onInstalled: () => void;
  onSkip: () => void;
}

export default function InstallAndroidPrompt({ onInstalled, onSkip }: Props) {
  const { canPrompt, promptInstall } = usePwaInstall();
  const [busy, setBusy] = useState(false);

  const handleInstall = async () => {
    if (!canPrompt) return;
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    if (outcome === 'accepted') onInstalled();
    // If dismissed, stay on the step — user can tap Skip to continue.
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <h2 className="text-xl font-bold text-text-primary text-center">
        {t('onboarding.install.androidTitle')}
      </h2>
      <p className="text-sm text-text-secondary text-center max-w-sm">
        {t('onboarding.install.androidBody')}
      </p>

      {/* Large visual target — a chip that feels tappable */}
      <motion.button
        type="button"
        whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
        onClick={handleInstall}
        disabled={!canPrompt || busy}
        className="w-full max-w-sm py-3.5 bg-primary text-white font-semibold rounded-2xl shadow-warm-md hover:bg-primary-dark transition-colors disabled:opacity-50"
      >
        {busy ? t('common.loading') : t('onboarding.install.androidCta')}
      </motion.button>

      <button
        type="button"
        onClick={onSkip}
        className="text-xs text-text-tertiary hover:text-text-secondary"
      >
        {t('onboarding.install.skip')}
      </button>
    </div>
  );
}
