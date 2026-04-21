'use client';

// Onboarding step 0 — Welcome + Philosophy.
// Stoic-style typography reveal: headline fades in word by word,
// body fades in after, single CTA. Bodhi meditates in a corner.
// Language toggle sits in the top-right so users can flip EN/ES
// without leaving the step.

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Mascot from '@/components/mascot/Mascot';
import { t } from '@/lib/translations';
import { getLanguage, setLanguage, LANGUAGES, type AppLanguage } from '@/lib/language';
import { prefersReducedMotion } from '@/lib/motionVariants';

interface WelcomeStepProps {
  onContinue: () => void;
}

export default function WelcomeStep({ onContinue }: WelcomeStepProps) {
  const [lang, setLangState] = useState<AppLanguage>('en-US');
  const [revealed, setRevealed] = useState(false);

  // Resolve the stored language on mount (avoids SSR mismatch).
  useEffect(() => {
    const stored = getLanguage();
    // If nothing stored yet, try to match the browser. Default to EN.
    const autoDetect = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es')
      ? 'es-MX'
      : 'en-US';
    const resolved = stored || autoDetect;
    setLangState(resolved);
    setLanguage(resolved);
  }, []);

  // Let the typography breathe before CTA becomes tappable.
  useEffect(() => {
    const timer = window.setTimeout(() => setRevealed(true), prefersReducedMotion ? 0 : 1800);
    return () => window.clearTimeout(timer);
  }, []);

  const pickLang = (next: AppLanguage) => {
    setLangState(next);
    setLanguage(next);
    // Force a re-render of translated strings by nudging state.
    // The t() function reads fresh each call, so components re-render
    // through normal React flow — no explicit refresh needed here.
  };

  const headlineWords = useMemo(
    () => t('onboarding.welcome.headline').split(' '),
    [lang]
  );

  return (
    <div className="relative flex flex-col min-h-screen px-6 pt-10 pb-10 bg-bg overflow-hidden">
      {/* Ambient warm glow */}
      <div
        aria-hidden
        className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[70vmin] h-[70vmin] rounded-full blur-3xl pointer-events-none"
        style={{ background: 'var(--theme-primary-glow)' }}
      />

      {/* Language toggle — top right */}
      <div className="relative z-10 flex justify-end">
        <div className="flex gap-1 p-1 bg-surface/80 backdrop-blur border border-border rounded-full">
          {LANGUAGES.map((l) => {
            const active = lang === l.code;
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => pickLang(l.code)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${
                  active ? 'bg-primary text-white' : 'text-text-tertiary hover:text-text-secondary'
                }`}
                aria-label={l.label}
                aria-pressed={active}
              >
                <span className="mr-1">{l.flag}</span>
                {l.code.split('-')[0].toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto">
        {/* Bodhi meditating — anchors the tone visually */}
        <motion.div
          initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.85 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          className="mb-10"
        >
          <Mascot guide="bodhi" pose="meditate" size="lg" glow animate />
        </motion.div>

        {/* Headline — word by word reveal */}
        <motion.h1
          className="text-3xl font-semibold text-text-primary tracking-tight leading-tight mb-6"
          initial={prefersReducedMotion ? undefined : 'initial'}
          animate={prefersReducedMotion ? undefined : 'animate'}
          variants={{ animate: { transition: { staggerChildren: 0.14, delayChildren: 0.3 } } }}
          key={lang /* restart reveal if language changes */}
        >
          {headlineWords.map((word, i) => (
            <motion.span
              key={`${lang}-${i}`}
              variants={{
                initial: { opacity: 0, y: 8 },
                animate: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="inline-block mr-[0.25em]"
            >
              {word}
            </motion.span>
          ))}
        </motion.h1>

        {/* Body — fades in after headline */}
        <AnimatePresence mode="wait">
          <motion.p
            key={lang}
            initial={prefersReducedMotion ? undefined : { opacity: 0, y: 6 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: prefersReducedMotion ? 0 : 1.1, ease: 'easeOut' }}
            className="text-base text-text-secondary leading-relaxed max-w-sm mx-auto"
          >
            {t('onboarding.welcome.body')}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* CTA — slides up once reveal settles */}
      <div className="relative z-10">
        <AnimatePresence>
          {revealed && (
            <motion.button
              type="button"
              initial={prefersReducedMotion ? undefined : { opacity: 0, y: 12 }}
              animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
              onClick={onContinue}
              className="w-full max-w-md mx-auto block py-3.5 bg-primary text-white font-semibold rounded-2xl shadow-warm-md hover:bg-primary-dark transition-colors"
            >
              {t('onboarding.welcome.cta')}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
