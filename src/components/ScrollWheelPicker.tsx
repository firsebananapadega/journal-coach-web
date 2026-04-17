'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

interface ScrollWheelPickerProps {
  items: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  itemHeight?: number;
  visibleItems?: number;
}

export function ScrollWheelPicker({
  items,
  selectedIndex,
  onChange,
  itemHeight = 44,
  visibleItems = 5,
}: ScrollWheelPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInitializing = useRef(true);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [centerIndex, setCenterIndex] = useState(selectedIndex);

  const spacerHeight = Math.floor(visibleItems / 2) * itemHeight;
  const containerHeight = visibleItems * itemHeight;

  // Scroll to selected index on mount and when selectedIndex changes externally
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    isInitializing.current = true;
    el.scrollTo({ top: selectedIndex * itemHeight, behavior: 'instant' });
    setCenterIndex(selectedIndex);
    // Allow scroll events after a tick
    requestAnimationFrame(() => {
      isInitializing.current = false;
    });
  }, [selectedIndex, itemHeight]);

  const handleScroll = useCallback(() => {
    if (isInitializing.current) return;
    const el = containerRef.current;
    if (!el) return;

    const scrollTop = el.scrollTop;
    const newCenter = Math.round(scrollTop / itemHeight);
    const clamped = Math.max(0, Math.min(items.length - 1, newCenter));
    setCenterIndex(clamped);

    // Debounce the onChange callback to fire after scroll settles
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      if (!isInitializing.current) {
        onChange(clamped);
      }
    }, 80);
  }, [itemHeight, items.length, onChange]);

  return (
    <div className="relative" style={{ height: containerHeight }}>
      {/* Selection indicator band */}
      <div
        className="absolute left-0 right-0 pointer-events-none z-10 border-y border-border"
        style={{
          top: spacerHeight,
          height: itemHeight,
        }}
      />

      {/* Fade overlays */}
      <div
        className="absolute top-0 left-0 right-0 pointer-events-none z-20"
        style={{
          height: spacerHeight,
          background: 'linear-gradient(to bottom, var(--theme-surface), transparent)',
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none z-20"
        style={{
          height: spacerHeight,
          background: 'linear-gradient(to top, var(--theme-surface), transparent)',
        }}
      />

      {/* Scrollable items */}
      <div
        ref={containerRef}
        className="scroll-wheel-container overflow-y-auto h-full"
        onScroll={handleScroll}
      >
        {/* Top spacer */}
        <div style={{ height: spacerHeight }} />

        {items.map((item, i) => {
          const distance = Math.abs(i - centerIndex);
          const opacity = distance === 0 ? 1 : distance === 1 ? 0.5 : 0.25;
          const scale = distance === 0 ? 1 : distance === 1 ? 0.9 : 0.85;

          return (
            <div
              key={`${item}-${i}`}
              className="scroll-wheel-item flex items-center justify-center text-text-primary font-semibold select-none"
              style={{
                height: itemHeight,
                opacity,
                transform: `scale(${scale})`,
                transition: 'opacity 0.15s, transform 0.15s',
                fontSize: distance === 0 ? '18px' : '15px',
              }}
            >
              {item}
            </div>
          );
        })}

        {/* Bottom spacer */}
        <div style={{ height: spacerHeight }} />
      </div>
    </div>
  );
}
