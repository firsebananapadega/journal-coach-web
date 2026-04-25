'use client';

// /letters/[id] — full reader for either a weekly letter or a
// monthly pattern. Marks seen on first open (one-shot via store).

import { use, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useLettersStore, type ArchiveItem } from '@/stores/lettersStore';
import { getGuideOrDefault } from '@/lib/guideConfigs';
import { getLocale } from '@/lib/language';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';

function formatLongDate(iso: string): string {
  const locale = getLocale() === 'es' ? 'es-MX' : 'en-US';
  return new Date(iso).toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function LetterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const fetchLetters = useLettersStore((s) => s.fetchLetters);
  const hasFetched = useLettersStore((s) => s.hasFetched);
  const markSeen = useLettersStore((s) => s.markSeen);
  const letters = useLettersStore((s) => s.letters);
  const patterns = useLettersStore((s) => s.patterns);

  useEffect(() => {
    if (!hasFetched) fetchLetters().catch(() => {});
  }, [hasFetched, fetchLetters]);

  // Resolve the item by id from either store slice. The byId helper
  // returns ArchiveItem with a `kind` discriminator so both branches
  // can render correctly below.
  const item: ArchiveItem | null = (() => {
    const w = letters.find((l) => l.id === id);
    if (w) return { kind: 'weekly', ...w };
    const m = patterns.find((p) => p.id === id);
    if (m) return { kind: 'monthly', ...m };
    return null;
  })();

  useEffect(() => {
    if (item && !item.seen_at) {
      markSeen(item.id, item.kind);
    }
  }, [item, markSeen]);

  if (!hasFetched) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-text-tertiary animate-pulse">{t('common.loading')}</p>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-16 pb-24 space-y-4">
        <button
          onClick={() => router.push('/letters')}
          className="text-sm text-primary"
        >
          ← Letters
        </button>
        <p className="text-sm text-text-secondary">This letter couldn&apos;t be found.</p>
      </div>
    );
  }

  const guide = getGuideOrDefault(item.guide_id);
  const isMonthly = item.kind === 'monthly';

  return (
    <motion.article
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: 6 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      className="max-w-lg mx-auto px-5 pt-16 pb-24 space-y-5"
    >
      <Link
        href="/letters"
        className="text-sm text-text-tertiary hover:text-text-secondary inline-block"
      >
        ← Letters
      </Link>

      <header className="space-y-1">
        <p className="text-[11px] uppercase tracking-widest text-text-tertiary font-semibold flex items-center gap-1.5">
          <span aria-hidden>{isMonthly ? '✦' : '✉'}</span>
          {isMonthly ? 'Monthly pattern' : 'Weekly letter'} from {guide.name} ·{' '}
          {item.kind === 'monthly' ? item.month_key : item.week_key}
        </p>
        <h1 className="text-lg font-bold text-text-primary">
          {formatLongDate(item.generated_at)}
        </h1>
      </header>

      {/* Monthly patterns get the themes section ABOVE the narrative.
          Each theme card shows the title + summary; cited entry ids
          are kept in metadata for a future "examples like this"
          tooltip but aren't rendered as links yet (Phase 4C will
          surface them via structure-note linking). */}
      {item.kind === 'monthly' && item.themes.length > 0 && (
        <section className="space-y-3">
          <p className="text-[11px] uppercase tracking-widest text-text-tertiary font-semibold">
            Themes I noticed
          </p>
          <div className="space-y-2">
            {item.themes.map((th, i) => (
              <div
                key={i}
                className="bg-surface rounded-2xl border border-border p-4"
              >
                <p className="text-sm font-semibold text-text-primary">
                  ✦ {th.name}
                </p>
                <p className="text-[13px] text-text-secondary mt-1 leading-relaxed">
                  {th.summary}
                </p>
                {th.entry_ids.length > 0 && (
                  <p className="text-[11px] text-text-tertiary mt-2">
                    From {th.entry_ids.length}{' '}
                    {th.entry_ids.length === 1 ? 'entry' : 'entries'}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="bg-surface rounded-2xl border border-border p-5">
        <p className="text-[15px] text-text-primary leading-relaxed whitespace-pre-line">
          {item.kind === 'weekly' ? item.letter_text : item.narrative}
        </p>
      </div>

      {/* Weekly letters store themes as a flat string array; render
          as chips. Monthly patterns put themes in the structured
          section above instead. */}
      {item.kind === 'weekly' && item.themes.length > 0 && (
        <section className="space-y-2">
          <p className="text-[11px] uppercase tracking-widest text-text-tertiary font-semibold">
            Themes
          </p>
          <div className="flex flex-wrap gap-1.5">
            {item.themes.map((theme, i) => (
              <span
                key={i}
                className="px-2.5 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full"
              >
                {theme}
              </span>
            ))}
          </div>
        </section>
      )}
    </motion.article>
  );
}
