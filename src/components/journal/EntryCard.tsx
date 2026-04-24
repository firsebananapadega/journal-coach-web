'use client';

// Per-entry card on the book-page feed. Shows the STRUCTURED view
// by default (per user feedback 2026-04-24). Raw/Structured toggle
// only appears inside the single-entry editor at /entry/[id].
//
// Structured view is cached in `content_structured` column. If it's
// already present, render instantly. If not, generate lazily on
// mount (fallback — normally the create-entry flow pre-generates
// in the background immediately after save, so by the time the user
// opens a notebook the structured text is already there).

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { JournalEntry } from '@/stores/journalStore';
import { useJournalStore } from '@/stores/journalStore';
import { getStructured } from '@/lib/structureEntry';
import { t } from '@/lib/translations';
import { getLocale } from '@/lib/language';
import { prefersReducedMotion } from '@/lib/motionVariants';

function formatTime(iso: string): string {
  const locale = getLocale() === 'es' ? 'es-MX' : 'en-US';
  return new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

interface Props {
  entry: JournalEntry;
}

export default function EntryCard({ entry }: Props) {
  const applyEntryPatch = useJournalStore((s) => s.applyEntryPatch);
  const [structured, setStructured] = useState<string | null>(
    entry.content_structured ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Already cached — nothing to do.
    if (entry.content_structured && entry.content_structured.trim()) {
      setStructured(entry.content_structured);
      setError(false);
      return;
    }
    const raw = (entry.content_text ?? '').trim();
    if (!raw) return;

    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const res = await getStructured({
          id: entry.id,
          content_text: entry.content_text,
          content_structured: entry.content_structured,
        });
        if (cancelled) return;
        setStructured(res.text);
        if (!res.cached && applyEntryPatch) {
          applyEntryPatch(entry.id, {
            content_structured: res.text,
            structured_generated_at: new Date().toISOString(),
          });
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry.id, entry.content_text, entry.content_structured, applyEntryPatch]);

  const raw = (entry.content_text ?? '').trim();
  // Priority: show structured if available; fall back to raw on
  // error or while still loading (so the user always has SOMETHING
  // legible rather than a blank card).
  const displayed = (error ? raw : structured ?? raw).trim();

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
        {loading && !structured && (
          <span className="text-[10px] uppercase tracking-wider text-text-tertiary italic">
            {t('entry.structuring')}
          </span>
        )}
      </header>

      <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
        {displayed || (
          <span className="text-text-tertiary italic">{t('entry.empty')}</span>
        )}
      </p>
    </motion.article>
  );
}
