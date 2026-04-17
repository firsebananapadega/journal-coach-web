'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { t } from '@/lib/translations';
import NavIcon from '@/components/ui/NavIcon';
import { prefersReducedMotion } from '@/lib/motionVariants';

const NAV_ITEMS: { href: string; key: string; icon: 'home' | 'target' | 'calendar' | 'book' | 'gear' }[] = [
  { href: '/home', key: 'nav.home', icon: 'home' },
  { href: '/priorities', key: 'nav.tasks', icon: 'target' },
  { href: '/plans', key: 'nav.plans', icon: 'calendar' },
  { href: '/journal', key: 'nav.journal', icon: 'book' },
  { href: '/settings', key: 'nav.settings', icon: 'gear' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useAuthStore((s) => s.session);
  const initialized = useAuthStore((s) => s.initialized);

  useEffect(() => {
    if (initialized && !session) {
      router.replace('/auth/welcome');
    }
  }, [initialized, session, router]);

  if (!initialized || !session) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
          <span className="text-xs text-text-tertiary">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  // Hide bottom nav on full-screen pages (guided, voice, write, template, entry detail)
  const hideNav = ['/guided', '/voice', '/write', '/habits', '/intentions', '/templates'].includes(pathname) ||
    pathname.startsWith('/template/') || pathname.startsWith('/entry/');

  return (
    <div className="flex flex-col min-h-screen bg-bg">
      <main className={`flex-1 ${hideNav ? '' : 'pb-36'}`}>{children}</main>

      {!hideNav && (
        <nav className="fixed bottom-0 inset-x-0 glass-card z-50">
          <div className="max-w-lg mx-auto flex items-center justify-around pt-2 pb-[max(2.25rem,env(safe-area-inset-bottom))]">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} className="relative flex flex-col items-center gap-1 px-3 py-1">
                  <motion.div
                    whileTap={!prefersReducedMotion ? { scale: 0.85 } : undefined}
                    className={isActive ? 'text-primary' : 'text-text-tertiary'}
                  >
                    <NavIcon name={item.icon} active={isActive} />
                  </motion.div>
                  <span className={`text-[10px] font-medium ${isActive ? 'text-primary' : 'text-text-tertiary'}`}>
                    {t(item.key)}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="navIndicator"
                      className="absolute -top-0.5 w-5 h-0.5 bg-primary rounded-full"
                      transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
