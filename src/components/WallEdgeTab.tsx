'use client';

// Wall Edge Tab — top-center pill for switching between Tasks and
// Journal walls. Tap to flip; drag downward to flip. The label
// always names the OTHER wall (your destination) so there's no
// memory burden.
//
// Mounted as a sibling of the rotating motion.div inside WallShell, so
// the tab stays still in screen space while the wall flips beneath it.
//
// Robustness notes:
// - Inset from safe-area-inset-top so the touch zone clears the iOS
//   notch + status bar.
// - Centered horizontally via `inset-x-0 mx-auto` + a fixed width so
//   we don't fight framer-motion's drag transform.
// - Disabled (pointer-events:none + faded) during an in-flight flip
//   so rapid taps can't double-trigger.
// - Touch target is 160×48 — well above Apple HIG ≥44×44.
// - Real <button> for keyboard + screen-reader access.
// - Drag axis is Y (downward) since the tab anchors at the top —
//   pulling down "drags the tab into the screen" to commit the flip.
//   Framer-motion's drag handler captures the touch before iOS's
//   pull-to-refresh, so there's no gesture conflict.

import { useRouter, usePathname } from 'next/navigation';
import { motion, type PanInfo } from 'framer-motion';
import { useWallState, isWallRootPath, type WallId } from '@/lib/wallState';
import { useAuthStore } from '@/stores/authStore';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';

// How far downward the user must drag before release commits the flip.
const DRAG_COMMIT_THRESHOLD_PX = 60;
// How far the tab can be dragged before encountering elastic resistance.
const DRAG_LIMIT_PX = 200;

export default function WallEdgeTab() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const activeWall = useWallState((s) => s.activeWall);
  const lastTabPerWall = useWallState((s) => s.lastTabPerWall);
  const flipPhase = useWallState((s) => s.flipPhase);
  const flipTo = useWallState((s) => s.flipTo);
  const primaryUse = useAuthStore((s) => s.profile?.primary_use ?? null);

  // Only show on the exact root tabs of either wall. Inside a notebook,
  // a list, an intention detail, the entry detail, etc. the user is in
  // a focused context — the wall switcher would steal attention from
  // whatever they're doing and looks like UI clutter on top of any
  // composer overlay rendered there.
  if (!isWallRootPath(pathname)) {
    return null;
  }

  // Hide the switcher entirely when the user has scoped their app to
  // only one wall (primary_use !== 'both'). They can re-enable both
  // walls from /settings; until then the edge tab would point at a
  // wall the user explicitly opted out of. `null` = legacy user
  // who never picked, treat as 'both' for safety.
  if (primaryUse !== 'both' && primaryUse !== null) {
    return null;
  }

  // The label reflects the CURRENT wall — it reads like a header for
  // the page you're on. The flip icon signals the action. The target
  // (where we flip to when tapped) is still the OTHER wall.
  const destinationWall: WallId = activeWall === 'tasks' ? 'journal' : 'tasks';
  const currentLabel =
    activeWall === 'tasks' ? t('wall.tasks') : t('wall.journal');
  const targetPath = (() => {
    if (destinationWall === 'journal') {
      const tab = lastTabPerWall.journal;
      return tab === 'pulse' ? '/home' : `/${tab}`;
    }
    return `/${lastTabPerWall.tasks}`;
  })();

  const isFlipping = flipPhase !== 'idle';

  const fire = () => {
    if (isFlipping) return;
    flipTo(targetPath, destinationWall, (h) => router.push(h), {
      reducedMotion: prefersReducedMotion,
    });
  };

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    // Drag commits if the user pulled the tab downward past the
    // threshold. Drags shorter than that — or drags upward — spring
    // back via dragSnapToOrigin. Tiny drags (<5px) are treated as taps
    // by framer-motion's onClick handler, so we don't double-handle.
    if (info.offset.y > DRAG_COMMIT_THRESHOLD_PX) {
      fire();
    }
  };

  return (
    <motion.button
      type="button"
      data-tour="wall-edge-tab"
      onClick={fire}
      // Drag along the Y axis only, downward to commit. Constrained so
      // it can't fly off the bottom edge of the screen.
      drag="y"
      dragConstraints={{ top: 0, bottom: DRAG_LIMIT_PX }}
      dragElastic={0.15}
      dragSnapToOrigin
      onDragEnd={handleDragEnd}
      // Cosmetic during the flip: fade out, disable pointer events so a
      // double tap can't queue a second flip while one is in flight.
      animate={{ opacity: isFlipping ? 0 : 1 }}
      transition={{ duration: 0.18 }}
      // Position: fixed top-center. `inset-x-0 mx-auto` centers a
      // fixed-width element without using a translateX transform
      // (which would compete with framer-motion's drag transform).
      // top math clears iOS notch + status bar.
      style={{
        pointerEvents: isFlipping ? 'none' : 'auto',
        top: 'max(0.5rem, calc(env(safe-area-inset-top) + 0.375rem))',
      }}
      className="fixed inset-x-0 mx-auto z-30 flex items-center justify-center w-[112px] h-8 outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full"
      aria-label={
        destinationWall === 'tasks'
          ? `Switch to ${t('wall.tasks')}`
          : `Switch to ${t('wall.journal')}`
      }
    >
      {/* Visible pill — fills the touch target. Flip glyph + destination
          label, no extra chevron (the icon already signals "swap"). */}
      <div
        className="bg-surface-elevated/95 backdrop-blur-sm border border-border rounded-full shadow-warm-md flex items-center justify-center gap-1.5 px-2.5 py-1 select-none w-full h-full"
      >
        {/* Flip glyph — circular swap arrow. */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-text-tertiary flex-shrink-0"
          aria-hidden
        >
          <path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.78 1 6.4 2.6L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
        <span
          className="text-[13px] font-bold tracking-wider text-text-secondary uppercase leading-none"
          aria-hidden
        >
          {currentLabel}
        </span>
      </div>
    </motion.button>
  );
}
