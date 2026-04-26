'use client';

// Bi-directional swipe-to-reveal row.
//
// Swipe LEFT  → reveal "Delete" on the right.
// Swipe RIGHT → reveal a caller-defined secondary action on the left
//               (when `onSecondary` supplied; e.g. "Tomorrow" on
//               /lists/[id], "Copy" on a clipboard surface, etc.).
//
// The row NEVER auto-commits an action on a full swipe. Both actions
// require the user to tap the revealed button — a deliberate
// double-action so a stray horizontal swipe can't destroy an entry.
//
// iOS click-synthesis caveat:
//   When a touch drags across a button and lifts over it, iOS Safari
//   dispatches a click on the element under the finger at touchend,
//   EVEN IF touchstart hit a different element. Without a guard, a
//   left-swipe that ends with the finger over the now-exposed Delete
//   button would fire `onDelete` against the user's intent. We gate
//   action-button onClicks on (a) a settle-timestamp lockout and
//   (b) a touchstart-on-self flag so only a deliberate tap on the
//   button itself commits the action.

import { useRef, useState, useCallback, useEffect } from 'react';

interface SwipeToDeleteProps {
  onDelete: () => void;
  /** Left-reveal secondary action (e.g. "Tomorrow", "Copy"). When
   *  null, the left swipe stays disabled and the panel never shows. */
  onSecondary?: () => void;
  /** Visible label inside the secondary panel. Required when
   *  onSecondary is supplied. Kept generic so the same component
   *  serves both /lists ("Tomorrow") and any future surface. */
  secondaryLabel?: string;
  /** Optional icon node rendered above/beside the secondary label.
   *  Defaults to a generic forward-arrow when omitted. */
  secondaryIcon?: React.ReactNode;
  /** Background color class for the secondary panel. Defaults to the
   *  primary brand color. Override when an action wants to communicate
   *  a different intent visually (e.g. neutral gray for "snooze"). */
  secondaryBgClass?: string;
  onTap?: () => void;
  children: React.ReactNode;
}

const ACTION_WIDTH = 76;
const SNAP_THRESHOLD = 36;
const MAX_DRAG = ACTION_WIDTH + 20;
// Small enough that a deliberate swipe engages quickly, large enough
// that a vertical scroll doesn't get hijacked. Tuned for iOS where a
// ~6px gesture still feels like a scroll attempt.
const DIRECTION_LOCK_THRESHOLD = 8;
// Milliseconds after a drag-settle during which synthesized clicks
// are suppressed on the action buttons. Covers the iOS click-delay
// window (~300ms) with margin.
const SETTLE_CLICK_LOCKOUT_MS = 450;

type Revealed = 'none' | 'left' | 'right';

export function SwipeToDelete({
  onDelete,
  onSecondary,
  secondaryLabel = 'Action',
  secondaryIcon,
  secondaryBgClass = 'bg-primary',
  onTap,
  children,
}: SwipeToDeleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Static drag bookkeeping — refs so touch events don't need
  // round-tripping through render to stay consistent.
  const startX = useRef(0);
  const startY = useRef(0);
  const lastDx = useRef(0);
  const isDragging = useRef(false);
  const movedVertically = useRef(false);
  const tapTarget = useRef<EventTarget | null>(null);
  const directionLock = useRef<'horizontal' | 'vertical' | null>(null);

  // Timestamp of the most recent settle-from-drag. Used to reject
  // click events that iOS synthesizes on the action buttons right
  // after a swipe.
  const lastSettleAt = useRef(0);

  // "This click originated from a touch that started on me." Set by
  // the action button's onTouchStart. Cleared on click. On desktop
  // (no touch) we fall through without requiring it.
  const deleteTouchedSelf = useRef(false);
  const secondaryTouchedSelf = useRef(false);

  // Live transform offset — drives the inline style.
  const [offsetX, setOffsetX] = useState(0);
  // Committed side. Only set on settle (release), never during drag.
  const [revealed, setRevealed] = useState<Revealed>('none');
  const revealedRef = useRef<Revealed>('none');
  useEffect(() => {
    revealedRef.current = revealed;
  }, [revealed]);

  // Close the row whenever the user taps anywhere outside it.
  useEffect(() => {
    if (revealed === 'none') return;
    const handler = (ev: MouseEvent | TouchEvent) => {
      const el = containerRef.current;
      if (!el) return;
      if (el.contains(ev.target as Node)) return;
      setOffsetX(0);
      setRevealed('none');
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [revealed]);

  const clampedOffsetFor = useCallback(
    (dx: number, base: number): number => {
      const raw = base + dx;
      const canOpenRight = !!onSecondary;
      const lower = -MAX_DRAG;
      const upper = canOpenRight ? MAX_DRAG : 0;
      return Math.max(lower, Math.min(upper, raw));
    },
    [onSecondary],
  );

  const beginGesture = useCallback(
    (clientX: number, clientY: number, target: EventTarget | null) => {
      startX.current = clientX;
      startY.current = clientY;
      lastDx.current = 0;
      isDragging.current = false;
      movedVertically.current = false;
      directionLock.current = null;
      tapTarget.current = target;
    },
    [],
  );

  const moveGesture = useCallback(
    (dx: number, dy: number) => {
      if (directionLock.current === null) {
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDx < DIRECTION_LOCK_THRESHOLD && absDy < DIRECTION_LOCK_THRESHOLD) return;
        // Require vertical to dominate by 1.5x to classify as scroll.
        // This keeps subtle-but-intentional horizontal swipes from
        // being mis-read as scrolls on iOS (where a horizontal gesture
        // often carries a few px of vertical drift).
        if (absDy > absDx * 1.5) {
          directionLock.current = 'vertical';
          movedVertically.current = true;
          return;
        }
        directionLock.current = 'horizontal';
      }
      if (directionLock.current === 'vertical') return;

      isDragging.current = true;
      lastDx.current = dx;

      const base =
        revealedRef.current === 'right'
          ? -ACTION_WIDTH
          : revealedRef.current === 'left'
          ? ACTION_WIDTH
          : 0;
      setOffsetX(clampedOffsetFor(dx, base));
    },
    [clampedOffsetFor],
  );

  const settleGesture = useCallback(() => {
    directionLock.current = null;

    if (!isDragging.current) {
      if (movedVertically.current) {
        movedVertically.current = false;
        return;
      }
      if (revealedRef.current !== 'none') {
        const el = tapTarget.current as HTMLElement | null;
        if (!el?.closest?.('[data-swipe-action]')) {
          setOffsetX(0);
          setRevealed('none');
        }
        return;
      }
      const el = tapTarget.current as HTMLElement | null;
      if (onTap && !el?.closest?.('[data-checkbox]') && !el?.closest?.('[data-no-tap]')) {
        onTap();
      }
      return;
    }

    isDragging.current = false;
    // A drag just ended — start the click-lockout window so the
    // synthesized click iOS fires (targeting whatever element is
    // under the finger at touchend) can't commit the newly-revealed
    // action button.
    lastSettleAt.current = Date.now();

    const dx = lastDx.current;
    const was = revealedRef.current;

    if (was === 'right' && dx > SNAP_THRESHOLD / 2) {
      setOffsetX(0);
      setRevealed('none');
      return;
    }
    if (was === 'left' && dx < -SNAP_THRESHOLD / 2) {
      setOffsetX(0);
      setRevealed('none');
      return;
    }

    if (was === 'none') {
      if (dx <= -SNAP_THRESHOLD) {
        setOffsetX(-ACTION_WIDTH);
        setRevealed('right');
      } else if (dx >= SNAP_THRESHOLD && onSecondary) {
        setOffsetX(ACTION_WIDTH);
        setRevealed('left');
      } else {
        setOffsetX(0);
        setRevealed('none');
      }
      return;
    }

    if (was === 'right') {
      setOffsetX(-ACTION_WIDTH);
    } else if (was === 'left') {
      setOffsetX(ACTION_WIDTH);
    } else {
      setOffsetX(0);
      setRevealed('none');
    }
  }, [onSecondary, onTap]);

  // ── Touch handlers on the content layer ─────────────────────────
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      beginGesture(e.touches[0].clientX, e.touches[0].clientY, e.target);
    },
    [beginGesture],
  );
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;
      moveGesture(dx, dy);
    },
    [moveGesture],
  );
  const handleTouchEnd = useCallback(() => {
    settleGesture();
  }, [settleGesture]);
  const handleTouchCancel = useCallback(() => {
    settleGesture();
  }, [settleGesture]);

  // ── Mouse handlers (desktop) ────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      beginGesture(e.clientX, e.clientY, e.target);

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX.current;
        const dy = ev.clientY - startY.current;
        moveGesture(dx, dy);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        settleGesture();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [beginGesture, moveGesture, settleGesture],
  );

  // Helper — decide whether a click on an action button is real. A
  // click is real when it followed a touchstart on the button itself
  // AND didn't fire within the post-settle lockout window. On
  // desktop (no touch) we skip the touchstart check.
  const clickIsReal = useCallback((touchedSelf: boolean) => {
    const withinLockout = Date.now() - lastSettleAt.current < SETTLE_CLICK_LOCKOUT_MS;
    if (withinLockout) return false;
    const isTouchDevice =
      typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    if (isTouchDevice && !touchedSelf) return false;
    return true;
  }, []);

  const handleDeleteClick = useCallback(
    (ev: React.MouseEvent) => {
      ev.stopPropagation();
      const real = clickIsReal(deleteTouchedSelf.current);
      deleteTouchedSelf.current = false;
      if (!real) return;
      if (revealedRef.current !== 'right') return;
      setOffsetX(0);
      setRevealed('none');
      onDelete();
    },
    [onDelete, clickIsReal],
  );
  const handleSecondaryClick = useCallback(
    (ev: React.MouseEvent) => {
      ev.stopPropagation();
      const real = clickIsReal(secondaryTouchedSelf.current);
      secondaryTouchedSelf.current = false;
      if (!real) return;
      if (revealedRef.current !== 'left') return;
      setOffsetX(0);
      setRevealed('none');
      onSecondary?.();
    },
    [onSecondary, clickIsReal],
  );

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-xl">
      {/* Secondary panel — revealed by LEFT-TO-RIGHT swipe. Hidden
          while the row is at rest so the colored fill can't peek
          through the card's rounded corners. `visibility` (not
          `display`) keeps layout stable so the transform reveal
          doesn't reflow on first swipe. */}
      {onSecondary && (
        <div
          aria-hidden={revealed !== 'left'}
          className={`absolute inset-y-0 left-0 flex items-center justify-center ${secondaryBgClass}`}
          style={{
            width: ACTION_WIDTH,
            pointerEvents: revealed === 'left' ? 'auto' : 'none',
            visibility: offsetX > 0 ? 'visible' : 'hidden',
          }}
        >
          <button
            type="button"
            data-swipe-action
            onTouchStart={(ev) => {
              // Scoped to the button — proves a real tap originated
              // here rather than being synthesized by iOS after a
              // swipe ending over this element.
              ev.stopPropagation();
              secondaryTouchedSelf.current = true;
            }}
            onClick={handleSecondaryClick}
            aria-label={secondaryLabel}
            tabIndex={revealed === 'left' ? 0 : -1}
            className="text-white text-[11px] font-semibold h-full w-full flex flex-col items-center justify-center gap-0.5 leading-tight"
          >
            {secondaryIcon ?? (
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14" />
                <path d="M13 5l7 7-7 7" />
              </svg>
            )}
            <span>{secondaryLabel}</span>
          </button>
        </div>
      )}

      {/* Delete panel — revealed by RIGHT-TO-LEFT swipe. Same
          at-rest visibility gate as the secondary panel above. */}
      <div
        aria-hidden={revealed !== 'right'}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-error"
        style={{
          width: ACTION_WIDTH,
          pointerEvents: revealed === 'right' ? 'auto' : 'none',
          visibility: offsetX < 0 ? 'visible' : 'hidden',
        }}
      >
        <button
          type="button"
          data-swipe-action
          onTouchStart={(ev) => {
            ev.stopPropagation();
            deleteTouchedSelf.current = true;
          }}
          onClick={handleDeleteClick}
          aria-label="Delete"
          tabIndex={revealed === 'right' ? 0 : -1}
          className="text-white text-sm font-semibold px-3 h-full w-full"
        >
          Delete
        </button>
      </div>

      {/* Content layer. */}
      <div
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging.current ? 'none' : 'transform 0.2s ease-out',
          // pan-y tells iOS to keep vertical scrolling but let JS own
          // horizontal pans — critical, otherwise the OS can swallow
          // the right-swipe as a "go back" gesture.
          touchAction: 'pan-y',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        onMouseDown={handleMouseDown}
      >
        {children}
      </div>
    </div>
  );
}
