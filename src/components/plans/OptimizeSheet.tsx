'use client';

// Plan optimization sheet. Shown when the user taps "Optimize" on
// the active plan card after 5+ completion events have been logged.
//
// The sheet shows working/not-working stats from the user's actual
// behavior (not LLM judgment) and offers three pre-defined
// directions. Each direction triggers a single regeneration — the
// research call is clear that open-ended chat is the failure mode,
// so we constrain to 3 forks + one optional refinement.

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Plan, PlanItem, PlanItemCompletion } from '@/stores/planStore';
import { usePlanStore } from '@/stores/planStore';
import { useUiStore } from '@/stores/uiStore';
import { generateWoopPlans, type WoopGeneratedItem } from '@/lib/woopGenerator';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';

interface Props {
  plan: Plan;
  items: PlanItem[];
  recentCompletions: PlanItemCompletion[];
  onClose: () => void;
}

type Direction = 'tighten' | 'newAngle' | 'startOver';

export default function OptimizeSheet({ plan, items, recentCompletions, onClose }: Props) {
  const replaceItems = usePlanStore((s) => s.replaceItems);
  const showToast = useUiStore((s) => s.showToast);

  const [generated, setGenerated] = useState<WoopGeneratedItem[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState<Direction | null>(null);

  // Body scroll lock.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Stats per item: completions out of total events. Sort items into
  // "working" (≥60% completion) vs "not working" buckets for the
  // user's mental model. Avg-of-1 is fine — they'll get more data
  // by using the plan more.
  const stats = useMemo(() => {
    return items.map((item) => {
      const events = recentCompletions.filter((c) => c.plan_item_id === item.id);
      const done = events.filter((e) => e.completed).length;
      const total = events.length;
      const ratio = total === 0 ? 0 : done / total;
      return {
        item,
        done,
        total,
        ratio,
        isWorking: total >= 2 && ratio >= 0.6,
        isNotWorking: total >= 2 && ratio < 0.4,
      };
    });
  }, [items, recentCompletions]);

  const working = stats.filter((s) => s.isWorking);
  const notWorking = stats.filter((s) => s.isNotWorking);

  const runDirection = async (dir: Direction) => {
    setDirection(dir);
    setGenerating(true);
    try {
      if (dir === 'tighten') {
        // Drop the not-working items, keep working ones, regenerate
        // any "uncertain" items (insufficient data) with the original
        // obstacle.
        const keep = stats.filter((s) => !s.isNotWorking);
        const items = await generateWoopPlans({
          wish: plan.wish,
          outcome: plan.outcome,
          obstacles: keep.map((s) => s.item.obstacle_text),
        });
        setGenerated(items);
      } else if (dir === 'newAngle') {
        // Keep working items as-is; regenerate ONLY the not-working
        // ones with the same obstacle text (different framing).
        const items: WoopGeneratedItem[] = [];
        for (const s of stats) {
          if (s.isNotWorking) {
            const re = await generateWoopPlans({
              wish: plan.wish,
              outcome: plan.outcome,
              obstacles: [s.item.obstacle_text],
            });
            items.push(re[0] ?? { obstacle: s.item.obstacle_text, if_then: s.item.if_then_text });
          } else {
            items.push({ obstacle: s.item.obstacle_text, if_then: s.item.if_then_text });
          }
        }
        setGenerated(items);
      } else {
        // Start over — regenerate all items from scratch with the
        // original obstacles. The user can then refine by editing
        // text inline before saving.
        const obstacleTexts = items.map((it) => it.obstacle_text);
        const regen = await generateWoopPlans({
          wish: plan.wish,
          outcome: plan.outcome,
          obstacles: obstacleTexts,
        });
        setGenerated(regen);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Couldn’t regenerate', 'error');
      setDirection(null);
    } finally {
      setGenerating(false);
    }
  };

  const updateGenerated = (idx: number, value: string) => {
    setGenerated((prev) =>
      prev ? prev.map((g, i) => (i === idx ? { ...g, if_then: value } : g)) : prev,
    );
  };

  const handleSave = async () => {
    if (!generated || generated.length === 0) return;
    setSaving(true);
    try {
      const trimmed = generated
        .map((g) => ({ obstacle_text: g.obstacle.trim(), if_then_text: g.if_then.trim() }))
        .filter((g) => g.obstacle_text && g.if_then_text);
      if (trimmed.length === 0) {
        setSaving(false);
        return;
      }
      await replaceItems(plan.id, trimmed);
      showToast(t('plans.optimizedToast'), 'success');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
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
        className="fixed inset-x-0 bottom-0 z-[70] bg-bg rounded-t-3xl shadow-warm-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div
          className="px-6 pt-2 pb-6 max-w-md mx-auto space-y-5"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
          <div>
            <h2 className="text-xl font-bold text-text-primary">
              {t('plans.optimizeTitle')}
            </h2>
            <p className="text-sm text-text-secondary mt-1 leading-relaxed">
              {t('plans.optimizeSubtitle')}
            </p>
          </div>

          {/* Direction selection — only show until user has picked. */}
          {!generated && (
            <>
              {/* Stats */}
              <div className="space-y-3">
                {working.length > 0 && (
                  <div className="bg-success/8 border border-success/30 rounded-xl p-3 space-y-1">
                    <p className="text-xs font-semibold text-success uppercase tracking-wider">
                      {t('plans.working')}
                    </p>
                    {working.map((s) => (
                      <p key={s.item.id} className="text-sm text-text-primary leading-snug">
                        ✓ {s.item.if_then_text} — {s.done} / {s.total}
                      </p>
                    ))}
                  </div>
                )}
                {notWorking.length > 0 && (
                  <div className="bg-amber-500/8 border border-amber-500/30 rounded-xl p-3 space-y-1">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                      {t('plans.notWorking')}
                    </p>
                    {notWorking.map((s) => (
                      <p key={s.item.id} className="text-sm text-text-primary leading-snug">
                        ◌ {s.item.if_then_text} — {s.done} / {s.total}
                      </p>
                    ))}
                  </div>
                )}
                {working.length === 0 && notWorking.length === 0 && (
                  <p className="text-sm text-text-tertiary italic">
                    {t('plans.notEnoughData')}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-text-primary">
                  {t('plans.pickDirection')}
                </p>
                <button
                  type="button"
                  onClick={() => void runDirection('tighten')}
                  disabled={generating || notWorking.length === 0}
                  className="w-full text-left px-4 py-3 rounded-2xl border border-border bg-surface hover:border-primary/50 transition-colors disabled:opacity-40"
                >
                  <p className="text-sm font-semibold text-text-primary">
                    {t('plans.tighten')}
                  </p>
                  <p className="text-xs text-text-tertiary mt-0.5 leading-snug">
                    {t('plans.tightenHint')}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => void runDirection('newAngle')}
                  disabled={generating || notWorking.length === 0}
                  className="w-full text-left px-4 py-3 rounded-2xl border border-border bg-surface hover:border-primary/50 transition-colors disabled:opacity-40"
                >
                  <p className="text-sm font-semibold text-text-primary">
                    {t('plans.newAngle')}
                  </p>
                  <p className="text-xs text-text-tertiary mt-0.5 leading-snug">
                    {t('plans.newAngleHint')}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => void runDirection('startOver')}
                  disabled={generating}
                  className="w-full text-left px-4 py-3 rounded-2xl border border-border bg-surface hover:border-primary/50 transition-colors disabled:opacity-40"
                >
                  <p className="text-sm font-semibold text-text-primary">
                    {t('plans.startOver')}
                  </p>
                  <p className="text-xs text-text-tertiary mt-0.5 leading-snug">
                    {t('plans.startOverHint')}
                  </p>
                </button>
              </div>
            </>
          )}

          {/* Review generated items, edit inline, save. */}
          {generated && (
            <>
              <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                {direction === 'tighten' && t('plans.tightenedHeader')}
                {direction === 'newAngle' && t('plans.newAngleHeader')}
                {direction === 'startOver' && t('plans.startedOverHeader')}
              </p>
              <div className="space-y-3">
                {generated.map((g, i) => (
                  <div
                    key={i}
                    className="bg-surface border border-border rounded-2xl p-3 space-y-2"
                  >
                    <p className="text-xs italic text-text-tertiary leading-snug">
                      &ldquo;{g.obstacle}&rdquo;
                    </p>
                    <textarea
                      value={g.if_then}
                      onChange={(e) => updateGenerated(i, e.target.value.slice(0, 240))}
                      rows={2}
                      className="w-full px-3 py-2 bg-bg border border-border rounded-xl text-[14px] leading-relaxed text-text-primary outline-none focus:border-primary resize-none"
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || generating}
              className="flex-1 py-3 rounded-2xl border border-border text-text-primary text-sm font-medium hover:bg-surface-elevated disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            {generated && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || generating}
                className="flex-1 py-3 rounded-2xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-40"
              >
                {saving ? t('common.saving') : t('plans.savePlan')}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
