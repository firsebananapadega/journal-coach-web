'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import Link from 'next/link';

const NAV_ITEMS = [
  { href: '/home', label: 'Home', icon: '🏠' },
  { href: '/priorities', label: 'Priorities', icon: '🎯' },
  { href: '/journal', label: 'Journal', icon: '📖' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
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
        <div className="animate-pulse text-primary">Loading...</div>
      </div>
    );
  }

  // Hide bottom nav on full-screen pages (guided, voice, write, template, entry detail)
  const hideNav = ['/guided', '/voice', '/write'].includes(pathname) ||
    pathname.startsWith('/template/') || pathname.startsWith('/entry/');

  return (
    <div className="flex flex-col min-h-screen bg-bg">
      <main className={`flex-1 ${hideNav ? '' : 'pb-20'}`}>{children}</main>

      {!hideNav && (
        <nav className="fixed bottom-0 inset-x-0 bg-surface border-t border-border z-50">
          <div className="max-w-lg mx-auto flex items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-4 py-1 ${
                  pathname === item.href ? 'text-primary' : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="text-[11px] font-semibold">{item.label}</span>
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
