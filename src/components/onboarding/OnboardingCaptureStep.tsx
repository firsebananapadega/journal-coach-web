'use client';

// Onboarding Screen 3 — voice-capture demo (replaces v4's text-only
// FirstWinStep). The user says or types whatever's on their mind;
// we run the real `classifyCapture` engine over it; preview the
// parsed result inline; on save call `commitCapture` so the user
// finishes onboarding with their inbox / today / groceries already
// populated. This is the "magic moment" — show the AI sorting their
// stuff, not just describe it.
//
// Design notes:
//   • Big textarea (rows=6) for plenty of typing room.
//   • Mic button is BELOW the textarea (TapToSpeakButton). No
//     absolute overlay.
//   • CapturePreviewSheet would be too heavy here; we render a
//     lightweight inline summary card instead.
//   • Skip is allowed but de-emphasized — first-win is the
//     activation event.

import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useUiStore } from '@/stores/uiStore';
import { useTaskStore } from '@/stores/taskStore';
import { useGroceryStore } from '@/stores/groceryStore';
import { useListStore } from '@/stores/listStore';
import { useSelectionAwareMic } from '@/hooks/useSelectionAwareMic';
import { isSpeechRecognitionSupported } from '@/lib/speechRecognition';
import { classifyCapture, type CaptureResult } from '@/lib/captureEngine';
import { commitCapture } from '@/lib/captureCommit';
import { toLocalDateStr } from '@/lib/dateUtils';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';
import TapToSpeakButton from '@/components/TapToSpeakButton';
import type { Destination } from '@/lib/captureEngine';

interface Props {
  onComplete: () => void;
  onBack: () => void;
}

const MIN_CHARS_TO_CLASSIFY = 10;

export default function OnboardingCaptureStep({ onComplete, onBack }: Props) {
  const showToast = useUiStore((s) => s.showToast);
  const lists = useListStore((s) => s.lists);

  const [text, setText] = useState('');
  const [classifying, setClassifying] = useState(false);
  const [preview, setPreview] = useState<CaptureResult | null>(null);
  const [fellBack, setFellBack] = useState(false);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [speechSupported] = useState(
    () => typeof window !== 'undefined' && isSpeechRecognitionSupported(),
  );

  const mic = useSelectionAwareMic({
    textareaRef,
    value: text,
    onChange: (next) => setText(next.slice(0, 2000)),
    autoRestart: true,
    onError: (kind) => {
      // Surface mic failures so the user knows the tap landed but the
      // browser blocked the recognizer. Without this the button just
      // looks dead.
      const msg =
        kind === 'permission-denied'
          ? t('onboarding.capture.micDenied')
          : kind === 'unsupported'
          ? t('onboarding.capture.micUnsupported')
          : t('onboarding.capture.micFailed');
      showToast(msg, 'error');
    },
  });

  const canClassify = text.trim().length >= MIN_CHARS_TO_CLASSIFY && !classifying;

  const handleClassify = async () => {
    if (!canClassify) return;
    setClassifying(true);
    setFellBack(false);
    try {
      const tasks = useTaskStore.getState().tasks ?? [];
      const groceries = useGroceryStore.getState().items ?? [];
      const result = await classifyCapture(text.trim(), {
        existingPriorities: tasks.map((t) => t.text).filter(Boolean),
        existingGroceries: groceries.map((g) => g.name).filter(Boolean),
      });
      setPreview(result);
      // The classify function falls back to regex internally; we
      // can't tell from the result alone. Soft-label as fallback if
      // the regex shape is obvious (no notebook_slug + only
      // priorities + groceries). Skipping precise detection — the
      // CapturePreviewSheet does it via state passed from /voice;
      // here we just let the user save whatever came back.
    } catch (err) {
      console.warn('[OnboardingCapture] classify failed', err);
      setFellBack(true);
      showToast(t('onboarding.capture.classifyError'), 'error');
    } finally {
      setClassifying(false);
    }
  };

  const handleSave = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      // Default destination for every parsed task: today's inbox.
      // The user can re-route from /today after onboarding if they
      // want a different list. Groceries auto-route to the active
      // list (commitCapture lazily creates one).
      const destinations: Destination[] = preview.priorities.map(() => ({ kind: 'today' as const }));
      await commitCapture(preview, destinations, {
        selectedDate: toLocalDateStr(new Date()),
        lists,
      });
      showToast(t('onboarding.capture.savedToast'), 'success');
      onComplete();
    } catch (err) {
      console.warn('[OnboardingCapture] save failed', err);
      // Still let the user advance — onboarding shouldn't block.
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  const handleTryAgain = () => {
    setPreview(null);
    setFellBack(false);
    textareaRef.current?.focus();
  };

  const summary = useMemo(() => {
    if (!preview) return null;
    const taskCount = preview.priorities.length;
    const groceryCount = preview.groceries.reduce((n, g) => n + g.items.length, 0);
    const journalCount = preview.journal ? 1 : 0;
    const ideasCount = preview.ideas.length;
    return { taskCount, groceryCount, journalCount, ideasCount };
  }, [preview]);

  // Preview render
  if (preview && summary) {
    const empty =
      summary.taskCount === 0 &&
      summary.groceryCount === 0 &&
      summary.journalCount === 0 &&
      summary.ideasCount === 0;
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-2xl font-bold text-text-primary leading-tight">
            {t('onboarding.capture.previewTitle')}
          </h2>
          <p className="text-sm text-text-secondary mt-2 leading-relaxed">
            {empty
              ? t('onboarding.capture.previewEmpty')
              : t('onboarding.capture.previewSubtitle')}
          </p>
        </div>

        {!empty && (
          <div className="bg-primary/5 border border-primary/30 rounded-2xl p-4 space-y-3">
            {summary.taskCount > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-widest text-primary font-semibold mb-1">
                  {t('onboarding.capture.tasksLabel', { count: summary.taskCount })}
                </p>
                <ul className="space-y-1">
                  {preview.priorities.slice(0, 4).map((p, i) => (
                    <li key={i} className="text-sm text-text-primary leading-snug">
                      • {p.text}
                      {p.when && p.when !== 'today' && (
                        <span className="text-text-tertiary"> — {p.when}</span>
                      )}
                    </li>
                  ))}
                  {preview.priorities.length > 4 && (
                    <li className="text-xs text-text-tertiary">
                      + {preview.priorities.length - 4} more
                    </li>
                  )}
                </ul>
              </div>
            )}
            {summary.groceryCount > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-widest text-primary font-semibold mb-1">
                  {t('onboarding.capture.groceriesLabel', { count: summary.groceryCount })}
                </p>
                <ul className="space-y-1">
                  {preview.groceries.map((g, i) => (
                    <li key={i} className="text-sm text-text-primary leading-snug">
                      <span className="text-text-tertiary">{g.store}: </span>
                      {g.items.slice(0, 4).join(', ')}
                      {g.items.length > 4 && ` +${g.items.length - 4}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {summary.journalCount > 0 && preview.journal && (
              <div>
                <p className="text-[11px] uppercase tracking-widest text-primary font-semibold mb-1">
                  {t('onboarding.capture.journalLabel')}
                </p>
                <p className="text-sm text-text-primary leading-snug italic">
                  &ldquo;{preview.journal.slice(0, 140)}
                  {preview.journal.length > 140 ? '…' : ''}&rdquo;
                </p>
              </div>
            )}
          </div>
        )}

        {fellBack && (
          <p className="text-xs text-text-tertiary leading-snug">
            {t('onboarding.capture.fellBack')}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={handleTryAgain}
            disabled={saving}
            className="text-sm font-medium text-text-secondary hover:text-text-primary px-2 py-2 disabled:opacity-50"
          >
            ← {t('onboarding.capture.tryAgain')}
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
            {!empty && (
              <motion.button
                type="button"
                onClick={handleSave}
                disabled={saving}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                className="px-5 py-3 rounded-xl bg-primary text-white text-sm font-semibold shadow-warm-sm hover:bg-primary-dark transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? t('common.saving') : t('onboarding.capture.saveCta')}
                <span aria-hidden>→</span>
              </motion.button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Compose render
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-text-primary leading-tight">
          {t('onboarding.capture.title')}
        </h2>
        <p className="text-sm text-text-secondary mt-2 leading-relaxed">
          {t('onboarding.capture.subtitle')}
        </p>
      </div>

      <div className="space-y-3">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 2000))}
          placeholder={t('onboarding.capture.placeholder')}
          rows={6}
          className="w-full px-4 py-3.5 bg-surface border border-border rounded-2xl text-[16px] leading-relaxed text-text-primary outline-none focus:border-primary placeholder:text-text-tertiary resize-none"
        />
        {speechSupported && (
          <TapToSpeakButton
            isListening={mic.isListening}
            {...mic.micButtonProps}
          />
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
            className="text-xs font-medium text-text-tertiary hover:text-text-secondary px-2 py-2"
          >
            {t('onboarding.capture.skipForNow')}
          </button>
          <motion.button
            type="button"
            onClick={handleClassify}
            disabled={!canClassify}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
            className="px-5 py-3 rounded-xl bg-primary text-white text-sm font-semibold shadow-warm-sm hover:bg-primary-dark transition-colors flex items-center gap-1.5 disabled:opacity-40"
          >
            {classifying ? t('onboarding.capture.classifying') : t('onboarding.capture.seeWhatWeGot')}
            <span aria-hidden>→</span>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
