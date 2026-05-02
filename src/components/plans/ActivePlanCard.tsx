'use client';

// Active plan card on /home (Pulse tab). Shows the user's current
// plan + per-item daily checkboxes + Optimize affordance once
// enough completion data has accumulated.
//
// Optimize threshold: 5+ TOTAL check events (across all items, any
// boolean) — uses the recentCompletions array from planStore. This
// is behavioral signal, not calendar time, so a user who actively
// engages with their plan unlocks Optimize faster than someone who
// barely touches it. Aligns with the research finding that effect
// size grows with rehearsal.

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlanStore } from '@/stores/planStore';
import { useUiStore } from '@/stores/uiStore';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';
import { getLanguage } from '@/lib/language';
import OptimizeSheet from './OptimizeSheet';

/** Format "HH:MM" 24-hour as a 12-hour clock for display.
 *  "21:45" → "9:45 PM" (en-US) / "9:45 p.m." (es-MX). Returns the
 *  raw string if it doesn't parse so a malformed value can't crash
 *  the card. */
function formatReminderClock(hhmm: string): string {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return hhmm;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return hhmm;
  }
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return new Intl.DateTimeFormat(getLanguage(), {
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

const OPTIMIZE_THRESHOLD = 5;

export default function ActivePlanCard() {
  const active = usePlanStore((s) => s.active);
  const toggle = usePlanStore((s) => s.toggleTodayCompletion);
  const archivePlan = usePlanStore((s) => s.archivePlan);
  const showToast = useUiStore((s) => s.showToast);

  const [collapsed, setCollapsed] = useState(false);
  const [optimizeOpen, setOptimizeOpen] = useState(false);

  // Total completion events in the last 30 days, regardless of
  // success/failure. Drives the Optimize button enable state.
  const totalEvents = useMemo(() => {
    if (!active) return 0;
    return active.recentCompletions.length;
  }, [active]);

  if (!active) return null;
  const { plan, items, todayCompletions } = active;
  const optimizeReady = totalEvents >= OPTIMIZE_THRESHOLD;

  const handleDelete = async () => {
    const ok = window.confirm(t('plans.deleteConfirm'));
    if (!ok) return;
    await archivePlan(plan.id);
    showToast(t('plans.deletedToast'), 'info');
  };

  return (
    <motion.div
      layout
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-surface rounded-2xl border border-primary/20 shadow-warm-sm overflow-hidden"
    >
      {/* Header — title + chevron + kebab */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-3">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex-1 flex items-center gap-2 text-left"
          aria-expanded={!collapsed}
        >
          <motion.span
            aria-hidden
            animate={prefersReducedMotion ? undefined : { rotate: collapsed ? -90 : 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="text-text-tertiary inline-block"
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </motion.span>
          <span className="text-base font-semibold text-text-primary leading-snug">
            <span className="text-primary mr-1.5" aria-hidden>✦</span>
            {plan.title}
          </span>
        </button>
        <button
          type="button"
          onClick={handleDelete}
          aria-label={t('plans.deletePlan')}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-text-tertiary hover:text-error hover:bg-error/10 transition-colors"
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
            animate={prefersReducedMotion ? undefined : { height: 'auto', opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <ul className="px-4 pb-3 space-y-2 border-t border-border/60 pt-3">
              {items.map((item) => {
                const state = todayCompletions.get(item.id);
                const checked = state === true;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void toggle(item.id)}
                      className="w-full flex items-start gap-3 text-left py-2 group"
                    >
                      <span
                        className={`shrink-0 mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                          checked
                            ? 'bg-success border-success text-white'
                            : 'border-border group-hover:border-primary/60'
                        }`}
                        aria-hidden
                      >
                        {checked && <span className="text-xs font-bold">✓</span>}
                      </span>
                      <span
                        className={`flex-1 text-[15px] leading-snug transition-colors ${
                          checked ? 'text-text-tertiary line-through' : 'text-text-primary'
                        }`}
                      >
                        {item.if_then_text}
                        {item.reminder_time && (
                          <span
                            className="ml-2 inline-flex items-center gap-1 align-middle px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-semibold whitespace-nowrap"
                            aria-label={t('plans.dailyReminderAt', {
                              time: formatReminderClock(item.reminder_time),
                            })}
                          >
                            <span aria-hidden>⏰</span>
                            {formatReminderClock(item.reminder_time)}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Optimize footer */}
            <div className="px-4 pb-3 pt-1 border-t border-border/40">
              <button
                type="button"
                onClick={() => setOptimizeOpen(true)}
                disabled={!optimizeReady}
                className={`w-full py-2 rounded-xl text-xs font-semibold transition-colors ${
                  optimizeReady
                    ? 'text-primary hover:bg-primary/5 border border-primary/30'
                    : 'text-text-tertiary border border-border/40 cursor-not-allowed'
                }`}
              >
                {optimizeReady
                  ? t('plans.optimize')
                  : t('plans.optimizeLocked', {
                      remaining: String(Math.max(0, OPTIMIZE_THRESHOLD - totalEvents)),
                    })}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {optimizeOpen && (
        <OptimizeSheet
          plan={plan}
          items={items}
          recentCompletions={active.recentCompletions}
          onClose={() => setOptimizeOpen(false)}
        />
      )}
    </motion.div>
  );
}
