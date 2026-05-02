'use client';

// 4-step WOOP flow — full-screen sheet shown when the user taps
// "Make a change" on /home (Pulse tab).
//
// Flow:
//   Step 1 — Wish: "What do you want to change?"
//   Step 2 — Outcome: "If it works out, what does it look like?"
//   Step 3 — Obstacles: 1–3 user-identified obstacles
//   Step 4 — Plan: LLM-generated if-then per obstacle, editable
//
// Why 4 steps split across screens vs. one long form: research on
// the WOOP framework specifically calls out that contrasting wish
// against obstacle (mental contrasting) is the active ingredient.
// Splitting forces the user to actually consider each piece rather
// than skim a single form.

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUiStore } from '@/stores/uiStore';
import { usePlanStore } from '@/stores/planStore';
import { generateWoopPlans, type WoopGeneratedItem } from '@/lib/woopGenerator';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';
import { useSelectionAwareMic } from '@/hooks/useSelectionAwareMic';
import { isSpeechRecognitionSupported } from '@/lib/speechRecognition';

const MAX_OBSTACLES = 3;

interface Props {
  open: boolean;
  onClose: () => void;
}

type Step = 'wish' | 'outcome' | 'obstacles' | 'plan';

/** Inline tap-to-speak button. Same shape as the one in PresenceCapture
 *  so users get a consistent affordance everywhere mic input is offered.
 *  Spread the hook's micButtonProps onto it. */
function MicButton({
  isListening,
  className,
  ...rest
}: {
  isListening: boolean;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  return (
    <button
      type="button"
      aria-label={
        isListening
          ? t('template.stopRecording')
          : t('template.tapToSpeak')
      }
      className={`absolute top-1/2 right-2.5 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-warm-sm ${
        isListening
          ? 'bg-error text-white scale-105'
          : 'bg-surface border border-border text-text-secondary hover:text-primary hover:border-primary/50'
      } ${className ?? ''}`}
      {...rest}
    >
      {isListening ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
      )}
    </button>
  );
}

export default function WoopSheet({ open, onClose }: Props) {
  const showToast = useUiStore((s) => s.showToast);
  const createPlan = usePlanStore((s) => s.createPlan);

  const [step, setStep] = useState<Step>('wish');
  const [wish, setWish] = useState('');
  const [outcome, setOutcome] = useState('');
  const [obstacles, setObstacles] = useState<string[]>(['']);
  const [generated, setGenerated] = useState<WoopGeneratedItem[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  // Track which item the user has tapped "Different idea" on so we
  // only regenerate that one when refining.
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);

  // Speech-recognition support detection — keeps mic buttons hidden
  // on browsers without Web Speech (e.g. desktop Firefox).
  const [speechSupported] = useState(
    () => typeof window !== 'undefined' && isSpeechRecognitionSupported(),
  );

  // Refs for the per-field mic hooks. The wish + obstacle fields are
  // <input>s but we cast the refs to HTMLTextAreaElement because the
  // hook only touches .value / selection, which are shared between
  // input and textarea.
  const wishInputRef = useRef<HTMLInputElement | null>(null);
  const outcomeTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const obstacleRef0 = useRef<HTMLInputElement | null>(null);
  const obstacleRef1 = useRef<HTMLInputElement | null>(null);
  const obstacleRef2 = useRef<HTMLInputElement | null>(null);
  const obstacleRefs = [obstacleRef0, obstacleRef1, obstacleRef2];

  // Lock body scroll while open. Reset state on close.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  useEffect(() => {
    if (open) return;
    setStep('wish');
    setWish('');
    setOutcome('');
    setObstacles(['']);
    setGenerated(null);
  }, [open]);

  const handleNext = async () => {
    if (step === 'wish') {
      if (!wish.trim()) return;
      setStep('outcome');
    } else if (step === 'outcome') {
      if (!outcome.trim()) return;
      setStep('obstacles');
    } else if (step === 'obstacles') {
      const filled = obstacles.map((o) => o.trim()).filter(Boolean);
      if (filled.length === 0) return;
      setObstacles(filled);
      setGenerating(true);
      try {
        const items = await generateWoopPlans({
          wish: wish.trim(),
          outcome: outcome.trim(),
          obstacles: filled,
        });
        setGenerated(items);
        setStep('plan');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Generation failed', 'error');
      } finally {
        setGenerating(false);
      }
    }
  };

  const handleBack = () => {
    if (step === 'outcome') setStep('wish');
    else if (step === 'obstacles') setStep('outcome');
    else if (step === 'plan') setStep('obstacles');
  };

  const updateObstacle = (idx: number, value: string) => {
    setObstacles((prev) => prev.map((o, i) => (i === idx ? value : o)));
  };
  const addObstacle = () => {
    if (obstacles.length >= MAX_OBSTACLES) return;
    setObstacles((prev) => [...prev, '']);
  };
  const removeObstacle = (idx: number) => {
    if (obstacles.length <= 1) return;
    setObstacles((prev) => prev.filter((_, i) => i !== idx));
  };

  // Per-field mic hooks. Defined AFTER updateObstacle so each
  // onChange closure captures the live mutator. `useSelectionAwareMic`
  // re-binds onChange via a ref on every render, so re-creating the
  // closure here is harmless. Pre-allocate three obstacle slots
  // (matching MAX_OBSTACLES) so we don't violate the rules of hooks.
  const wishMic = useSelectionAwareMic({
    textareaRef: wishInputRef as unknown as React.RefObject<HTMLTextAreaElement>,
    value: wish,
    onChange: (next) => setWish(next.slice(0, 80)),
  });
  const outcomeMic = useSelectionAwareMic({
    textareaRef: outcomeTextareaRef,
    value: outcome,
    onChange: (next) => setOutcome(next.slice(0, 240)),
    autoRestart: true,
  });
  const obstacleMic0 = useSelectionAwareMic({
    textareaRef: obstacleRef0 as unknown as React.RefObject<HTMLTextAreaElement>,
    value: obstacles[0] ?? '',
    onChange: (next) => updateObstacle(0, next.slice(0, 100)),
  });
  const obstacleMic1 = useSelectionAwareMic({
    textareaRef: obstacleRef1 as unknown as React.RefObject<HTMLTextAreaElement>,
    value: obstacles[1] ?? '',
    onChange: (next) => updateObstacle(1, next.slice(0, 100)),
  });
  const obstacleMic2 = useSelectionAwareMic({
    textareaRef: obstacleRef2 as unknown as React.RefObject<HTMLTextAreaElement>,
    value: obstacles[2] ?? '',
    onChange: (next) => updateObstacle(2, next.slice(0, 100)),
  });
  const obstacleMics = [obstacleMic0, obstacleMic1, obstacleMic2];

  const updateGenerated = (idx: number, value: string) => {
    setGenerated((prev) =>
      prev ? prev.map((g, i) => (i === idx ? { ...g, if_then: value } : g)) : prev,
    );
  };

  const updateReminderTime = (idx: number, value: string | null) => {
    setGenerated((prev) =>
      prev ? prev.map((g, i) => (i === idx ? { ...g, reminder_time: value } : g)) : prev,
    );
  };

  const regenerateOne = async (idx: number) => {
    if (!generated) return;
    setRegeneratingIdx(idx);
    try {
      // Single-obstacle regeneration. Cheaper than re-running the
      // whole batch and lets the user iterate on one item without
      // disturbing the others.
      const items = await generateWoopPlans({
        wish: wish.trim(),
        outcome: outcome.trim(),
        obstacles: [generated[idx]!.obstacle],
      });
      if (items[0]) {
        setGenerated((prev) =>
          prev ? prev.map((g, i) => (i === idx ? items[0]! : g)) : prev,
        );
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Couldn’t regenerate', 'error');
    } finally {
      setRegeneratingIdx(null);
    }
  };

  const handleSave = async () => {
    if (!generated || generated.length === 0) return;
    const trimmed = generated
      .map((g) => ({
        obstacle_text: g.obstacle.trim(),
        if_then_text: g.if_then.trim(),
        reminder_time: g.reminder_time ?? null,
      }))
      .filter((g) => g.obstacle_text && g.if_then_text);
    if (trimmed.length === 0) return;
    setSaving(true);
    try {
      const plan = await createPlan({
        wish: wish.trim(),
        outcome: outcome.trim(),
        obstacles: trimmed,
      });
      if (plan) {
        showToast(t('plans.savedToast'), 'success');
        onClose();
      } else {
        showToast(t('plans.saveFailed'), 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const stepIdx = ['wish', 'outcome', 'obstacles', 'plan'].indexOf(step);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/60"
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            initial={prefersReducedMotion ? undefined : { y: '100%' }}
            animate={prefersReducedMotion ? undefined : { y: 0 }}
            exit={prefersReducedMotion ? undefined : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed inset-x-0 bottom-0 top-0 z-[70] bg-bg flex flex-col"
          >
            {/* Header — close button + step progress */}
            <div
              className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-border shrink-0"
              style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
            >
              <button
                type="button"
                onClick={step === 'wish' ? onClose : handleBack}
                className="text-text-secondary hover:text-text-primary text-sm font-medium px-2 py-1"
              >
                {step === 'wish' ? t('common.cancel') : t('common.back')}
              </button>
              <div className="flex gap-1.5">
                {['wish', 'outcome', 'obstacles', 'plan'].map((s, i) => (
                  <span
                    key={s}
                    className={`h-1.5 rounded-full transition-all ${
                      i === stepIdx
                        ? 'w-6 bg-primary'
                        : i < stepIdx
                        ? 'w-2 bg-primary/60'
                        : 'w-2 bg-border'
                    }`}
                  />
                ))}
              </div>
              <div className="w-12" />
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 pt-6 pb-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={prefersReducedMotion ? undefined : { opacity: 0, x: 12 }}
                  animate={prefersReducedMotion ? undefined : { opacity: 1, x: 0 }}
                  exit={prefersReducedMotion ? undefined : { opacity: 0, x: -12 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="max-w-md mx-auto"
                >
                  {step === 'wish' && (
                    <>
                      <h2 className="text-2xl font-bold text-text-primary leading-snug mb-2">
                        {t('plans.wishTitle')}
                      </h2>
                      <p className="text-sm text-text-secondary leading-relaxed mb-5">
                        {t('plans.wishHint')}
                      </p>
                      <div className="relative">
                        <input
                          ref={wishInputRef}
                          type="text"
                          value={wish}
                          onChange={(e) => setWish(e.target.value.slice(0, 80))}
                          placeholder={t('plans.wishPlaceholder')}
                          autoFocus
                          className="w-full pl-4 pr-14 py-3.5 bg-surface border border-border rounded-xl text-[17px] text-text-primary outline-none focus:border-primary placeholder:text-text-tertiary"
                        />
                        {speechSupported && (
                          <MicButton
                            isListening={wishMic.isListening}
                            {...wishMic.micButtonProps}
                          />
                        )}
                      </div>
                      <p className="text-xs text-text-tertiary mt-2">
                        {wish.length} / 80
                      </p>
                    </>
                  )}

                  {step === 'outcome' && (
                    <>
                      <h2 className="text-2xl font-bold text-text-primary leading-snug mb-2">
                        {t('plans.outcomeTitle')}
                      </h2>
                      <p className="text-sm text-text-secondary leading-relaxed mb-5">
                        {t('plans.outcomeHint')}
                      </p>
                      <div className="relative">
                        <textarea
                          ref={outcomeTextareaRef}
                          value={outcome}
                          onChange={(e) => setOutcome(e.target.value.slice(0, 240))}
                          placeholder={t('plans.outcomePlaceholder')}
                          autoFocus
                          rows={4}
                          className="w-full pl-4 pr-14 py-3.5 bg-surface border border-border rounded-xl text-[17px] leading-relaxed text-text-primary outline-none focus:border-primary placeholder:text-text-tertiary resize-none"
                        />
                        {speechSupported && (
                          <MicButton
                            isListening={outcomeMic.isListening}
                            {...outcomeMic.micButtonProps}
                            className="!top-3 !translate-y-0"
                          />
                        )}
                      </div>
                      <p className="text-xs text-text-tertiary mt-2">
                        {outcome.length} / 240
                      </p>
                    </>
                  )}

                  {step === 'obstacles' && (
                    <>
                      <h2 className="text-2xl font-bold text-text-primary leading-snug mb-2">
                        {t('plans.obstaclesTitle')}
                      </h2>
                      <p className="text-sm text-text-secondary leading-relaxed mb-5">
                        {t('plans.obstaclesHint')}
                      </p>
                      <div className="space-y-3">
                        {obstacles.map((o, i) => {
                          const slotRef = obstacleRefs[i];
                          const slotMic = obstacleMics[i];
                          return (
                            <div key={i} className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <input
                                  ref={slotRef}
                                  type="text"
                                  value={o}
                                  onChange={(e) => updateObstacle(i, e.target.value.slice(0, 100))}
                                  placeholder={
                                    i === 0
                                      ? t('plans.obstaclePlaceholder1')
                                      : t('plans.obstaclePlaceholderMore')
                                  }
                                  autoFocus={i === obstacles.length - 1}
                                  className="w-full pl-4 pr-12 py-3 bg-surface border border-border rounded-xl text-[15px] text-text-primary outline-none focus:border-primary placeholder:text-text-tertiary"
                                />
                                {speechSupported && slotMic && (
                                  <MicButton
                                    isListening={slotMic.isListening}
                                    {...slotMic.micButtonProps}
                                    className="!w-8 !h-8 !right-2"
                                  />
                                )}
                              </div>
                              {obstacles.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeObstacle(i)}
                                  className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-text-tertiary hover:text-error hover:bg-error/10 transition-colors"
                                  aria-label={t('common.remove')}
                                >
                                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {obstacles.length < MAX_OBSTACLES && (
                        <button
                          type="button"
                          onClick={addObstacle}
                          className="mt-3 text-sm font-semibold text-primary hover:underline"
                        >
                          + {t('plans.addObstacle')}
                        </button>
                      )}
                    </>
                  )}

                  {step === 'plan' && generated && (
                    <>
                      <h2 className="text-2xl font-bold text-text-primary leading-snug mb-2">
                        {t('plans.planTitle')}
                      </h2>
                      <p className="text-sm text-text-secondary leading-relaxed mb-5">
                        {t('plans.planHint')}
                      </p>
                      <div className="space-y-3">
                        {generated.map((g, i) => {
                          const isRegen = regeneratingIdx === i;
                          return (
                            <div
                              key={i}
                              className="bg-surface border border-border rounded-2xl p-4 space-y-2"
                            >
                              <p className="text-[11px] uppercase tracking-widest text-text-tertiary font-semibold">
                                {t('plans.obstacleLabel')}
                              </p>
                              <p className="text-sm text-text-secondary italic leading-snug">
                                &ldquo;{g.obstacle}&rdquo;
                              </p>
                              <div className="h-px bg-border/60" />
                              <textarea
                                value={g.if_then}
                                onChange={(e) => updateGenerated(i, e.target.value.slice(0, 240))}
                                rows={2}
                                disabled={isRegen}
                                className="w-full px-3 py-2 bg-bg border border-border rounded-xl text-[15px] leading-relaxed text-text-primary outline-none focus:border-primary resize-none disabled:opacity-50"
                              />

                              {/* Daily reminder. Pre-filled when the
                                  generator inferred a clock-time from
                                  the obstacle (sleep, wind-down). User
                                  can clear or pick a different time;
                                  the cron pings them at this local
                                  time daily until the plan is closed. */}
                              <div className="flex items-center justify-between gap-2 pt-1">
                                <label className="flex items-center gap-2 text-xs text-text-secondary font-medium">
                                  <span aria-hidden>⏰</span>
                                  <span>{t('plans.remindMe')}</span>
                                </label>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="time"
                                    value={g.reminder_time ?? ''}
                                    onChange={(e) =>
                                      updateReminderTime(i, e.target.value || null)
                                    }
                                    disabled={isRegen}
                                    aria-label={t('plans.remindMe')}
                                    className="px-2 py-1 bg-bg border border-border rounded-lg text-sm text-text-primary outline-none focus:border-primary disabled:opacity-50"
                                  />
                                  {g.reminder_time && (
                                    <button
                                      type="button"
                                      onClick={() => updateReminderTime(i, null)}
                                      disabled={isRegen}
                                      aria-label={t('plans.clearReminder')}
                                      className="w-7 h-7 flex items-center justify-center rounded-full text-text-tertiary hover:text-error hover:bg-error/10 transition-colors disabled:opacity-50"
                                    >
                                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => regenerateOne(i)}
                                  disabled={isRegen}
                                  className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                                >
                                  {isRegen ? t('plans.regenerating') : t('plans.differentIdea')}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-text-tertiary text-center mt-5 leading-snug">
                        {t('plans.disclaimer')}
                      </p>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer CTA */}
            <div
              className="px-5 pt-3 border-t border-border shrink-0"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              {step !== 'plan' ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={
                    generating ||
                    (step === 'wish' && !wish.trim()) ||
                    (step === 'outcome' && !outcome.trim()) ||
                    (step === 'obstacles' && obstacles.every((o) => !o.trim()))
                  }
                  className="w-full max-w-md mx-auto block py-3.5 bg-primary text-white font-semibold rounded-2xl shadow-warm-md hover:bg-primary-dark transition-colors disabled:opacity-40"
                >
                  {generating ? t('plans.generating') : t('common.next')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !generated}
                  className="w-full max-w-md mx-auto block py-3.5 bg-primary text-white font-semibold rounded-2xl shadow-warm-md hover:bg-primary-dark transition-colors disabled:opacity-40"
                >
                  {saving ? t('common.saving') : t('plans.savePlan')}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
