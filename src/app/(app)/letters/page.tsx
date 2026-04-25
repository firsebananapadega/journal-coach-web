'use client';

// /letters — archive of every weekly letter the user has received.
// Grouped by month. Unread letters surface a small dot so they're
// easy to spot at a glance.

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useLettersStore, type WeeklyLetter } from '@/stores/lettersStore';
import { getLocale } from '@/lib/language';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthHeader(key: string): string {
  const locale = getLocale() === 'es' ? 'es-MX' : 'en-US';
  const [y, m] = key.split('-').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, 1).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });
}

function formatLetterDate(iso: string): string {
  const locale = getLocale() === 'es' ? 'es-MX' : 'en-US';
  return new Date(iso).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function LettersIndexPage() {
  const router = useRouter();
  const letters = useLettersStore((s) => s.letters);
  const fetchLetters = useLettersStore((s) => s.fetchLetters);
  const hasFetched = useLettersStore((s) => s.hasFetched);
  const loading = useLettersStore((s) => s.loading);

  useEffect(() => {
    if (!hasFetched) fetchLetters().catch(() => {});
  }, [hasFetched, fetchLetters]);

  const grouped = useMemo(() => {
    const groups = new Map<string, WeeklyLetter[]>();
    for (const l of letters) {
      const key = monthKey(l.generated_at);
      const list = groups.get(key) ?? [];
      list.push(l);
      groups.set(key, list);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([key, list]) => ({ key, list }));
  }, [letters]);

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-24 space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-text-tertiary hover:text-text-secondary"
          aria-label={t('common.back')}
        >
          ←
        </button>
        <h1 className="text-2xl font-bold text-text-primary">Letters</h1>
      </div>

      {loading && letters.length === 0 && (
        <p className="text-sm text-text-tertiary animate-pulse">{t('common.loading')}</p>
      )}

      {!loading && letters.length === 0 && (
        <div className="bg-surface rounded-2xl border border-border p-6 text-center space-y-2">
          <span className="text-3xl block" aria-hidden>&#128140;</span>
          <p className="text-sm text-text-primary font-semibold">No letters yet.</p>
          <p className="text-xs text-text-tertiary">
            Journal for a few days this week — your guide will leave you a letter on Sunday.
          </p>
        </div>
      )}

      {grouped.map(({ key, list }) => (
        <motion.section
          key={key}
          initial={prefersReducedMotion ? undefined : { opacity: 0, y: 6 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          className="space-y-2"
        >
          <h2 className="text-[11px] uppercase tracking-widest text-text-tertiary font-semibold">
            {formatMonthHeader(key)}
          </h2>
          <ul className="space-y-2">
            {list.map((l) => {
              const unread = !l.seen_at;
              return (
                <li key={l.id}>
                  <Link
                    href={`/letters/${l.id}`}
                    className={`block relative rounded-2xl border p-4 transition-colors ${
                      unread
                        ? 'bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/30 hover:border-primary/60'
                        : 'bg-surface border-border hover:border-primary/40'
                    }`}
                  >
                    {unread && (
                      <span
                        aria-hidden
                        className="absolute top-3 right-3 inline-block w-2.5 h-2.5 rounded-full bg-primary"
                      />
                    )}
                    <p className="text-[10px] uppercase tracking-widest text-text-tertiary font-semibold">
                      {formatLetterDate(l.generated_at)} · {l.week_key}
                    </p>
                    <p className="text-sm text-text-primary mt-1 line-clamp-2 pr-6">
                      {l.letter_text.slice(0, 180)}…
                    </p>
                    {l.themes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {l.themes.slice(0, 4).map((theme, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-medium rounded-full"
                          >
                            {theme}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </motion.section>
      ))}
    </div>
  );
}
