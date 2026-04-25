'use client';

// /letters — archive of every weekly letter AND monthly pattern the
// user has received. Both kinds interleave by generated_at and are
// distinguished visually (envelope glyph for letters, themes glyph
// for monthly patterns). Unread items show a primary-color dot.

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useLettersStore, type ArchiveItem } from '@/stores/lettersStore';
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

function formatItemDate(iso: string): string {
  const locale = getLocale() === 'es' ? 'es-MX' : 'en-US';
  return new Date(iso).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function LettersIndexPage() {
  const router = useRouter();
  const fetchLetters = useLettersStore((s) => s.fetchLetters);
  const hasFetched = useLettersStore((s) => s.hasFetched);
  const loading = useLettersStore((s) => s.loading);
  // Re-evaluate when letters/patterns change so the list re-renders.
  const letters = useLettersStore((s) => s.letters);
  const patterns = useLettersStore((s) => s.patterns);

  useEffect(() => {
    if (!hasFetched) fetchLetters().catch(() => {});
  }, [hasFetched, fetchLetters]);

  const items: ArchiveItem[] = useMemo(() => {
    const merged: ArchiveItem[] = [
      ...letters.map((l) => ({ kind: 'weekly' as const, ...l })),
      ...patterns.map((p) => ({ kind: 'monthly' as const, ...p })),
    ];
    return merged.sort((a, b) => (a.generated_at < b.generated_at ? 1 : -1));
  }, [letters, patterns]);

  const grouped = useMemo(() => {
    const groups = new Map<string, ArchiveItem[]>();
    for (const it of items) {
      const key = monthKey(it.generated_at);
      const list = groups.get(key) ?? [];
      list.push(it);
      groups.set(key, list);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([key, list]) => ({ key, list }));
  }, [items]);

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

      {loading && items.length === 0 && (
        <p className="text-sm text-text-tertiary animate-pulse">{t('common.loading')}</p>
      )}

      {!loading && items.length === 0 && (
        <div className="bg-surface rounded-2xl border border-border p-6 text-center space-y-2">
          <span className="text-3xl block" aria-hidden>&#128140;</span>
          <p className="text-sm text-text-primary font-semibold">No letters yet.</p>
          <p className="text-xs text-text-tertiary">
            Journal for a few days this week — your guide will leave you a letter on Sunday.
            On the 1st of each month, a deeper pattern digest lands here too.
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
            {list.map((item) => {
              const unread = !item.seen_at;
              const isMonthly = item.kind === 'monthly';
              const isQuarterly = item.kind === 'quarterly';
              const preview =
                item.kind === 'monthly' ? item.narrative : item.letter_text;
              const subKey =
                item.kind === 'monthly'
                  ? item.month_key
                  : item.kind === 'quarterly'
                  ? item.quarter_key
                  : item.week_key;
              const themeChips: string[] =
                item.kind === 'monthly'
                  ? item.themes.slice(0, 4).map((th) => th.name)
                  : item.themes.slice(0, 4);
              const glyph = isQuarterly ? '✺' : isMonthly ? '✦' : '✉';
              const kindLabel = isQuarterly
                ? 'Quarterly letter'
                : isMonthly
                ? 'Monthly pattern'
                : 'Weekly letter';
              return (
                <li key={item.id}>
                  <Link
                    href={`/letters/${item.id}`}
                    className={`block relative rounded-2xl border p-4 transition-colors ${
                      unread
                        ? isQuarterly
                          ? 'bg-gradient-to-br from-primary/25 via-primary/12 to-transparent border-primary/50 hover:border-primary/80'
                          : isMonthly
                          ? 'bg-gradient-to-br from-primary/15 via-primary/8 to-transparent border-primary/40 hover:border-primary/70'
                          : 'bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/30 hover:border-primary/60'
                        : 'bg-surface border-border hover:border-primary/40'
                    }`}
                  >
                    {unread && (
                      <span
                        aria-hidden
                        className="absolute top-3 right-3 inline-block w-2.5 h-2.5 rounded-full bg-primary"
                      />
                    )}
                    <p className="text-[10px] uppercase tracking-widest text-text-tertiary font-semibold flex items-center gap-1.5">
                      <span aria-hidden>{glyph}</span>
                      {kindLabel} · {formatItemDate(item.generated_at)} · {subKey}
                    </p>
                    <p className="text-sm text-text-primary mt-1 line-clamp-2 pr-6">
                      {preview.slice(0, 200)}…
                    </p>
                    {themeChips.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {themeChips.map((theme, i) => (
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
