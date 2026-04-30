'use client';

// GratitudeSuggestionSheet — bottom sheet that surfaces 1–2
// gratitude excerpts pulled from a freshly-saved journal entry and
// asks the user whether to mirror them into the Gratitude notebook.
//
// Per the research synthesis (suggest, don't act): we never auto-
// write gratitude entries. The user always sees this sheet first;
// tapping Save creates the gratitude entries, Skip dismisses.
//
// First-time variant: when profile.gratitude_intro_seen is false,
// the sheet leads with a one-time explainer card before the
// excerpt checklist. Tapping Save / Skip in that state also flips
// gratitude_intro_seen to true so the explainer never shows again.

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';

interface Props {
  /** The gratitude excerpts to suggest. ≤2 by contract. */
  excerpts: string[];
  /** When true, shows the one-time intro explainer above the
   *  excerpt list. Should be false after the first time the user
   *  acknowledges the feature. */
  showIntro: boolean;
  onSave: (acceptedExcerpts: string[]) => void | Promise<void>;
  onSkip: () => void;
  onClose: () => void;
}

export default function GratitudeSuggestionSheet({
  excerpts,
  showIntro,
  onSave,
  onSkip,
  onClose,
}: Props) {
  // Per-excerpt selection state. Default: every excerpt is selected
  // (the user opts OUT by unchecking, then taps Save). Aligns with
  // "minimal taps to accept the recommendation" while preserving
  // user agency.
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(excerpts.map((_, i) => i)),
  );
  const [busy, setBusy] = useState(false);

  // Body scroll lock while the sheet is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const accepted = excerpts.filter((_, i) => selected.has(i));
      await onSave(accepted);
    } finally {
      setBusy(false);
    }
  };

  const hasSelection = selected.size > 0;

  return (
    <AnimatePresence>
      <motion.div
        key="gratitude-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/50"
        onClick={onClose}
      />
      <motion.div
        key="gratitude-sheet"
        initial={prefersReducedMotion ? undefined : { y: '100%' }}
        animate={prefersReducedMotion ? undefined : { y: 0 }}
        exit={prefersReducedMotion ? undefined : { y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="fixed inset-x-0 bottom-0 z-[70] bg-bg rounded-t-3xl shadow-warm-xl max-h-[85vh] overflow-y-auto"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div
          className="px-6 pt-2 pb-6 max-w-md mx-auto space-y-5"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
          {/* One-time explainer — first ever fire of the feature.
              Tells the user this exists, that nothing happens
              automatically, and where to disable it. */}
          {showIntro && (
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-2">
              <p className="text-base font-semibold text-text-primary flex items-center gap-2">
                <span aria-hidden>✨</span>
                {t('gratitude.introTitle')}
              </p>
              <p className="text-sm text-text-secondary leading-relaxed">
                {t('gratitude.introBody')}
              </p>
            </div>
          )}

          <div>
            <h2 className="text-xl font-bold text-text-primary">
              {t('gratitude.suggestionTitle')}
            </h2>
            <p className="text-sm text-text-secondary mt-1 leading-snug">
              {t('gratitude.suggestionHint')}
            </p>
          </div>

          {/* Excerpt list — checkboxes default to all selected. */}
          <ul className="space-y-2">
            {excerpts.map((excerpt, i) => {
              const isOn = selected.has(i);
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    aria-pressed={isOn}
                    className={`w-full flex items-start gap-3 p-3 rounded-2xl border text-left transition-colors ${
                      isOn
                        ? 'bg-primary/8 border-primary'
                        : 'bg-surface border-border hover:border-primary/40'
                    }`}
                  >
                    <span
                      className={`shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isOn
                          ? 'bg-primary border-primary text-white'
                          : 'border-border'
                      }`}
                      aria-hidden
                    >
                      {isOn && <span className="text-xs font-bold">✓</span>}
                    </span>
                    <span className="flex-1 text-[15px] leading-relaxed text-text-primary italic">
                      &ldquo;{excerpt}&rdquo;
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onSkip}
              disabled={busy}
              className="flex-1 py-3 rounded-2xl border border-border text-text-primary text-sm font-medium hover:bg-surface-elevated disabled:opacity-50"
            >
              {t('gratitude.skip')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy || !hasSelection}
              className="flex-1 py-3 rounded-2xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? t('common.saving') : t('gratitude.save')}
            </button>
          </div>

          {/* Settings hint — only on the first fire so we don't
              repeat it forever. Tells the user where to turn this
              off entirely if they hate it. */}
          {showIntro && (
            <p className="text-xs text-text-tertiary text-center leading-snug">
              {t('gratitude.settingsHint')}
            </p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
