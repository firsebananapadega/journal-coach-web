'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { t } from '@/lib/translations';
import Mascot from '@/components/mascot/Mascot';
import { staggerContainer, staggerItem, prefersReducedMotion } from '@/lib/motionVariants';

export default function WelcomePage() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (session) router.replace('/home');
  }, [session, router]);

  const handleGoogle = async () => {
    setGoogleLoading(true);
    const result = await signInWithGoogle();
    if (result.error) setGoogleLoading(false);
  };

  const motionProps = prefersReducedMotion
    ? {}
    : { variants: staggerContainer, initial: 'initial' as const, animate: 'animate' as const };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen px-6 bg-bg overflow-hidden">
      {/* Ambient warm glow behind everything */}
      <div
        aria-hidden
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vmin] h-[60vmin] rounded-full blur-3xl pointer-events-none"
        style={{ background: 'var(--theme-primary-glow)' }}
      />

      <motion.div {...motionProps} className="max-w-sm w-full space-y-6 text-center relative z-10">
        <motion.div variants={staggerItem} className="flex justify-center">
          <motion.div
            initial={prefersReducedMotion ? undefined : { scale: 0.5, opacity: 0, y: 30 }}
            animate={prefersReducedMotion ? undefined : { scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
          >
            <Mascot guide="bodhi" pose="wave" size="xl" glow animate />
          </motion.div>
        </motion.div>

        <motion.div variants={staggerItem} className="space-y-2">
          <h1 className="text-4xl font-bold text-text-primary tracking-tight">JournalCoach</h1>
          <p className="text-text-secondary text-lg">{t('welcome.tagline')}</p>
        </motion.div>

        <motion.div variants={staggerItem} className="space-y-3 pt-2">
          <motion.button
            whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full py-3 px-6 bg-white text-gray-800 font-semibold rounded-2xl hover:bg-gray-100 transition-colors flex items-center justify-center gap-3 disabled:opacity-50 shadow-warm-md"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {googleLoading ? t('welcome.connectingGoogle') : t('welcome.continueGoogle')}
          </motion.button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-text-tertiary">{t('common.or')}</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <motion.button
            whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
            onClick={() => router.push('/auth/sign-in')}
            className="w-full py-3 px-6 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors shadow-warm-md"
          >
            {t('welcome.signInEmail')}
          </motion.button>
          <motion.button
            whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
            onClick={() => router.push('/auth/sign-up')}
            className="w-full py-3 px-6 bg-surface border border-border text-text-primary font-semibold rounded-2xl hover:bg-surface-elevated transition-colors"
          >
            {t('welcome.createAccount')}
          </motion.button>
        </motion.div>

        <motion.p
          variants={staggerItem}
          className="text-xs text-text-tertiary pt-2 whitespace-pre-line"
        >
          {t('welcome.footer')}
        </motion.p>
      </motion.div>
    </div>
  );
}
