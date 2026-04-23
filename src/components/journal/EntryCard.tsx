'use client';

// Per-entry card on the book-page feed. Shows raw content by default,
// flips to structured on toggle. Structured view generates lazily via
// getStructured() and caches to the DB.

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { JournalEntry } from '@/stores/journalStore';
import { useJournalStore } from '@/stores/journalStore';
import { getStructured } from '@/lib/structureEntry';
import { t } from '@/lib/translations';
import { getLocale } from '@/lib/language';
import { prefersReducedMotion } from '@/lib/motionVariants';

type ViewMode = 'raw' | 'structured';

function formatTime(iso: string): string {
  const locale = getLocale() === 'es' ? 'es-MX' : 'en-US';
  return new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

interface Props {
  entry: JournalEntry;
}

export default function EntryCard({ entry }: Props) {
  const [mode, setMode] = useState<ViewMode>('raw');
  const [structured, setStructured] = useState<string | null>(
    entry.content_structured ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const applyEntryPatch = useJournalStore((s) => s.applyEntryPatch);

  const loadStructured = useCallback(async () => {
    if (structured && structured.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getStructured({
        id: entry.id,
        content_text: entry.content_text,
        content_structured: entry.content_structured,
      });
      setStructured(res.text);
      // Reflect the cached result in the store so subsequent views
      // don't have to re-request.
      if (!res.cached && applyEntryPatch) {
        applyEntryPatch(entry.id, {
          content_structured: res.text,
          structured_generated_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [entry.id, entry.content_text, entry.content_structured, structured, applyEntryPatch]);

  const handleMode = async (m: ViewMode) => {
    if (m === mode) return;
    setMode(m);
    if (m === 'structured') await loadStructured();
  };

  const raw = (entry.content_text ?? '').trim();
  const shown = mode === 'raw' ? raw : (structured ?? '').trim();

  return (
    <motion.article
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: 4 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
      className="relative bg-surface-elevated border border-border rounded-2xl p-4 shadow-warm-sm"
    >
      <header className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-widest text-text-tertiary">
          {formatTime(entry.created_at)}
        </span>
        {/* Raw / Structured segmented control */}
        <div className="inline-flex text-[10px] font-semibold rounded-full bg-surface border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => handleMode('raw')}
            className={`px-2.5 py-1 ${mode === 'raw' ? 'bg-primary text-white' : 'text-text-tertiary hover:text-text-secondary'}`}
          >
            {t('entry.raw')}
          </button>
          <button
            type="button"
            onClick={() => handleMode('structured')}
            className={`px-2.5 py-1 ${mode === 'structured' ? 'bg-primary text-white' : 'text-text-tertiary hover:text-text-secondary'}`}
          >
            {t('entry.structured')}
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.div
          key={mode + (loading ? '-loading' : '')}
          initial={prefersReducedMotion ? undefined : { opacity: 0, y: 2 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {loading ? (
            <p className="text-sm text-text-tertiary italic">
              {t('entry.structuring')}
            </p>
          ) : error ? (
            <p className="text-sm text-error">{error}</p>
          ) : (
            <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
              {shown || (
                <span className="text-text-tertiary italic">
                  {t('entry.empty')}
                </span>
              )}
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.article>
  );
}
