'use client';

// Onboarding Screen 4 — first-win activation.
//
// Single textarea + voice mic + save-and-continue. The PROMPT is
// auto-picked from the user's Screen 2 selections so the user
// doesn't make a second decision (research-backed: each extra
// micro-decision drops completion ~15%).
//
// Priority ladder:
//   gratitude  → 'One thing you're grateful for today'
//   plans/goals → 'What's one thing you want to change?'
//   feelings   → 'How are you feeling right now?'
//   habit      → 'How is your morning starting?'
//   exploring/skipped/no-pick → 'What's on your mind today?'
//
// On save, the entry lands in the right notebook depending on
// variant — gratitude into Gratitude (entry_type='gratitude' with
// metadata.gratitude_items), plans into the Plans notebook
// (entry_type='plan'), everything else as freeform into Journal.
//
// Skip is allowed but de-emphasized — the first-win is the
// activation event we're protecting.

import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useJournalStore } from '@/stores/journalStore';
import { useNotebookStore } from '@/stores/notebookStore';
import type { IntentChip } from '@/stores/authStore';
import { useSelectionAwareMic } from '@/hooks/useSelectionAwareMic';
import { isSpeechRecognitionSupported } from '@/lib/speechRecognition';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';

type Variant = 'gratitude' | 'plan' | 'feelings' | 'habit' | 'default';

interface Props {
  /** The user's intent-chip picks from Screen 2. Drives the prompt
   *  selection via priority ladder. */
  picks: IntentChip[];
  onComplete: () => void;
  onBack: () => void;
}

function pickVariant(picks: IntentChip[]): Variant {
  if (picks.includes('gratitude')) return 'gratitude';
  if (picks.includes('plans') || picks.includes('goals')) return 'plan';
  if (picks.includes('feelings')) return 'feelings';
  if (picks.includes('reflection_habit')) return 'habit';
  return 'default';
}

function promptKey(variant: Variant): string {
  switch (variant) {
    case 'gratitude': return 'onboarding.firstWin.gratitude.prompt';
    case 'plan': return 'onboarding.firstWin.plan.prompt';
    case 'feelings': return 'onboarding.firstWin.feelings.prompt';
    case 'habit': return 'onboarding.firstWin.habit.prompt';
    default: return 'onboarding.firstWin.default.prompt';
  }
}

function placeholderKey(variant: Variant): string {
  switch (variant) {
    case 'gratitude': return 'onboarding.firstWin.gratitude.placeholder';
    case 'plan': return 'onboarding.firstWin.plan.placeholder';
    case 'feelings': return 'onboarding.firstWin.feelings.placeholder';
    case 'habit': return 'onboarding.firstWin.habit.placeholder';
    default: return 'onboarding.firstWin.default.placeholder';
  }
}

function MicGlyph({ isListening }: { isListening: boolean }) {
  return isListening ? (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  ) : (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

export default function FirstWinStep({ picks, onComplete, onBack }: Props) {
  const variant = useMemo(() => pickVariant(picks), [picks]);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [speechSupported] = useState(
    () => typeof window !== 'undefined' && isSpeechRecognitionSupported(),
  );

  const mic = useSelectionAwareMic({
    textareaRef,
    value: text,
    onChange: (next) => setText(next.slice(0, 500)),
    autoRestart: true,
  });

  const createEntry = useJournalStore((s) => s.createEntry);
  const upsertGratitude = useJournalStore((s) => s.upsertTodayGratitude);

  const canSave = text.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const trimmed = text.trim();
      if (variant === 'gratitude') {
        // Make sure the gratitude system notebook exists, then write
        // a structured 1-item gratitude entry. The daily card on the
        // notebook page picks it up automatically.
        const nb = await useNotebookStore
          .getState()
          .ensureGratitudeNotebook('system');
        await upsertGratitude({
          notebookId: nb.id,
          items: [{ what: trimmed, why: '' }],
        });
      } else if (variant === 'plan') {
        // Save the wish as a draft plan-typed journal entry in the
        // Plans notebook. The user finishes the WOOP via the Plans
        // notebook later — this is just the seed.
        const nb = await useNotebookStore.getState().ensurePlansNotebook();
        await createEntry(
          {
            entry_type: 'plan',
            content_text: trimmed,
            notebook_id: nb.id,
            word_count: trimmed.split(/\s+/).filter(Boolean).length,
            metadata: { plan_event: 'wish_seed', source: 'onboarding' },
          },
          { skipAutoDetect: true },
        );
      } else {
        // Freeform — lands in Journal (default notebook resolution
        // inside createEntry handles this).
        await createEntry({
          entry_type: 'freeform',
          content_text: trimmed,
          word_count: trimmed.split(/\s+/).filter(Boolean).length,
          metadata: { source: 'onboarding' },
        });
      }
      onComplete();
    } catch (err) {
      console.warn('[FirstWinStep] save failed', err);
      // Still let the user advance — onboarding shouldn't block on
      // a network hiccup.
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-text-primary leading-tight">
          {t(promptKey(variant))}
        </h2>
        <p className="text-sm text-text-secondary mt-2 leading-relaxed">
          {t('onboarding.firstWin.subtitle')}
        </p>
      </div>

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          placeholder={t(placeholderKey(variant))}
          autoFocus
          rows={4}
          className="w-full pl-4 pr-14 py-3.5 bg-surface border border-border rounded-2xl text-[16px] leading-relaxed text-text-primary outline-none focus:border-primary placeholder:text-text-tertiary resize-none"
        />
        {speechSupported && (
          <button
            type="button"
            {...mic.micButtonProps}
            aria-label={
              mic.isListening
                ? t('template.stopRecording')
                : t('template.tapToSpeak')
            }
            className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-warm-sm ${
              mic.isListening
                ? 'bg-error text-white scale-105'
                : 'bg-surface border border-border text-text-secondary hover:text-primary hover:border-primary/50'
            }`}
          >
            <MicGlyph isListening={mic.isListening} />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-text-secondary hover:text-text-primary px-2 py-2"
        >
          ← {t('common.back')}
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onComplete}
            disabled={saving}
            className="text-xs font-medium text-text-tertiary hover:text-text-secondary px-2 py-2 disabled:opacity-50"
          >
            {t('common.skip')}
          </button>
          <motion.button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
            className="px-5 py-3 rounded-xl bg-primary text-white text-sm font-semibold shadow-warm-sm hover:bg-primary-dark transition-colors flex items-center gap-1.5 disabled:opacity-40"
          >
            {saving ? t('common.saving') : t('onboarding.firstWin.saveCta')}
            <span aria-hidden>→</span>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
