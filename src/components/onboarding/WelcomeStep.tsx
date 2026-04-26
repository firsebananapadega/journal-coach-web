'use client';

// Onboarding step 0 — Welcome + Philosophy.
// Stoic-style typography reveal: headline fades in word by word,
// body fades in after, single CTA. Bodhi meditates above.
// Language toggle sits in the top-right so users can flip EN/ES
// without leaving the step.
//
// Layout uses h-[100dvh] flex-column with content overflow-y-auto
// and a bottom-pinned CTA so Safari chrome never hides the button.

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

  useEffect(() => {
    const stored = getLanguage();
    const autoDetect = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es')
      ? 'es-MX'
      : 'en-US';
    const resolved = stored || autoDetect;
    setLangState(resolved);
    setLanguage(resolved);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setRevealed(true), prefersReducedMotion ? 0 : 1600);
    return () => window.clearTimeout(timer);
  }, []);

  const pickLang = (next: AppLanguage) => {
    setLangState(next);
    setLanguage(next);
  };

  const headlineWords = useMemo(
    () => t('onboarding.welcome.headline').split(' '),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang]
  );

  return (
    <div className="relative flex flex-col h-[100dvh] overflow-hidden bg-bg">
      {/* Ambient warm glow */}
      <div
        aria-hidden
        className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[70vmin] h-[70vmin] rounded-full blur-3xl pointer-events-none"
        style={{ background: 'var(--theme-primary-glow)' }}
      />

      {/* Language toggle — centered prominently above the welcome
          card. Bigger than a corner pill so first-time users from
          either language see it immediately and feel invited to
          flip. Flipping here writes localStorage; the language is
          then persisted to the profile when onboarding completes. */}
      <div
        className="relative z-10 flex justify-center px-6 pt-4"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <div
          role="group"
          aria-label="Language"
          className="flex gap-1 p-1 bg-surface/80 backdrop-blur border border-border rounded-full shadow-warm-sm"
        >
          {LANGUAGES.map((l) => {
            const active = lang === l.code;
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => pickLang(l.code)}
                className={`text-sm font-semibold px-5 py-2 rounded-full transition-colors ${
                  active
                    ? 'bg-primary text-white shadow-warm-sm'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
                aria-label={l.label}
                aria-pressed={active}
              >
                <span className="mr-1.5 text-base">{l.flag}</span>
                <span>{l.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content — scrolls if too tall for tiny viewports */}
      <div className="relative z-10 flex-1 overflow-y-auto px-6 flex flex-col items-center justify-center text-center">
        <motion.div
          initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.85 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8"
        >
          <Mascot guide="bodhi" pose="meditate" size="lg" glow animate />
        </motion.div>

        <motion.h1
          className="text-3xl font-semibold text-text-primary tracking-tight leading-tight mb-5 max-w-[22ch]"
          initial={prefersReducedMotion ? undefined : 'initial'}
          animate={prefersReducedMotion ? undefined : 'animate'}
          variants={{ animate: { transition: { staggerChildren: 0.12, delayChildren: 0.25 } } }}
          key={lang}
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

        <AnimatePresence mode="wait">
          <motion.p
            key={lang}
            initial={prefersReducedMotion ? undefined : { opacity: 0, y: 6 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: prefersReducedMotion ? 0 : 1.0, ease: 'easeOut' }}
            className="text-base text-text-secondary leading-relaxed max-w-sm"
          >
            {t('onboarding.welcome.body')}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* CTA — pinned to bottom with safe area */}
      <div
        className="relative z-10 shrink-0 px-6 pt-2"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <AnimatePresence>
          {revealed && (
            <motion.button
              type="button"
              initial={prefersReducedMotion ? undefined : { opacity: 0, y: 10 }}
              animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
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
