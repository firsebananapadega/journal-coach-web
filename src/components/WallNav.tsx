'use client';

// Bottom nav, wall-aware. Center slot (index 2 or 3 depending on wall
// size) is a raised primary-action button — 🎤 on the Tasks wall,
// 📖 on the Journal wall (opens the writing surface). Wall-flip is
// handled by the Wall Edge Tab (right edge); this component is only
// in-wall navigation.

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useWallState, tabForPath } from '@/lib/wallState';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';

interface NavSlot {
  href?: string;
  key: string;
  labelKey: string;
  // Center slot uses a raised pill style + custom icon.
  isCenter?: boolean;
}

// SVG icons inline so we don't depend on the existing NavIcon's icon
// set (which doesn't include mic or chat). Stroke-based, 24px.
// Open-book glyph — used for the Notebooks tab pill (small line icon)
// and, at larger sizes, anywhere a "reading / shelf of entries" affordance
// is needed. Symmetrical spine with two pages; the short horizontal
// strokes double as "lines of text."
function BookIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H12v17H6.5A2.5 2.5 0 0 1 4 16.5v-12Z" />
      <path d="M20 4.5A2.5 2.5 0 0 0 17.5 2H12v17h5.5A2.5 2.5 0 0 0 20 16.5v-12Z" />
      <line x1="7" y1="7" x2="9.5" y2="7" opacity="0.7" />
      <line x1="7" y1="10" x2="9.5" y2="10" opacity="0.7" />
      <line x1="14.5" y1="7" x2="17" y2="7" opacity="0.7" />
      <line x1="14.5" y1="10" x2="17" y2="10" opacity="0.7" />
    </svg>
  );
}

// Pencil-on-book glyph for the Journal center pill — reading icons
// read "Notebooks" (shelf / reference) while writing icons read
// "Journal" (the act of capturing). A closed journal with a pencil
// resting diagonally across it says "open this to write" at a glance.
function PencilBookIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* Closed journal — soft-rounded rectangle with a spine strap */}
      <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2h9A2.5 2.5 0 0 1 19 4.5v15A2.5 2.5 0 0 1 16.5 22h-9A2.5 2.5 0 0 1 5 19.5v-15Z" />
      <line x1="8" y1="6.5" x2="14" y2="6.5" opacity="0.55" />
      <line x1="8" y1="10" x2="13" y2="10" opacity="0.55" />
      {/* Pencil — tip lower-left, eraser upper-right, resting across the journal */}
      <path d="M15.5 12.5l4-4 2 2-4 4" />
      <path d="M15.5 12.5l-1.6 3.8 3.8-1.6" />
      <line x1="18" y1="10" x2="20" y2="12" opacity="0.55" />
    </svg>
  );
}

// Simple line icons for tab pills. Tracking style with the existing
// NavIcon set so it doesn't feel jarring next to the rest of the app.
function TabIcon({ name, size = 20 }: { name: string; size?: number }) {
  switch (name) {
    case 'today':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <circle cx="12" cy="15" r="1.5" fill="currentColor" />
        </svg>
      );
    case 'lists':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'upcoming':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <circle cx="8" cy="14" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" />
          <circle cx="16" cy="14" r="1" fill="currentColor" stroke="none" />
          <circle cx="8" cy="18" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'groceries':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
      );
    case 'pulse':
      // Concentric ripple — visual metaphor for the throughout-the-day
      // check-in surface (morning + mid-day Presence + evening). Each
      // ring is one of the three vital signs. Replaces the previous
      // pulse-line glyph (kept commented for revert).
      // Old pulse-line glyph (kept for one-line revert if desired):
      //   <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="9" opacity="0.45" />
        </svg>
      );
    case 'history':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case 'intentions':
      // DISABLED tab — kept here so any direct visit to /intentions
      // still has a glyph in the (very rare) case the icon is rendered.
      // Compass-like glyph: a focus point inside a circle, hinting at
      // direction-of-being. Distinct from the patterns bar-chart.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3" />
          <line x1="12" y1="3" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="21" />
          <line x1="3" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="21" y2="12" />
        </svg>
      );
    case 'presence':
      // DISABLED tab — Presence functionality moved into the Pulse tab
      // (slot 0). Glyph kept here as a no-op for any direct visit /
      // stale tab key.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="9" opacity="0.45" />
        </svg>
      );
    case 'guided':
      // Speech bubble with a small dot inside — represents Ben asking
      // the user a question (guided session = dialogue). Distinct from
      // the journal pencil-on-book (blank-page writing) on the center
      // pill, and from the patterns bar-chart.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          <circle cx="12" cy="11" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'patterns':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case 'notebooks':
      // Same open-book glyph that used to sit on the Journal center
      // pill — demoted to a tab icon now that the center pill is the
      // act of writing (pencil-on-book). Notebooks = the shelf.
      return <BookIcon size={size} />;
    default:
      return null;
  }
}

export function WallNav() {
  const pathname = usePathname();
  const activeWall = useWallState((s) => s.activeWall);
  const setTab = useWallState((s) => s.setTab);
  const setJournalTab = useWallState((s) => s.setJournalTab);

  const currentTab = tabForPath(pathname);

  // Build the slot layout for the active wall. Index 2 is always the
  // raised center action button. The wall-flip mechanism lives on the
  // Wall Edge Tab (right edge), so all five slots are in-wall pages.
  const slots: NavSlot[] = activeWall === 'tasks'
    ? [
        { href: '/today', key: 'today', labelKey: 'tab.today' },
        { href: '/lists', key: 'lists', labelKey: 'tab.lists' },
        // Tasks wall center now goes to /notebooks so the user can
        // reach Plans / Gratitude / project notebooks from anywhere
        // without flipping walls. The voice-capture entry point used
        // to live here; it's now per-tab via CaptureMicButton.
        { href: '/notebooks', key: 'notebooks', labelKey: 'tab.notebooks', isCenter: true },
        { href: '/upcoming', key: 'upcoming', labelKey: 'tab.upcoming' },
        { href: '/groceries', key: 'groceries', labelKey: 'tab.groceries' },
      ]
    : [
        // Journal wall — 5 slots so the center Journal pill sits
        // actually centered. Slot 3 is the Guided Session (Ben asks
        // questions, you reply). Mid-day Presence pause folded into
        // the Pulse tab (slot 0). Old slot-3 occupants kept commented
        // for one-line revert.
        { href: '/home', key: 'pulse', labelKey: 'tab.pulse' },
        { href: '/notebooks', key: 'notebooks', labelKey: 'tab.notebooks' },
        { href: '/journal', key: 'journal', labelKey: 'tab.journal', isCenter: true },
        // DISABLED: intentions tab (kept for revert).
        // { href: '/intentions', key: 'intentions', labelKey: 'tab.intentions' },
        // DISABLED: standalone presence tab (functionality moved into Pulse).
        // { href: '/presence', key: 'presence', labelKey: 'tab.presence' },
        { href: '/guided', key: 'guided', labelKey: 'tab.guided' },
        { href: '/patterns', key: 'patterns', labelKey: 'tab.patterns' },
      ];

  return (
    <nav className="fixed bottom-0 inset-x-0 glass-card z-50">
      <div className="max-w-lg mx-auto flex items-end px-2 pt-2 pb-[max(2.25rem,env(safe-area-inset-bottom))]">
        {slots.map((slot) => {
          // The center slot is a raised primary action — bigger, sits
          // proud of the nav. On the Tasks wall it's the mic icon. On
          // the Journal wall it's the user's chosen guide avatar + name
          // (so the user sees who they're about to talk to before they
          // tap, not a generic chat bubble).
          if (slot.isCenter) {
            // Both walls render the center slot as a raised primary
            // action. Tasks wall → BookIcon (the notebooks shelf, since
            // the center now routes to /notebooks). Journal wall →
            // PencilBookIcon (the writing surface at /journal).
            // Voice-capture entry on the tasks wall lives per-tab via
            // CaptureMicButton; no longer the center-nav role.
            const CenterIcon = activeWall === 'journal' ? PencilBookIcon : BookIcon;
            return (
              <Link
                key={slot.key}
                href={slot.href ?? '#'}
                className="relative flex-1 flex flex-col items-center -mt-5"
                aria-label={t(slot.labelKey)}
              >
                <motion.div
                  data-tour="capture-button"
                  whileTap={!prefersReducedMotion ? { scale: 0.92 } : undefined}
                  className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center shadow-warm-md ring-4 ring-bg"
                >
                  <CenterIcon />
                </motion.div>
                <span className="text-[10px] font-medium text-text-tertiary mt-1">
                  {t(slot.labelKey)}
                </span>
              </Link>
            );
          }

          // Normal tab pill. On click, also persist the new last-tab
          // for this wall so the edge-tab flip returns here.
          const isActive = currentTab === slot.key;
          return (
            <Link
              key={slot.key}
              href={slot.href ?? '#'}
              data-tour={`tab-${slot.key}`}
              onClick={() => {
                if (
                  activeWall === 'tasks' &&
                  (slot.key === 'today' ||
                    slot.key === 'lists' ||
                    slot.key === 'upcoming' ||
                    slot.key === 'groceries')
                ) {
                  setTab('tasks', slot.key);
                } else if (
                  activeWall === 'journal' &&
                  (slot.key === 'pulse' ||
                    slot.key === 'notebooks' ||
                    slot.key === 'guided' ||
                    slot.key === 'patterns')
                ) {
                  setJournalTab(slot.key);
                }
              }}
              className="relative flex-1 flex flex-col items-center gap-1 py-1"
            >
              <motion.div
                whileTap={!prefersReducedMotion ? { scale: 0.85 } : undefined}
                className={isActive ? 'text-primary' : 'text-text-tertiary'}
              >
                <TabIcon name={slot.key} />
              </motion.div>
              <span className={`text-[10px] font-medium ${isActive ? 'text-primary' : 'text-text-tertiary'}`}>
                {t(slot.labelKey)}
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
  );
}
