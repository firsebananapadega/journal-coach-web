'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo } from 'react';
import GuideMascot from '@/components/mascot/GuideMascot';
import { useUiStore } from '@/stores/uiStore';

const PARTICLE_COUNT = 22;
const PARTICLE_COLORS = [
  'var(--theme-primary)',
  'var(--theme-primary-light)',
  'var(--theme-accent)',
  'var(--theme-success)',
];
// Deterministic pseudo-random so SSR/CSR match without useState jank
function seeded(i: number, salt: number) {
  const x = Math.sin(i * 999 + salt) * 10000;
  return x - Math.floor(x);
}

interface Particle {
  angle: number;
  distance: number;
  scale: number;
  color: string;
  shape: 'circle' | 'square' | 'star';
  rotate: number;
  delay: number;
  duration: number;
}

function makeParticles(seed: number): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const a = (i / PARTICLE_COUNT) * Math.PI * 2;
    const jitter = (seeded(i, seed) - 0.5) * 0.7;
    return {
      angle: a + jitter,
      distance: 140 + seeded(i, seed + 1) * 120,
      scale: 0.6 + seeded(i, seed + 2) * 1.2,
      color: PARTICLE_COLORS[Math.floor(seeded(i, seed + 3) * PARTICLE_COLORS.length)]!,
      shape: (['circle', 'square', 'star'] as const)[Math.floor(seeded(i, seed + 4) * 3)]!,
      rotate: (seeded(i, seed + 5) - 0.5) * 720,
      delay: seeded(i, seed + 6) * 0.12,
      duration: 0.9 + seeded(i, seed + 7) * 0.6,
    };
  });
}

export default function CelebrationOverlay() {
  const key = useUiStore((s) => s.celebrationKey);
  const reduce = useReducedMotion();

  return (
    <AnimatePresence>
      {key > 0 && (
        <CelebrationBurst key={key} seed={key} reduce={!!reduce} />
      )}
    </AnimatePresence>
  );
}

function CelebrationBurst({ seed, reduce }: { seed: number; reduce: boolean }) {
  const particles = useMemo(() => makeParticles(seed), [seed]);
  const celebrate = useUiStore((s) => s.celebrationKey);

  // Auto-dismiss by incrementing a local fade state — actually handled by parent key cycle.
  // We animate for ~1.6s then exit via a scheduled re-trigger; but simpler: exit when new key fires.
  // For an auto-dismiss, use a timed state:
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      // Reset key back to 0 so AnimatePresence exits
      useUiStore.setState({ celebrationKey: 0 });
    }, reduce ? 600 : 1600);
    return () => window.clearTimeout(timeout);
  }, [celebrate, reduce]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Warm radial glow */}
      <motion.div
        aria-hidden
        className="absolute w-80 h-80 rounded-full"
        style={{
          background:
            'radial-gradient(circle, var(--theme-primary-glow) 0%, transparent 70%)',
        }}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1.6, opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />

      {/* Bodhi celebrating */}
      <motion.div
        initial={{ scale: 0, rotate: -12, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 18 }}
        className="relative"
      >
        <GuideMascot pose="celebrate" size="xl" glow animate={!reduce} />
      </motion.div>

      {/* Particle burst */}
      {!reduce &&
        particles.map((p, i) => {
          const dx = Math.cos(p.angle) * p.distance;
          const dy = Math.sin(p.angle) * p.distance;
          return (
            <motion.div
              key={i}
              className="absolute"
              style={{ left: '50%', top: '50%' }}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0, rotate: 0 }}
              animate={{
                x: dx,
                y: dy + 60, // slight gravity at end
                opacity: [0, 1, 1, 0],
                scale: [0, p.scale, p.scale * 0.9, 0],
                rotate: p.rotate,
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                ease: [0.22, 0.61, 0.36, 1],
                times: [0, 0.15, 0.7, 1],
              }}
            >
              <Particle shape={p.shape} color={p.color} />
            </motion.div>
          );
        })}
    </motion.div>
  );
}

function Particle({ shape, color }: { shape: Particle['shape']; color: string }) {
  if (shape === 'circle') {
    return (
      <div
        className="rounded-full"
        style={{ width: 10, height: 10, background: color, boxShadow: `0 0 8px ${color}` }}
      />
    );
  }
  if (shape === 'square') {
    return (
      <div
        className="rounded-sm"
        style={{ width: 9, height: 9, background: color, boxShadow: `0 0 6px ${color}` }}
      />
    );
  }
  // Star
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }}>
      <path d="M12 2 L14.4 9.2 L22 9.6 L16 14.2 L17.8 21.6 L12 17.4 L6.2 21.6 L8 14.2 L2 9.6 L9.6 9.2 Z" />
    </svg>
  );
}
