'use client';

// /letters/[id] — full letter reader. Marks the letter seen on first
// open (one-shot; store handles dedupe).

import { use, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useLettersStore } from '@/stores/lettersStore';
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
  const letters = useLettersStore((s) => s.letters);
  const fetchLetters = useLettersStore((s) => s.fetchLetters);
  const hasFetched = useLettersStore((s) => s.hasFetched);
  const markSeen = useLettersStore((s) => s.markSeen);

  useEffect(() => {
    if (!hasFetched) fetchLetters().catch(() => {});
  }, [hasFetched, fetchLetters]);

  const letter = letters.find((l) => l.id === id) ?? null;

  useEffect(() => {
    if (letter && !letter.seen_at) {
      markSeen(letter.id);
    }
  }, [letter, markSeen]);

  if (!hasFetched) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-text-tertiary animate-pulse">{t('common.loading')}</p>
      </div>
    );
  }

  if (!letter) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-16 pb-24 space-y-4">
        <button
          onClick={() => router.push('/letters')}
          className="text-sm text-primary"
        >
          ← Letters
        </button>
        <p className="text-sm text-text-secondary">This letter couldn't be found.</p>
      </div>
    );
  }

  const guide = getGuideOrDefault(letter.guide_id);

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
        <p className="text-[11px] uppercase tracking-widest text-text-tertiary font-semibold">
          From {guide.name} · {letter.week_key}
        </p>
        <h1 className="text-lg font-bold text-text-primary">
          {formatLongDate(letter.generated_at)}
        </h1>
      </header>

      <div className="bg-surface rounded-2xl border border-border p-5">
        <p className="text-[15px] text-text-primary leading-relaxed whitespace-pre-line">
          {letter.letter_text}
        </p>
      </div>

      {letter.themes.length > 0 && (
        <section className="space-y-2">
          <p className="text-[11px] uppercase tracking-widest text-text-tertiary font-semibold">
            Themes
          </p>
          <div className="flex flex-wrap gap-1.5">
            {letter.themes.map((theme, i) => (
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
