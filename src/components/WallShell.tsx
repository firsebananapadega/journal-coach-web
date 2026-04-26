'use client';

// Two-wall shell with a page-turn flip between Tasks and Journal sides.
// The flip is split into two halves so we can navigate between routes
// mid-animation without the AnimatePresence-vs-Next.js race that broke
// the previous rotateY implementation.
//
// Phase 1 ('exiting'): current page rotates 0 → -90 on its right hinge.
// (mid-flip) router.push happens — Next.js swaps {children} for the new page.
// Phase 2 ('entering'): wrapper rotates 90 → 0 on its left hinge,
// revealing the new page sliding in from the right edge.
//
// We key the motion.div on the flip phase so Framer Motion treats each
// half as a distinct mount, applying the correct `initial` rotation.
// Combined with `backfaceVisibility: hidden` and `willChange: transform`
// the effect is a satisfying book-page turn at 60fps.

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  useWallState,
  wallForPath,
  tabForPath,
  FLIP_HALF_MS,
  type TasksTab,
  type JournalTab,
} from '@/lib/wallState';
import { prefersReducedMotion } from '@/lib/motionVariants';
import WallEdgeTab from './WallEdgeTab';

const TASKS_TABS: ReadonlySet<TasksTab> = new Set(['today', 'lists', 'upcoming', 'groceries']);
const JOURNAL_TABS: ReadonlySet<JournalTab> = new Set(['pulse', 'notebooks', 'journal', 'intentions', 'patterns']);

export function WallShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hydrate = useWallState((s) => s.hydrate);
  const setWall = useWallState((s) => s.setWall);
  const setTab = useWallState((s) => s.setTab);
  const setJournalTab = useWallState((s) => s.setJournalTab);
  const flipPhase = useWallState((s) => s.flipPhase);

  // Hydrate persisted wall state on first client mount.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Keep the active wall AND last-visited tab in sync with the URL.
  // Previously this only updated activeWall — lastTabPerWall was only
  // refreshed by bottom-nav button onClick handlers, so any other
  // navigation (deep links, programmatic router.push, browser back/
  // forward) left lastTabPerWall stale. The WallEdgeTab uses
  // lastTabPerWall to compute its flip target; with stale data the
  // user could flip to /patterns when they expected /home, etc.
  // Now every time the user lands on a known root path, both fields
  // update. Skipped during an active flip so we don't fight the
  // animation's mid-flight state writes.
  useEffect(() => {
    if (flipPhase !== 'idle') return;
    const w = wallForPath(pathname);
    if (!w) return;
    setWall(w);
    const tab = tabForPath(pathname);
    if (!tab) return;
    if (w === 'tasks' && TASKS_TABS.has(tab as TasksTab)) {
      setTab('tasks', tab as TasksTab);
    } else if (w === 'journal' && JOURNAL_TABS.has(tab as JournalTab)) {
      setJournalTab(tab as JournalTab);
    }
  }, [pathname, setWall, setTab, setJournalTab, flipPhase]);

  if (prefersReducedMotion) {
    // Tab still mounts in the reduced-motion branch — its own flipTo
    // call will detect the preference and skip the rotation animation
    // while still navigating between walls.
    return (
      <div className="relative">
        {children}
        <WallEdgeTab />
      </div>
    );
  }

  // Idle state: render WITHOUT a transform on the wrapper. Any non-
  // `none` transform (including framer-motion's resolved rotateY(0))
  // turns the wrapper into the containing block for `position: fixed`
  // descendants — which broke @dnd-kit's DragOverlay (drag preview
  // offset from finger). The wrapper only needs the rotation styling
  // while the flip is actually animating; outside of that we render
  // a plain div so DragOverlay can position relative to the viewport.
  if (flipPhase === 'idle') {
    return (
      <div className="relative">
        {children}
        <WallEdgeTab />
      </div>
    );
  }

  // Active flip — apply rotation styling. `transformOrigin` flips
  // between right (exit) and left (enter) so the visual hinge mimics
  // turning a book page.
  const isExiting = flipPhase === 'exiting';
  const isEntering = flipPhase === 'entering';
  const animateY = isExiting ? -90 : 0;
  const initialY = isEntering ? 90 : 0;
  const origin = isExiting ? 'right center' : 'left center';

  return (
    <div
      className="relative"
      style={{ perspective: '1500px' }}
    >
      <motion.div
        // Remount on phase change so `initial` fires fresh — that's how
        // the entering phase starts at rotateY 90 instead of inheriting
        // the previous animate value.
        key={flipPhase}
        initial={{ rotateY: initialY }}
        animate={{ rotateY: animateY }}
        transition={{ duration: FLIP_HALF_MS / 1000, ease: [0.4, 0, 0.2, 1] }}
        style={{
          transformOrigin: origin,
          transformStyle: 'preserve-3d',
          backfaceVisibility: 'hidden',
          willChange: 'transform',
          width: '100%',
        }}
      >
        {children}
      </motion.div>
      {/* Edge tab — sibling of the rotating wall, so it stays still in
          screen space while the wall flips. Rendered inside the
          perspective container so its z-stacking is correct. */}
      <WallEdgeTab />
    </div>
  );
}
