'use client';

// Final onboarding step — ask the user's name. The chosen guide
// hosts (listen pose) so the last moment before /home feels personal.
// h-[100dvh] flex keeps the "Start Journaling" button visible on
// Safari without relying on the user scrolling.

import { motion } from 'framer-motion';
import Mascot from '@/components/mascot/Mascot';
import { getGuideOrDefault, type GuideId } from '@/lib/guideConfigs';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';

interface Props {
  guide: GuideId;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error?: string;
}

export default function NameStep({ guide, value, onChange, onSubmit, loading, error }: Props) {
  const guideCfg = getGuideOrDefault(guide);
  const canSubmit = value.trim().length > 0 && !loading;

  return (
    <div className="relative flex flex-col h-[100dvh] overflow-hidden bg-bg">
      <div
        aria-hidden
        className="absolute top-16 left-1/2 -translate-x-1/2 w-[60vmin] h-[60vmin] rounded-full blur-3xl pointer-events-none"
        style={{ background: 'var(--theme-primary-glow)' }}
      />

      <div
        className="relative z-10 flex-1 overflow-y-auto px-6 flex flex-col justify-center"
        style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))' }}
      >
        <div className="max-w-md w-full mx-auto">
          <div className="flex justify-center mb-6">
            <Mascot guide={guide} pose="listen" size="lg" glow animate />
          </div>

          <p className="text-xs text-text-tertiary text-center mb-1">{guideCfg.name}</p>
          <h2 className="text-2xl font-bold text-text-primary text-center mb-2">
            {t('onboarding.name.title')}
          </h2>
          <p className="text-sm text-text-secondary text-center mb-6">
            {t('onboarding.name.subtitle')}
          </p>

          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('onboarding.yourName')}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSubmit) onSubmit();
            }}
            className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:border-primary outline-none"
          />
          {error && <p className="text-error text-xs mt-2">{error}</p>}
        </div>
      </div>

      <div
        className="relative z-10 shrink-0 px-6 pt-2"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <motion.button
          type="button"
          whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
          onClick={onSubmit}
          disabled={!canSubmit}
          className="w-full max-w-md mx-auto block py-3.5 bg-primary text-white font-semibold rounded-2xl shadow-warm-md hover:bg-primary-dark transition-colors disabled:opacity-40"
        >
          {loading ? t('onboarding.settingUp') : t('onboarding.startJournaling')}
        </motion.button>
      </div>
    </div>
  );
}
