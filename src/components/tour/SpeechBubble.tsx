'use client';

// Speech bubble — rounded card with a small tail pointing toward the
// mascot. Text swaps via AnimatePresence so line changes (e.g. nudge
// variant) feel like a beat, not a reload.

import { motion, AnimatePresence } from 'framer-motion';

interface SpeechBubbleProps {
  text: string;
  tail?: 'bottom-left' | 'none';
}

export default function SpeechBubble({ text, tail = 'bottom-left' }: SpeechBubbleProps) {
  return (
    <div className="relative max-w-[320px]">
      <AnimatePresence mode="wait">
        <motion.div
          key={text}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="relative bg-surface-elevated border border-border rounded-2xl px-4 py-3.5 shadow-warm-md"
        >
          <p className="text-base text-text-primary leading-snug">{text}</p>
          {tail === 'bottom-left' && (
            <span
              aria-hidden
              className="absolute -bottom-1.5 left-5 w-3 h-3 rotate-45 bg-surface-elevated border-r border-b border-border"
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
