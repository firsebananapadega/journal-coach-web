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

  return (
    <div className="flex flex-col min-h-screen bg-bg">
      {/* Main content */}
      <main className="flex-1 pb-20">{children}</main>

      {/* Bottom nav — mobile-first, fixed */}
      <nav className="fixed bottom-0 inset-x-0 bg-surface border-t border-border z-50">
        <div className="max-w-lg mx-auto flex items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {NAV_ITEMS.slice(0, 2).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 ${
                pathname === item.href ? 'text-primary' : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-[11px] font-semibold">{item.label}</span>
            </Link>
          ))}

          {/* Center FAB — mic button */}
          <Link
            href="/guided"
            className="flex items-center justify-center w-14 h-14 -mt-6 bg-primary rounded-full shadow-lg shadow-primary/30 hover:bg-primary-dark transition-colors"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </Link>

          {NAV_ITEMS.slice(2).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 ${
                pathname === item.href ? 'text-primary' : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-[11px] font-semibold">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
