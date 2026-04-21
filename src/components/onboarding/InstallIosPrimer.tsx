'use client';

// iOS "Add to Home Screen" primer — Framer-choreographed scene.
//
// Self-contained, no asset files. Renders a stylized iPhone mockup
// with Safari chrome and animates an animated cursor that:
//   (a) taps the Share icon,
//   (b) a bottom-sheet rises,
//   (c) "Add to Home Screen" row highlights,
//   (d) cursor taps the row,
//   (e) fade + loop.
//
// Loop duration: 6s. Respects prefers-reduced-motion (freezes on
// the share-sheet-open frame).

import { motion, useReducedMotion } from 'framer-motion';
import Mascot from '@/components/mascot/Mascot';
import { t } from '@/lib/translations';

const LOOP = 6; // seconds

// Times (as fractions of LOOP) pulled into constants so the three
// concurrent animations stay synced.
const T = {
  cursorRest: 0,
  cursorAtShare: 0.16,
  cursorTapShare: 0.22,
  sheetUp: 0.28,
  cursorAtAdd: 0.5,
  cursorTapAdd: 0.56,
  fadeOut: 0.78,
  reset: 0.92,
  end: 1,
};

export default function InstallIosPrimer() {
  const reduce = useReducedMotion();

  return (
    <div
      className="relative mx-auto my-2"
      style={{ width: 232, height: 420 }}
      aria-label={t('onboarding.install.iosBody')}
    >
      {/* iPhone bezel */}
      <div
        className="absolute inset-0 rounded-[34px] border border-border"
        style={{ background: '#0f1012', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}
      >
        {/* Screen */}
        <div className="absolute inset-[6px] rounded-[28px] overflow-hidden bg-bg flex flex-col">
          {/* Mock URL bar (top) */}
          <div className="shrink-0 pt-2.5 pb-1.5 px-3 flex items-center justify-center gap-1">
            <div className="text-[9px] text-text-tertiary truncate">journalcoach.app</div>
          </div>

          {/* Page content — warm gradient with a small Bodhi */}
          <div
            className="flex-1 flex items-center justify-center relative"
            style={{
              background:
                'linear-gradient(180deg, var(--theme-primary-glow, rgba(245,166,35,0.18)) 0%, transparent 70%)',
            }}
          >
            <div style={{ width: 56, height: 56 }}>
              <Mascot guide="bodhi" pose="meditate" size="sm" />
            </div>
          </div>

          {/* Safari bottom chrome */}
          <div
            className="shrink-0 h-9 flex items-center justify-around px-3 relative"
            style={{ background: 'rgba(40,40,44,0.95)' }}
          >
            <NavArrow direction="left" />
            <NavArrow direction="right" />
            {/* Share icon — pulses when cursor reaches it */}
            <motion.div
              initial={false}
              animate={
                reduce
                  ? undefined
                  : {
                      scale: [1, 1, 1.18, 1, 1, 1],
                    }
              }
              transition={{
                duration: LOOP,
                times: [0, T.cursorAtShare, T.cursorTapShare, T.cursorTapShare + 0.03, T.sheetUp, 1],
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              <ShareIcon />
            </motion.div>
            <BookIcon />
            <TabsIcon />
          </div>

          {/* Share sheet overlay — rises from bottom */}
          <motion.div
            className="absolute left-2 right-2 bottom-2 rounded-2xl overflow-hidden"
            style={{ background: 'rgba(44,44,46,0.98)', height: 180 }}
            initial={{ y: 220, opacity: 0 }}
            animate={
              reduce
                ? { y: 0, opacity: 1 }
                : {
                    y: [220, 220, 0, 0, 0, 220, 220],
                    opacity: [0, 0, 1, 1, 1, 0, 0],
                  }
            }
            transition={{
              duration: LOOP,
              times: [0, T.cursorTapShare, T.sheetUp, T.cursorAtAdd, T.cursorTapAdd + 0.05, T.fadeOut, 1],
              repeat: reduce ? 0 : Infinity,
              ease: 'easeInOut',
            }}
          >
            {/* drag indicator */}
            <div className="flex justify-center pt-2">
              <div className="w-8 h-1 rounded-full bg-white/30" />
            </div>
            {/* App row */}
            <div className="flex items-center gap-2 px-3 pt-3 pb-4 border-b border-white/5">
              <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
                <div className="w-5 h-5">
                  <Mascot guide="bodhi" pose="idle" size="sm" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-white/90 truncate">JournalCoach</div>
                <div className="text-[8px] text-white/40 truncate">journalcoach.app</div>
              </div>
            </div>
            {/* Action rows — "Add to Home Screen" gets the spotlight */}
            <motion.div
              className="flex items-center gap-2 px-3 py-2.5"
              animate={
                reduce
                  ? undefined
                  : {
                      backgroundColor: [
                        'rgba(255,255,255,0)',
                        'rgba(255,255,255,0)',
                        'rgba(255,255,255,0.08)',
                        'rgba(255,255,255,0.08)',
                        'rgba(255,255,255,0)',
                      ],
                    }
              }
              transition={{
                duration: LOOP,
                times: [0, T.sheetUp + 0.05, T.cursorAtAdd, T.cursorTapAdd + 0.05, T.fadeOut],
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-white text-[11px]">+</div>
              <div className="text-[10px] text-white">
                {t('onboarding.install.iosStep2')}
              </div>
            </motion.div>
            <div className="flex items-center gap-2 px-3 py-2.5 opacity-50">
              <div className="w-6 h-6 rounded bg-white/10" />
              <div className="text-[10px] text-white/70">Copy</div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5 opacity-50">
              <div className="w-6 h-6 rounded bg-white/10" />
              <div className="text-[10px] text-white/70">Find on Page</div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Animated finger cursor — layered above everything */}
      <motion.div
        className="absolute pointer-events-none"
        style={{ left: 0, top: 0, width: 28, height: 28 }}
        initial={{ x: 190, y: 380, scale: 1, opacity: 0 }}
        animate={
          reduce
            ? { opacity: 0 }
            : {
                x: [190, 118, 118, 118, 118, 118, 190, 190],
                y: [380, 368, 368, 368, 232, 232, 380, 380],
                scale: [1, 1, 0.82, 1, 1, 0.82, 1, 1],
                opacity: [0, 1, 1, 1, 1, 1, 0, 0],
              }
        }
        transition={{
          duration: LOOP,
          times: [0, T.cursorAtShare, T.cursorTapShare, T.cursorTapShare + 0.04, T.cursorAtAdd, T.cursorTapAdd, T.fadeOut, 1],
          repeat: reduce ? 0 : Infinity,
          ease: 'easeInOut',
        }}
      >
        <FingerCursor />
      </motion.div>
    </div>
  );
}

// ── Inline iconography ──

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12m0-12l-4 4m4-4l4 4M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"
        stroke="#60a5fa"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavArrow({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ transform: direction === 'right' ? 'scaleX(-1)' : undefined }}
    >
      <path d="M15 18l-6-6 6-6" stroke="#6b7280" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z" stroke="#6b7280" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TabsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="#6b7280" strokeWidth={2} />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="#6b7280" strokeWidth={2} />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="#6b7280" strokeWidth={2} />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="#6b7280" strokeWidth={2} />
    </svg>
  );
}

function FingerCursor() {
  // A stylized pointing-hand glyph — kept small and neutral so it
  // reads across skin tones. White fill with soft shadow.
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))' }}>
      <circle cx="14" cy="14" r="12" fill="white" opacity="0.98" />
      <path
        d="M14 8v8l3 3"
        stroke="#111"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
