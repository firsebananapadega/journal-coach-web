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

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUiStore } from '@/stores/uiStore';
import { usePlanStore } from '@/stores/planStore';
import { generateWoopPlans, type WoopGeneratedItem } from '@/lib/woopGenerator';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';

const MAX_OBSTACLES = 3;

interface Props {
  open: boolean;
  onClose: () => void;
}

type Step = 'wish' | 'outcome' | 'obstacles' | 'plan';

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

  const updateGenerated = (idx: number, value: string) => {
    setGenerated((prev) =>
      prev ? prev.map((g, i) => (i === idx ? { ...g, if_then: value } : g)) : prev,
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
      .map((g) => ({ obstacle_text: g.obstacle.trim(), if_then_text: g.if_then.trim() }))
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
                      <input
                        type="text"
                        value={wish}
                        onChange={(e) => setWish(e.target.value.slice(0, 80))}
                        placeholder={t('plans.wishPlaceholder')}
                        autoFocus
                        className="w-full px-4 py-3.5 bg-surface border border-border rounded-xl text-[17px] text-text-primary outline-none focus:border-primary placeholder:text-text-tertiary"
                      />
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
                      <textarea
                        value={outcome}
                        onChange={(e) => setOutcome(e.target.value.slice(0, 240))}
                        placeholder={t('plans.outcomePlaceholder')}
                        autoFocus
                        rows={4}
                        className="w-full px-4 py-3.5 bg-surface border border-border rounded-xl text-[17px] leading-relaxed text-text-primary outline-none focus:border-primary placeholder:text-text-tertiary resize-none"
                      />
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
                        {obstacles.map((o, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={o}
                              onChange={(e) => updateObstacle(i, e.target.value.slice(0, 100))}
                              placeholder={
                                i === 0
                                  ? t('plans.obstaclePlaceholder1')
                                  : t('plans.obstaclePlaceholderMore')
                              }
                              autoFocus={i === obstacles.length - 1}
                              className="flex-1 px-4 py-3 bg-surface border border-border rounded-xl text-[15px] text-text-primary outline-none focus:border-primary placeholder:text-text-tertiary"
                            />
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
                        ))}
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
