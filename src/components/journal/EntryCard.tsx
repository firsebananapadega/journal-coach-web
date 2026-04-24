'use client';

// Per-entry card on the book-page feed. Renders the structured
// Markdown view when `content_structured` is present (that's the
// normal path — `journalStore.createEntry` structures every new
// entry in the background). Falls back to raw text for entries
// that pre-date the structuring feature and never got backfilled.
//
// Does NOT call Gemini on mount. The user's explicit ask:
// "structuring was supposed to happen beforehand when I create the
// note, and then the structuring needed to be stored properly in
// the database so that it's pulling up the structured note rather
// than calling the API to structure it every time." So opening an
// entry never hits the network — we render what's in the DB.

import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { JournalEntry } from '@/stores/journalStore';
import { t } from '@/lib/translations';
import { getLocale } from '@/lib/language';
import { prefersReducedMotion } from '@/lib/motionVariants';
import PulseEntryCard from './PulseEntryCard';

function formatTime(iso: string): string {
  const locale = getLocale() === 'es' ? 'es-MX' : 'en-US';
  return new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

interface Props {
  entry: JournalEntry;
}

export default function EntryCard({ entry }: Props) {
  // Pulse entries get a dedicated, richer layout so body + mind scores
  // and the labeled prompt answers (intention / went right / done
  // better) are actually visible. Everything else falls through to the
  // generic markdown card below.
  if (entry.entry_type === 'pulse') {
    return <PulseEntryCard entry={entry} />;
  }

  const structured = (entry.content_structured ?? '').trim();
  const raw = (entry.content_text ?? '').trim();
  const displayed = structured || raw;
  const isMarkdown = !!structured;

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
      </header>

      {displayed ? (
        isMarkdown ? (
          <div className="text-sm text-text-primary leading-relaxed space-y-3
                          [&_p]:leading-relaxed
                          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1
                          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1
                          [&_li]:leading-relaxed
                          [&_strong]:font-semibold [&_strong]:text-text-primary
                          [&_em]:italic [&_em]:text-text-secondary
                          [&_hr]:my-4 [&_hr]:border-border
                          [&_a]:text-primary [&_a]:underline
                          [&_code]:text-xs [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
                          [&_blockquote]:pl-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:text-text-secondary [&_blockquote]:italic">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {displayed}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
            {displayed}
          </p>
        )
      ) : (
        <p className="text-sm">
          <span className="text-text-tertiary italic">{t('entry.empty')}</span>
        </p>
      )}
    </motion.article>
  );
}
