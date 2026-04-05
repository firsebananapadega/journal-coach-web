'use client';

import { useRef, useState, useCallback } from 'react';

interface SwipeToDeleteProps {
  onDelete: () => void;
  children: React.ReactNode;
}

const DELETE_WIDTH = 76;
const SNAP_THRESHOLD = 40;
const AUTO_DELETE_THRESHOLD = 160;

export function SwipeToDelete({ onDelete, children }: SwipeToDeleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const isDragging = useRef(false);
  const [offsetX, setOffsetX] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    currentX.current = 0;
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const diff = e.touches[0].clientX - startX.current;
    // Only allow swiping left
    if (diff > 0 && !isRevealed) {
      if (isRevealed) {
        setOffsetX(0);
        setIsRevealed(false);
      }
      return;
    }

    // If already revealed and swiping right, close it
    if (isRevealed && diff > 0) {
      const newOffset = Math.min(0, -DELETE_WIDTH + diff);
      setOffsetX(newOffset);
      currentX.current = diff;
      isDragging.current = true;
      return;
    }

    isDragging.current = true;
    currentX.current = diff;
    const offset = isRevealed ? -DELETE_WIDTH + diff : diff;
    setOffsetX(Math.max(-AUTO_DELETE_THRESHOLD - 20, Math.min(0, offset)));
  }, [isRevealed]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;

    const diff = currentX.current;
    const absOffset = Math.abs(offsetX);

    if (absOffset >= AUTO_DELETE_THRESHOLD) {
      // Auto-delete: slide out completely
      setOffsetX(-400);
      setTimeout(() => onDelete(), 200);
      return;
    }

    if (isRevealed && diff > SNAP_THRESHOLD / 2) {
      // Was revealed, swiped right → close
      setOffsetX(0);
      setIsRevealed(false);
    } else if (!isRevealed && absOffset >= SNAP_THRESHOLD) {
      // Reveal delete button
      setOffsetX(-DELETE_WIDTH);
      setIsRevealed(true);
    } else if (isRevealed) {
      // Snap back to revealed position
      setOffsetX(-DELETE_WIDTH);
    } else {
      // Snap back to origin
      setOffsetX(0);
      setIsRevealed(false);
    }

    isDragging.current = false;
  }, [offsetX, isRevealed, onDelete]);

  // Also support mouse for desktop
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    startX.current = e.clientX;
    currentX.current = 0;
    isDragging.current = false;

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

      if (!isDragging.current) return;
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
  }, [isRevealed, offsetX, onDelete]);

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
