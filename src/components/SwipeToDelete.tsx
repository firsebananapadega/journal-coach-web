'use client';

import { useRef, useState, useCallback } from 'react';

interface SwipeToDeleteProps {
  onDelete: () => void;
  onTap?: () => void;
  children: React.ReactNode;
}

const DELETE_WIDTH = 76;
const SNAP_THRESHOLD = 40;
const AUTO_DELETE_THRESHOLD = 160;
// Minimum horizontal distance before the swipe gesture activates.
// Prevents accidental swipe when user is trying to scroll vertically.
const DIRECTION_LOCK_THRESHOLD = 12;

export function SwipeToDelete({ onDelete, onTap, children }: SwipeToDeleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const isDragging = useRef(false);
  const tapTarget = useRef<EventTarget | null>(null);
  // null = undecided, 'horizontal' = swiping, 'vertical' = scrolling
  const directionLock = useRef<'horizontal' | 'vertical' | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    currentX.current = 0;
    isDragging.current = false;
    directionLock.current = null;
    tapTarget.current = e.target;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // Determine direction if not yet locked
    if (directionLock.current === null) {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Wait until movement exceeds threshold to decide
      if (absDx < DIRECTION_LOCK_THRESHOLD && absDy < DIRECTION_LOCK_THRESHOLD) {
        return; // Not enough movement to decide yet
      }

      if (absDy > absDx) {
        // Vertical scroll dominates — let the browser handle it
        directionLock.current = 'vertical';
        return;
      }

      // Horizontal swipe dominates
      directionLock.current = 'horizontal';
    }

    // If locked to vertical scrolling, do nothing
    if (directionLock.current === 'vertical') return;

    // Only allow swiping left (or right to close revealed state)
    if (dx > 0 && !isRevealed) {
      return;
    }

    // If already revealed and swiping right, close it
    if (isRevealed && dx > 0) {
      const newOffset = Math.min(0, -DELETE_WIDTH + dx);
      setOffsetX(newOffset);
      currentX.current = dx;
      isDragging.current = true;
      return;
    }

    isDragging.current = true;
    currentX.current = dx;
    const offset = isRevealed ? -DELETE_WIDTH + dx : dx;
    setOffsetX(Math.max(-AUTO_DELETE_THRESHOLD - 20, Math.min(0, offset)));
  }, [isRevealed]);

  const handleTouchEnd = useCallback(() => {
    // Reset direction lock
    directionLock.current = null;

    if (!isDragging.current) {
      // No drag happened — this was a tap. Skip if target is a checkbox area.
      const el = tapTarget.current as HTMLElement | null;
      if (onTap && !isRevealed && !el?.closest?.('[data-checkbox]')) onTap();
      return;
    }

    const absOffset = Math.abs(offsetX);

    if (absOffset >= AUTO_DELETE_THRESHOLD) {
      setOffsetX(-400);
      setTimeout(() => onDelete(), 200);
      return;
    }

    if (isRevealed && currentX.current > SNAP_THRESHOLD / 2) {
      setOffsetX(0);
      setIsRevealed(false);
    } else if (!isRevealed && absOffset >= SNAP_THRESHOLD) {
      setOffsetX(-DELETE_WIDTH);
      setIsRevealed(true);
    } else if (isRevealed) {
      setOffsetX(-DELETE_WIDTH);
    } else {
      setOffsetX(0);
      setIsRevealed(false);
    }

    isDragging.current = false;
  }, [offsetX, isRevealed, onDelete, onTap]);

  // Also support mouse for desktop
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    startX.current = e.clientX;
    currentX.current = 0;
    isDragging.current = false;
    tapTarget.current = e.target;

    const handleMouseMove = (ev: MouseEvent) => {
      const diff = ev.clientX - startX.current;
      if (diff > 0 && !isRevealed) return;
      isDragging.current = true;
      currentX.current = diff;
      const offset = isRevealed ? -DELETE_WIDTH + diff : diff;
      setOffsetX(Math.max(-AUTO_DELETE_THRESHOLD - 20, Math.min(0, offset)));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      if (!isDragging.current) {
        const el = tapTarget.current as HTMLElement | null;
        if (onTap && !isRevealed && !el?.closest?.('[data-checkbox]')) onTap();
        return;
      }
      const absOffset = Math.abs(offsetX);

      if (absOffset >= AUTO_DELETE_THRESHOLD) {
        setOffsetX(-400);
        setTimeout(() => onDelete(), 200);
        return;
      }

      if (isRevealed && currentX.current > SNAP_THRESHOLD / 2) {
        setOffsetX(0);
        setIsRevealed(false);
      } else if (!isRevealed && absOffset >= SNAP_THRESHOLD) {
        setOffsetX(-DELETE_WIDTH);
        setIsRevealed(true);
      } else if (isRevealed) {
        setOffsetX(-DELETE_WIDTH);
      } else {
        setOffsetX(0);
        setIsRevealed(false);
      }
      isDragging.current = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [isRevealed, offsetX, onDelete, onTap]);

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-xl">
      {/* Delete button behind */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-error transition-opacity"
        style={{ width: DELETE_WIDTH, opacity: offsetX < -10 ? 1 : 0 }}
      >
        <button
          onClick={() => {
            setOffsetX(-400);
            setTimeout(() => onDelete(), 150);
          }}
          className="text-white text-sm font-semibold px-3"
        >
          Delete
        </button>
      </div>

      {/* Content layer */}
      <div
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging.current ? 'none' : 'transform 0.2s ease-out',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        {children}
      </div>
    </div>
  );
}
