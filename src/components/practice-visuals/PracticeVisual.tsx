'use client';

// Per-intention practice visual. Dispatches on the practice's slug to
// pick a themed animation that matches what the practice is about
// (e.g. footsteps for "invite more movement," crescent for "rest,"
// heart pulse for "be kinder to myself"). Falls back to a category-
// generic visual if the slug isn't recognized.
//
// Each visual uses the intention's category color palette so the six
// categories still feel like a coherent family even though every
// individual intention has its own motion personality.
//
// `paused` freezes the animation by switching `animate` to a static
// resting target. `breathCycle` (when set on the active step) drives
// the rhythm for any visual that breathes.

import { motion } from 'framer-motion';
import type { IntentionCategory } from '@/lib/presetIntentions';
import type { BreathCycle } from '@/lib/intentionPractices';
import { prefersReducedMotion } from '@/lib/motionVariants';

interface Props {
  slug: string;
  category: IntentionCategory;
  breathCycle?: BreathCycle;
  paused?: boolean;
}

// Category palette — all visuals route their colors through here so a
// presence-themed practice always reads emerald, body always orange.
const COLORS: Record<
  IntentionCategory,
  { tint: string; ring: string; accent: string; deep: string; stroke: string }
> = {
  presence:   { tint: 'bg-emerald-500/15', ring: 'ring-emerald-400/40', accent: 'bg-emerald-400/30', deep: 'bg-emerald-500/40', stroke: 'stroke-emerald-400' },
  body:       { tint: 'bg-orange-500/15',  ring: 'ring-orange-400/40',  accent: 'bg-orange-400/30',  deep: 'bg-orange-500/40',  stroke: 'stroke-orange-400'  },
  mind:       { tint: 'bg-blue-500/15',    ring: 'ring-blue-400/40',    accent: 'bg-blue-400/30',    deep: 'bg-blue-500/40',    stroke: 'stroke-blue-400'    },
  connection: { tint: 'bg-pink-500/15',    ring: 'ring-pink-400/40',    accent: 'bg-pink-400/30',    deep: 'bg-pink-500/40',    stroke: 'stroke-pink-400'    },
  growth:     { tint: 'bg-amber-500/15',   ring: 'ring-amber-400/40',   accent: 'bg-amber-400/30',   deep: 'bg-amber-500/40',   stroke: 'stroke-amber-400'   },
  purpose:    { tint: 'bg-purple-500/15',  ring: 'ring-purple-400/40',  accent: 'bg-purple-400/30',  deep: 'bg-purple-500/40',  stroke: 'stroke-purple-400'  },
};

function breathTimings(cycle: BreathCycle | undefined) {
  // Always a smooth, continuous grow→shrink. The peak lands at the end
  // of inhale; the hold + exhale phases combine into the shrink so
  // the visual never sits flat (which the user reads as "stalled" or
  // "broken"). Each cycle = one full breath = one full grow + shrink.
  if (!cycle) {
    return {
      duration: 8,
      scale: [1, 1.2, 1],
      times: [0, 0.5, 1],
      opacity: [0.35, 0.6, 0.35],
    };
  }
  const total = cycle.inhaleSec + (cycle.holdSec ?? 0) + cycle.exhaleSec;
  const inhaleEnd = cycle.inhaleSec / total;
  return {
    duration: total,
    scale: [1, 1.22, 1],
    times: [0, inhaleEnd, 1],
    opacity: [0.35, 0.6, 0.35],
  };
}

// Helper: total seconds for a breath cycle (or fallback if not set).
// Used by visuals that should sync their grow/shrink rhythm to the
// step's breathCycle when one is provided.
function breathDuration(cycle: BreathCycle | undefined, fallback: number): number {
  if (!cycle) return fallback;
  return cycle.inhaleSec + (cycle.holdSec ?? 0) + cycle.exhaleSec;
}

export default function PracticeVisual(props: Props) {
  if (prefersReducedMotion) {
    return (
      <div
        className={`absolute w-72 h-72 rounded-full ${COLORS[props.category].tint}`}
        aria-hidden
      />
    );
  }
  // Slug-based dispatch — each intention has a themed visual.
  // Unknown slug falls back to the category-default.
  switch (props.slug) {
    // ── Presence ─────────────────────────────────────────────────
    case 'invite-more-stillness':         return <PulsingCircle {...props} />;
    case 'be-more-present-in-my-daily-life': return <SensoryDots {...props} />;
    case 'slow-down-when-i-feel-rushed':  return <SlowingRipples {...props} />;
    case 'be-kinder-to-myself':           return <HeartPulse {...props} />;
    // ── Body ─────────────────────────────────────────────────────
    case 'invite-more-movement-into-my-day':  return <Footsteps {...props} />;
    case 'nourish-my-body-with-care':         return <WaterDrop {...props} />;
    case 'prioritize-rest-and-recovery':      return <CrescentMoon {...props} />;
    case 'listen-to-what-my-body-is-telling-me': return <InnerScan {...props} />;
    // ── Mind ─────────────────────────────────────────────────────
    case 'understand-my-own-patterns':            return <Spiral {...props} />;
    case 'challenge-thoughts-that-hold-me-back':  return <RotatingSquare {...props} />;
    case 'build-a-daily-reflection-practice':     return <FlowingLines {...props} />;
    case 'cultivate-gratitude':                   return <OverflowingBowl {...props} />;
    // ── Connection ───────────────────────────────────────────────
    case 'be-more-present-with-the-people-i-love': return <TwoHearts {...props} />;
    case 'nurture-one-relationship-more-deeply':   return <OrbitingOrbs {...props} />;
    case 'listen-more-fix-less':                   return <ReceivingRipples {...props} />;
    case 'express-what-i-feel':                    return <OutwardRipples {...props} />;
    // ── Growth ───────────────────────────────────────────────────
    case 'read-something-meaningful-every-day':    return <FlowingLines {...props} />;
    case 'learn-something-new':                    return <Branches {...props} />;
    case 'spend-less-time-consuming-more-creating': return <CreativeSpiral {...props} />;
    case 'clarify-what-i-truly-value':             return <Compass {...props} />;
    // ── Purpose ──────────────────────────────────────────────────
    case 'do-work-that-matters-to-me':  return <AscendingBeam {...props} />;
    case 'lead-with-kindness':          return <RadiatingHeart {...props} />;
    case 'build-long-term-security':    return <TreeGrowth {...props} />;
    // Fallback
    default: return <PulsingCircle {...props} />;
  }
}

// ─── Visual components ─────────────────────────────────────────────

function PulsingCircle({ category, breathCycle, paused }: Props) {
  const { duration, scale, times, opacity } = breathTimings(breathCycle);
  return (
    <motion.div
      animate={paused ? { scale: 1, opacity: 0.4 } : { scale, opacity }}
      transition={{ duration, repeat: Infinity, ease: 'easeInOut', times }}
      className={`absolute w-72 h-72 rounded-full ${COLORS[category].tint}`}
      aria-hidden
    />
  );
}

// Five dots fading in sequence — one per sense (5-4-3-2-1 grounding).
function SensoryDots({ category, paused }: Props) {
  const c = COLORS[category];
  const dots = [0, 1, 2, 3, 4];
  // Lay the dots out around a circle so they read as "the senses"
  // rather than a row of bullets.
  const radius = 90;
  return (
    <div className="absolute w-72 h-72 flex items-center justify-center">
      {dots.map((i) => {
        const angle = (i / dots.length) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        return (
          <motion.div
            key={i}
            animate={paused ? { scale: 1, opacity: 0.3 } : { scale: [0.8, 1.4, 0.8], opacity: [0.3, 0.85, 0.3] }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 0.5,
            }}
            className={`absolute w-5 h-5 rounded-full ${c.accent}`}
            style={{ transform: `translate(${x}px, ${y}px)` }}
            aria-hidden
          />
        );
      })}
      <div className={`w-20 h-20 rounded-full ${c.tint}`} aria-hidden />
    </div>
  );
}

// Concentric circles that progressively slow down — mirrors "slow
// down when I feel rushed."
function SlowingRipples({ category, paused }: Props) {
  const c = COLORS[category];
  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={paused ? { scale: 1, opacity: 0.3 } : { scale: [0.6, 1.4], opacity: [0.55, 0] }}
          transition={{
            duration: 5 + i * 2, // 5s, 7s, 9s — visibly slowing
            repeat: Infinity,
            ease: 'easeOut',
            delay: i * 1.5,
          }}
          className={`absolute w-64 h-64 rounded-full ring-2 ${c.ring}`}
          aria-hidden
        />
      ))}
    </>
  );
}

// Heart shape that grows on inhale and shrinks on exhale. When the
// step has a breathCycle, the rhythm matches it; otherwise falls back
// to a gentle 6s pulse.
function HeartPulse({ category, breathCycle, paused }: Props) {
  const c = COLORS[category];
  const { duration, scale, times, opacity } = breathTimings(breathCycle);
  const fallbackDuration = breathCycle ? duration : 6;
  return (
    <motion.svg
      width="240"
      height="240"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`absolute ${c.stroke} text-emerald-400/60`}
      animate={paused ? { scale: 1, opacity: 0.4 } : { scale, opacity }}
      transition={{
        duration: fallbackDuration,
        repeat: Infinity,
        ease: 'easeInOut',
        times,
      }}
      aria-hidden
    >
      <path d="M12 21s-7-4.5-9.5-9C.5 8 3.5 4 7 4c2 0 3.5 1.2 5 3 1.5-1.8 3-3 5-3 3.5 0 6.5 4 4.5 8C19 16.5 12 21 12 21z" />
    </motion.svg>
  );
}

// Alternating dots stepping forward — "movement into my day."
function Footsteps({ category, paused }: Props) {
  const c = COLORS[category];
  return (
    <div className="absolute w-72 h-72 flex items-center justify-center overflow-hidden">
      {[0, 1, 2, 3].map((i) => (
        <motion.div
          key={i}
          animate={paused ? { x: 0, opacity: 0.3 } : { x: [-120, 120], opacity: [0, 0.7, 0] }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 1,
          }}
          className={`absolute w-6 h-9 rounded-full ${c.accent}`}
          style={{ top: i % 2 === 0 ? 'calc(50% - 24px)' : 'calc(50% + 8px)' }}
          aria-hidden
        />
      ))}
    </div>
  );
}

// A drop centered, ripples expanding outward — nourishment.
function WaterDrop({ category, paused }: Props) {
  const c = COLORS[category];
  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={paused ? { scale: 1, opacity: 0.3 } : { scale: [0.5, 1.6], opacity: [0.5, 0] }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'easeOut',
            delay: i * 1.3,
          }}
          className={`absolute w-56 h-56 rounded-full ring-2 ${c.ring}`}
          aria-hidden
        />
      ))}
      <motion.svg
        width="80"
        height="120"
        viewBox="0 0 80 120"
        fill="currentColor"
        className={`absolute text-orange-400/60`}
        animate={paused ? { y: 0, opacity: 0.5 } : { y: [-6, 6, -6], opacity: [0.55, 0.75, 0.55] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      >
        <path d="M40 10 C 60 50, 70 70, 40 110 C 10 70, 20 50, 40 10 Z" />
      </motion.svg>
    </>
  );
}

// Crescent moon, slowly breathing — rest and recovery. Honors the
// step's breathCycle when set so the inhale/exhale match.
function CrescentMoon({ category, breathCycle, paused }: Props) {
  const c = COLORS[category];
  const duration = breathDuration(breathCycle, 8);
  const inhaleEnd = breathCycle ? breathCycle.inhaleSec / duration : 0.5;
  return (
    <motion.svg
      width="240"
      height="240"
      viewBox="0 0 100 100"
      className={`absolute fill-orange-400/60`}
      animate={
        paused
          ? { scale: 1, rotate: 0, opacity: 0.4 }
          : {
              scale: [1, 1.1, 1],
              opacity: [0.4, 0.65, 0.4],
              rotate: [0, 12, 0],
            }
      }
      transition={{
        duration,
        repeat: Infinity,
        ease: 'easeInOut',
        times: [0, inhaleEnd, 1],
      }}
      aria-hidden
    >
      <path d="M65 25 a 35 35 0 1 0 0 50 a 26 26 0 1 1 0 -50 z" />
      {/* Faint background tint to read against the bg */}
      <circle cx="50" cy="50" r="48" className={c.tint.replace('bg-', 'fill-')} opacity="0.05" />
    </motion.svg>
  );
}

// Concentric pulsing circles inward — "listening" to the body.
function InnerScan({ category, paused }: Props) {
  const c = COLORS[category];
  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={paused ? { scale: 1, opacity: 0.3 } : { scale: [1.4, 0.6], opacity: [0, 0.5, 0] }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'easeIn',
            delay: i * 1.3,
          }}
          className={`absolute w-64 h-64 rounded-full ring-2 ${c.ring}`}
          aria-hidden
        />
      ))}
      <motion.div
        animate={paused ? { scale: 1 } : { scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        className={`absolute w-12 h-12 rounded-full ${c.deep}`}
        aria-hidden
      />
    </>
  );
}

// Spiral shape rotating — "patterns." Built with several rings at
// progressive radii rotating together.
function Spiral({ category, paused }: Props) {
  const c = COLORS[category];
  return (
    <motion.div
      animate={paused ? { rotate: 0 } : { rotate: 360 }}
      transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
      className="absolute w-72 h-72 flex items-center justify-center"
      aria-hidden
    >
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const r = 30 + i * 18;
        const angle = (i / 6) * Math.PI * 2;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        const size = 26 - i * 3;
        return (
          <div
            key={i}
            className={`absolute rounded-full ${c.accent}`}
            style={{ width: size, height: size, transform: `translate(${x}px, ${y}px)`, opacity: 0.8 - i * 0.1 }}
          />
        );
      })}
    </motion.div>
  );
}

// Two counter-rotating rounded squares — challenging thoughts that
// hold you back, the friction between two opposing patterns.
function RotatingSquare({ category, paused }: Props) {
  const c = COLORS[category];
  return (
    <>
      <motion.div
        animate={paused ? { rotate: 0, opacity: 0.4 } : { rotate: 360, opacity: [0.35, 0.55, 0.35] }}
        transition={{
          rotate: { duration: 24, repeat: Infinity, ease: 'linear' },
          opacity: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
        }}
        className={`absolute w-64 h-64 rounded-3xl ${c.tint}`}
        aria-hidden
      />
      <motion.div
        animate={paused ? { rotate: 0, opacity: 0.3 } : { rotate: -360, opacity: [0.25, 0.45, 0.25] }}
        transition={{
          rotate: { duration: 30, repeat: Infinity, ease: 'linear' },
          opacity: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
        }}
        className={`absolute w-48 h-48 rounded-3xl ${c.accent}`}
        aria-hidden
      />
    </>
  );
}

// Horizontal lines flowing left to right — pages, words, reflection.
function FlowingLines({ category, paused }: Props) {
  const c = COLORS[category];
  const lines = [0, 1, 2, 3, 4];
  return (
    <div className="absolute w-72 h-48 overflow-hidden">
      {lines.map((i) => (
        <motion.div
          key={i}
          animate={paused ? { x: 0, opacity: 0.4 } : { x: [-200, 200], opacity: [0, 0.5, 0] }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 1,
          }}
          className={`h-1.5 rounded-full ${c.accent} mb-2`}
          style={{
            width: 80 + (i % 3) * 30,
            marginLeft: i % 2 === 0 ? '20%' : '40%',
          }}
          aria-hidden
        />
      ))}
    </div>
  );
}

// A bowl curve filling and overflowing — gratitude.
function OverflowingBowl({ category, paused }: Props) {
  const c = COLORS[category];
  return (
    <div className="absolute w-72 h-72 flex items-center justify-center">
      <svg width="200" height="200" viewBox="0 0 100 100" aria-hidden>
        <defs>
          <clipPath id="bowl-clip">
            <path d="M20 50 Q 50 95, 80 50 L 80 100 L 20 100 Z" />
          </clipPath>
        </defs>
        <motion.rect
          x="20"
          y="50"
          width="60"
          height="50"
          className={`fill-blue-400/60`}
          clipPath="url(#bowl-clip)"
          animate={paused ? { y: 50 } : { y: [70, 35, 70] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <path
          d="M20 50 Q 50 95, 80 50"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          className={c.stroke}
        />
      </svg>
    </div>
  );
}

// Two hearts approaching each other — present with people I love.
function TwoHearts({ category, paused }: Props) {
  const c = COLORS[category];
  return (
    <div className="absolute w-72 h-40 flex items-center justify-center">
      <motion.svg
        width="80"
        height="80"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`absolute text-pink-400/70`}
        animate={paused ? { x: 0, scale: 1 } : { x: [-50, -10, -50], scale: [1, 1.1, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      >
        <path d="M12 21s-7-4.5-9.5-9C.5 8 3.5 4 7 4c2 0 3.5 1.2 5 3 1.5-1.8 3-3 5-3 3.5 0 6.5 4 4.5 8C19 16.5 12 21 12 21z" />
      </motion.svg>
      <motion.svg
        width="80"
        height="80"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`absolute text-pink-400/70`}
        animate={paused ? { x: 0, scale: 1 } : { x: [50, 10, 50], scale: [1, 1.1, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      >
        <path d="M12 21s-7-4.5-9.5-9C.5 8 3.5 4 7 4c2 0 3.5 1.2 5 3 1.5-1.8 3-3 5-3 3.5 0 6.5 4 4.5 8C19 16.5 12 21 12 21z" />
      </motion.svg>
      <div className={`absolute w-32 h-32 rounded-full ${c.tint} -z-10`} aria-hidden />
    </div>
  );
}

// Two orbs orbiting a shared center — nurturing one relationship.
function OrbitingOrbs({ category, paused }: Props) {
  const c = COLORS[category];
  return (
    <motion.div
      animate={paused ? { rotate: 0 } : { rotate: 360 }}
      transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
      className="absolute w-64 h-64 flex items-center justify-center"
      aria-hidden
    >
      <div
        className={`absolute w-12 h-12 rounded-full ${c.deep}`}
        style={{ transform: 'translateX(80px)' }}
      />
      <div
        className={`absolute w-12 h-12 rounded-full ${c.accent}`}
        style={{ transform: 'translateX(-80px)' }}
      />
      <div className={`w-6 h-6 rounded-full ${c.tint}`} />
    </motion.div>
  );
}

// Inward concentric ripples — listening, receiving signal.
function ReceivingRipples({ category, paused }: Props) {
  const c = COLORS[category];
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <motion.div
          key={i}
          animate={paused ? { scale: 1, opacity: 0.3 } : { scale: [1.6, 0.5], opacity: [0, 0.5, 0] }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: 'easeIn',
            delay: i * 1.2,
          }}
          className={`absolute w-64 h-64 rounded-full ring-2 ${c.ring}`}
          aria-hidden
        />
      ))}
      <div className={`absolute w-10 h-10 rounded-full ${c.deep}`} aria-hidden />
    </>
  );
}

// Outward asymmetric ripples — expressing what I feel.
function OutwardRipples({ category, paused }: Props) {
  const c = COLORS[category];
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <motion.div
          key={i}
          animate={paused ? { scale: 1, opacity: 0.3 } : { scale: [0.4, 1.6], opacity: [0.6, 0] }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: 'easeOut',
            delay: i * 1.2,
          }}
          className={`absolute w-64 h-40 rounded-full ring-2 ${c.ring}`}
          style={{ borderRadius: '50%' }}
          aria-hidden
        />
      ))}
      <div className={`absolute w-10 h-10 rounded-full ${c.deep}`} aria-hidden />
    </>
  );
}

// Branches expanding outward like roots/learning paths.
function Branches({ category, paused }: Props) {
  const c = COLORS[category];
  // Six branches at evenly spaced angles, growing outward.
  return (
    <div className="absolute w-72 h-72 flex items-center justify-center">
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const angle = (i / 6) * 360;
        return (
          <motion.div
            key={i}
            animate={paused ? { scaleY: 1, opacity: 0.4 } : { scaleY: [0, 1, 0.8, 0], opacity: [0, 0.7, 0.5, 0] }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 0.5,
            }}
            className={`absolute w-1 h-24 ${c.deep} origin-bottom rounded-full`}
            style={{ transform: `rotate(${angle}deg) translateY(-30px)` }}
            aria-hidden
          />
        );
      })}
      <div className={`absolute w-10 h-10 rounded-full ${c.tint}`} aria-hidden />
    </div>
  );
}

// A spiral that draws itself — creating, not consuming.
function CreativeSpiral({ category, paused }: Props) {
  const c = COLORS[category];
  return (
    <motion.svg
      width="240"
      height="240"
      viewBox="0 0 100 100"
      fill="none"
      className={c.stroke}
      animate={paused ? { rotate: 0 } : { rotate: 360 }}
      transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
      aria-hidden
    >
      <motion.path
        d="M 50 50 m 0 0 a 5 5 0 1 1 5 5 a 10 10 0 1 1 -10 10 a 15 15 0 1 1 15 15 a 20 20 0 1 1 -20 20 a 25 25 0 1 1 25 25"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        animate={paused ? { pathLength: 1 } : { pathLength: [0, 1, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', times: [0, 0.7, 1] }}
      />
    </motion.svg>
  );
}

// Compass with a needle that wanders, then settles — values clarity.
function Compass({ category, paused }: Props) {
  const c = COLORS[category];
  return (
    <div className="absolute w-72 h-72 flex items-center justify-center">
      <div className={`absolute w-56 h-56 rounded-full ring-2 ${c.ring}`} aria-hidden />
      <div className={`absolute w-44 h-44 rounded-full ${c.tint}`} aria-hidden />
      <motion.div
        animate={paused ? { rotate: 0 } : { rotate: [0, 80, -50, 30, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute w-1.5 h-32 origin-center"
        aria-hidden
      >
        <div className={`absolute top-0 left-0 w-full h-1/2 ${c.deep} rounded-full`} />
        <div className={`absolute bottom-0 left-0 w-full h-1/2 ${c.accent} rounded-full`} />
      </motion.div>
      <div className={`absolute w-3 h-3 rounded-full bg-text-primary`} aria-hidden />
    </div>
  );
}

// A column of ascending light — work that matters, upward energy.
function AscendingBeam({ category, paused }: Props) {
  const c = COLORS[category];
  return (
    <div className="absolute w-32 h-72 overflow-hidden flex items-end justify-center">
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          animate={paused ? { y: 0, opacity: 0.3 } : { y: [-0, -260], opacity: [0, 0.7, 0] }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: 'easeOut',
            delay: i * 1,
          }}
          className={`absolute bottom-0 w-3 h-12 rounded-full ${c.deep}`}
          style={{ left: `${20 + i * 15}%` }}
          aria-hidden
        />
      ))}
      <div className={`absolute bottom-0 w-32 h-3 rounded-t-full ${c.tint}`} aria-hidden />
    </div>
  );
}

// A heart with gentle outward radiating ripples — kindness leadership.
// Heart core honors breathCycle when set so it grows on inhale and
// shrinks on exhale.
function RadiatingHeart({ category, breathCycle, paused }: Props) {
  const c = COLORS[category];
  const heartDuration = breathDuration(breathCycle, 4);
  const heartTimes = breathCycle
    ? [0, breathCycle.inhaleSec / heartDuration, 1]
    : [0, 0.5, 1];
  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={paused ? { scale: 1, opacity: 0.3 } : { scale: [0.6, 1.6], opacity: [0.5, 0] }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: 'easeOut',
            delay: i * 1.5,
          }}
          className={`absolute w-56 h-56 rounded-full ring-2 ${c.ring}`}
          aria-hidden
        />
      ))}
      <motion.svg
        width="120"
        height="120"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`absolute text-purple-400/70`}
        animate={paused ? { scale: 1 } : { scale: [1, 1.18, 1], opacity: [0.6, 0.85, 0.6] }}
        transition={{ duration: heartDuration, repeat: Infinity, ease: 'easeInOut', times: heartTimes }}
        aria-hidden
      >
        <path d="M12 21s-7-4.5-9.5-9C.5 8 3.5 4 7 4c2 0 3.5 1.2 5 3 1.5-1.8 3-3 5-3 3.5 0 6.5 4 4.5 8C19 16.5 12 21 12 21z" />
      </motion.svg>
    </>
  );
}

// A tree growing — long-term security, rooted compounding. Honors the
// step's breathCycle when set so the canopy rises on inhale and falls
// on exhale.
function TreeGrowth({ category, breathCycle, paused }: Props) {
  const c = COLORS[category];
  const duration = breathDuration(breathCycle, 6);
  const inhaleEnd = breathCycle ? breathCycle.inhaleSec / duration : 0.5;
  const times = [0, inhaleEnd, 1];
  return (
    <div className="absolute w-72 h-72 flex items-end justify-center pb-4">
      {/* Trunk */}
      <motion.div
        animate={paused ? { scaleY: 1, opacity: 0.5 } : { scaleY: [0.6, 1, 0.6], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration, repeat: Infinity, ease: 'easeInOut', times }}
        className={`absolute bottom-0 w-3 h-32 ${c.deep} origin-bottom rounded-full`}
        aria-hidden
      />
      {/* Canopy */}
      <motion.div
        animate={paused ? { scale: 1 } : { scale: [0.8, 1.05, 0.8], opacity: [0.4, 0.6, 0.4] }}
        transition={{ duration, repeat: Infinity, ease: 'easeInOut', times }}
        className={`absolute bottom-24 w-40 h-40 rounded-full ${c.accent}`}
        aria-hidden
      />
      <motion.div
        animate={paused ? { scale: 1 } : { scale: [0.7, 0.95, 0.7], opacity: [0.3, 0.55, 0.3] }}
        transition={{ duration, repeat: Infinity, ease: 'easeInOut', times, delay: 0.5 }}
        className={`absolute bottom-32 w-28 h-28 rounded-full ${c.tint}`}
        aria-hidden
      />
    </div>
  );
}
