'use client';

// Subtle banner shown only while the device reports offline. Mounted
// once from (app)/layout.tsx so it appears across every authed page.
// Not dismissible — informational, must remain visible until reconnect.

import { motion, AnimatePresence } from 'framer-motion';
import { useOnline } from '@/lib/networkStatus';
import { prefersReducedMotion } from '@/lib/motionVariants';

export default function OfflineIndicator() {
  const online = useOnline();
  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          key="offline-banner"
          initial={prefersReducedMotion ? undefined : { y: -32, opacity: 0 }}
          animate={prefersReducedMotion ? undefined : { y: 0, opacity: 1 }}
          exit={prefersReducedMotion ? undefined : { y: -32, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="fixed inset-x-0 z-[80] flex justify-center pointer-events-none"
          style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}
          role="status"
          aria-live="polite"
        >
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-warning/15 text-warning border border-warning/30 px-3.5 py-1.5 text-xs font-semibold backdrop-blur-sm shadow-warm-sm">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
            <span>Offline — changes save locally and sync later</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
