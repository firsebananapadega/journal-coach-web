'use client';

// Spotlight overlay — dims the screen everywhere except a rounded
// rectangle hole around the anchor rect. Implemented as a full-viewport
// SVG with an even-odd-filled path so the inside of the rect is cut out.
//
// When anchorRect is null (modal steps), the whole viewport is dimmed.
// The rect is padded so the anchor feels "haloed" rather than clipped.

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SpotlightProps {
  rect: Rect | null;
  padding?: number;
  radius?: number;
  opacity?: number;
}

export default function Spotlight({
  rect,
  padding = 10,
  radius = 22,
  opacity = 0.62,
}: SpotlightProps) {
  // Viewport size — tracked reactively so the dim covers the whole
  // screen across orientation / resize.
  const [viewport, setViewport] = useState<{ w: number; h: number }>(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 0,
    h: typeof window !== 'undefined' ? window.innerHeight : 0,
  }));

  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  const w = viewport.w;
  const h = viewport.h;

  const hole = rect
    ? roundedRectPath(
        rect.x - padding,
        rect.y - padding,
        rect.width + padding * 2,
        rect.height + padding * 2,
        radius
      )
    : '';

  const viewportPath = `M0 0 H${w} V${h} H0 Z`;

  return (
    <motion.svg
      aria-hidden
      className="fixed inset-0 z-[75] pointer-events-none"
      width="100%"
      height="100%"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <path
        d={`${viewportPath} ${hole}`}
        fillRule="evenodd"
        fill={`rgba(0,0,0,${opacity})`}
      />
    </motion.svg>
  );
}

// Builds an SVG path for a rounded rectangle (clockwise).
function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return [
    `M${x + rr} ${y}`,
    `H${x + w - rr}`,
    `A${rr} ${rr} 0 0 1 ${x + w} ${y + rr}`,
    `V${y + h - rr}`,
    `A${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}`,
    `H${x + rr}`,
    `A${rr} ${rr} 0 0 1 ${x} ${y + h - rr}`,
    `V${y + rr}`,
    `A${rr} ${rr} 0 0 1 ${x + rr} ${y}`,
    'Z',
  ].join(' ');
}
