'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useJournalStore } from '@/stores/journalStore';
import { t } from '@/lib/translations';
import { getLanguage } from '@/lib/language';
import EmptyState from '@/components/ui/EmptyState';
import { staggerContainer, staggerItem, prefersReducedMotion, fadeUp } from '@/lib/motionVariants';
import {
  getCachedPulseAnalysis,
  generatePulseAnalysis,
  type PulseAnalysis,
} from '@/lib/pulseAnalysis';

export default function PulsePatternsPage() {
  const router = useRouter();
  const { entries, fetchEntries } = useJournalStore();
  const [analysis, setAnalysis] = useState<PulseAnalysis | null>(null);
  const [loading, setLoading] = useState(false);

  const pulseEntries = useMemo(
    () => entries.filter((e) => e.entry_type === 'pulse'),
    [entries]
  );

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    if (pulseEntries.length < 3) return;

    const cached = getCachedPulseAnalysis(pulseEntries.length);
    if (cached) {
      setAnalysis(cached);
      return;
    }

    setLoading(true);
    generatePulseAnalysis(pulseEntries)
      .then(setAnalysis)
      .catch(() => { /* silent */ })
      .finally(() => setLoading(false));
  }, [pulseEntries]);

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-text-secondary hover:text-text-primary transition-colors"
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-text-primary">{t('pulse.patternsTitle')}</h1>
        <span className="text-xs text-text-tertiary bg-surface-elevated px-2 py-0.5 rounded-full">
          {t('pulse.entries', { count: String(pulseEntries.length) })}
        </span>
      </div>

      {/* AI Insight card */}
      {loading && (
        <div className="bg-surface rounded-2xl border border-border p-4">
          <p className="text-sm text-text-secondary animate-pulse">{t('pulse.analyzing')}</p>
        </div>
      )}

      {analysis && analysis.insight && (
        <motion.div
          {...(prefersReducedMotion ? {} : fadeUp)}
          className="card-gradient-primary rounded-2xl p-5 space-y-3 text-white shadow-warm-lg"
        >
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {analysis.insight}
          </p>

          {analysis.wentRightThemes.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider opacity-90">{t('pulse.wentRightLabel')}</span>
              <div className="flex flex-wrap gap-1.5">
                {analysis.wentRightThemes.map((theme) => (
                  <span key={theme} className="px-2.5 py-1 bg-white/20 text-white text-xs font-medium rounded-full backdrop-blur-sm">
                    {theme}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analysis.improvementThemes.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider opacity-90">{t('pulse.doneBetterLabel')}</span>
              <div className="flex flex-wrap gap-1.5">
                {analysis.improvementThemes.map((theme) => (
                  <span key={theme} className="px-2.5 py-1 bg-white/20 text-white text-xs font-medium rounded-full backdrop-blur-sm">
                    {theme}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analysis.intentionThemes.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider opacity-90">{t('pulse.intentionLabel')}</span>
              <div className="flex flex-wrap gap-1.5">
                {analysis.intentionThemes.map((theme) => (
                  <span key={theme} className="px-2.5 py-1 bg-white/20 text-white text-xs font-medium rounded-full backdrop-blur-sm">
                    {theme}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Timeline */}
      <motion.div
        variants={staggerContainer}
        initial={prefersReducedMotion ? undefined : 'initial'}
        animate={prefersReducedMotion ? undefined : 'animate'}
        className="space-y-3"
      >
        {pulseEntries.map((entry) => {
          const meta = entry.metadata as Record<string, string> | null;
          const pulseMode = meta?.pulseMode;
          const icon = pulseMode === 'morning' ? '☀️' : '🌙';

          return (
            <motion.div
              key={entry.id}
              variants={staggerItem}
              className="bg-surface rounded-xl border border-border p-3 space-y-2 shadow-warm-sm"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">{icon}</span>
                <span className="text-xs text-text-tertiary">
                  {new Date(entry.created_at).toLocaleDateString(getLanguage(), {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>

              {pulseMode === 'morning' && meta?.intention && (
                <div>
                  <span className="text-[10px] font-medium text-text-secondary uppercase tracking-wide">
                    {t('pulse.intentionLabel')}
                  </span>
                  <p className="text-sm text-text-primary">{meta.intention}</p>
                </div>
              )}

              {pulseMode === 'evening' && (
                <>
                  {meta?.wentRight && (
                    <div>
                      <span className="text-[10px] font-medium text-primary uppercase tracking-wide">
                        {t('pulse.wentRightLabel')}
                      </span>
                      <p className="text-sm text-text-primary">{meta.wentRight}</p>
                    </div>
                  )}
                  {meta?.doneBetter && (
                    <div>
                      <span className="text-[10px] font-medium text-accent uppercase tracking-wide">
                        {t('pulse.doneBetterLabel')}
                      </span>
                      <p className="text-sm text-text-primary">{meta.doneBetter}</p>
                    </div>
                  )}
                </>
              )}

              {/* Legacy entries (alive/drained) */}
              {!pulseMode && (
                <>
                  {meta?.alive && (
                    <div>
                      <span className="text-[10px] font-medium text-primary uppercase tracking-wide">Alive</span>
                      <p className="text-sm text-text-primary">{meta.alive}</p>
                    </div>
                  )}
                  {meta?.drained && (
                    <div>
                      <span className="text-[10px] font-medium text-accent uppercase tracking-wide">Drained</span>
                      <p className="text-sm text-text-primary">{meta.drained}</p>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {pulseEntries.length === 0 && (
        <EmptyState
          pose="meditate"
          title={t('pulse.emptyTitle')}
          message={t('pulse.emptyMessage')}
        />
      )}
    </div>
  );
}
