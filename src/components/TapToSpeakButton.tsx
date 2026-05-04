'use client';

// Shared "tap to speak" button. Sits BELOW a textarea / input — not
// inside it. Bigger touch target, more text room, more obvious
// affordance than the previous absolute-overlay mic.
//
// Consumers wire `useSelectionAwareMic` themselves (it owns the
// textarea ref + value/onChange contract); this button just spreads
// the hook's `micButtonProps` and renders the right glyph + label
// for the current `isListening` state.
//
// Exclusions (per user direction): not used by CaptureMicButton (the
// nav FAB) or the BookPage composer flow — those keep their own
// shapes.

import { t } from '@/lib/translations';

interface Props {
  isListening: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onClick: () => void;
  /** Override the idle label. Default 'Tap to speak'. */
  label?: string;
  /** Override the listening label. Default 'Listening…'. */
  listeningLabel?: string;
  /** Compact variant — smaller padding for use inside dense layouts
   *  (e.g. WoopSheet's per-obstacle slots). */
  size?: 'default' | 'compact';
  /** Extra Tailwind classes — applied AFTER the variant defaults. */
  className?: string;
}

function MicGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function StopGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

export default function TapToSpeakButton({
  isListening,
  onPointerDown,
  onClick,
  label,
  listeningLabel,
  size = 'default',
  className = '',
}: Props) {
  const compact = size === 'compact';
  const idleClasses = compact
    ? 'py-2 text-xs gap-1.5'
    : 'py-2.5 text-sm gap-2';
  const listeningClasses = isListening
    ? 'bg-error/10 text-error border-error/40'
    : 'bg-surface text-text-secondary border-border hover:text-primary hover:border-primary/40';

  // Plain <button> rather than motion.button on purpose: framer-motion's
  // `whileTap` attaches its own pointerdown/pointerup listeners and on
  // iOS Safari that can consume the user gesture before recognition
  // .start() runs, leaving the mic-permission prompt to never appear.
  // CSS `active:scale-[0.98]` gives the same visual feedback without
  // touching the gesture pipeline.
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onClick={onClick}
      aria-label={
        isListening
          ? (listeningLabel ?? t('tapToSpeak.listening'))
          : (label ?? t('tapToSpeak.idle'))
      }
      className={`w-full rounded-xl border flex items-center justify-center font-medium transition-colors active:scale-[0.98] ${idleClasses} ${listeningClasses} ${className}`}
    >
      {isListening ? <StopGlyph size={compact ? 12 : 14} /> : <MicGlyph size={compact ? 14 : 16} />}
      <span>
        {isListening
          ? (listeningLabel ?? t('tapToSpeak.listening'))
          : (label ?? t('tapToSpeak.idle'))}
      </span>
    </button>
  );
}
