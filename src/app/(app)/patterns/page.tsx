'use client';

// Patterns — the insights home. Lean six-card design, ordered by
// signal value (highest-signal first):
//
//   1. Latest letter        — Ben's AI narrative (the cron output is
//                             the highest-value pattern view in the app).
//   2. What Ben noticed     — Effect-size-gated correlations from
//                             computeFindings(). Tells you something
//                             you can't see by scrolling. Pennebaker-
//                             aligned causal-language framing.
//   3. Themes from this month — Theme strings extracted by the weekly
//                               + monthly + quarterly crons. Surfaces
//                               the AI-summarized motifs without making
//                               the user open every letter.
//   4. Wins this week       — Last 7 days of evening-pulse `wentRight`.
//                             Direct application of Amabile & Kramer's
//                             progress-principle research (12K diaries,
//                             238 employees).
//   5. Pulse trend          — Body+mind dual sparkline over 30 days,
//                             with an extrema annotation that turns a
//                             decorative chart into a glanceable insight.
//   6. Rhythm strip         — When/how-often data: typical pulse times,
//                             journaling heatmap, voice + words stats.
//                             Combined into one card so they don't
//                             scatter as three visually-similar slabs.
//
// Removed (intentions architecture is disabled): hero "X of last 7
// days" stat, intention follow-through, practice consistency heatmap,
// intentions breakdown. All depended on `profile.intentions`.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useJournalStore } from '@/stores/journalStore';
import { useLettersStore, type ArchiveItem } from '@/stores/lettersStore';
import { t } from '@/lib/translations';
import { toLocalDateStr } from '@/lib/dateUtils';
import { computeFindings } from '@/lib/correlations';

// ─── Helpers ──────────────────────────────────────────────────────────

function lastNDates(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(toLocalDateStr(d));
  }
  return out;
}

function dayInitial(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()];
}

// ─── Pulse trend (dual-series sparkline) ──────────────────────────────

interface PulsePoint {
  date: string;
  body: number | null;
  mind: number | null;
}

function PulseTrend({ points }: { points: PulsePoint[] }) {
  const width = 320;
  const height = 80;
  const padX = 10;
  const padY = 8;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const xFor = (i: number) =>
    points.length <= 1 ? padX + innerW / 2 : padX + (i / (points.length - 1)) * innerW;
  const yFor = (v: number) => padY + innerH - ((v - 1) / 4) * innerH;

  const polyline = (key: 'body' | 'mind') => {
    const segs: string[] = [];
    let started = false;
    points.forEach((p, i) => {
      const v = p[key];
      if (v == null) {
        started = false;
        return;
      }
      const x = xFor(i);
      const y = yFor(v);
      segs.push(`${started ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`);
      started = true;
    });
    return segs.join(' ');
  };

  const hasAny = points.some((p) => p.body != null || p.mind != null);

  if (!hasAny) {
    return (
      <p className="text-xs text-text-tertiary leading-snug">
        Check in for a few days and your body + mind trend will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-20"
        preserveAspectRatio="none"
        aria-label="Body and mind trend, last 30 days"
      >
        <line
          x1={padX}
          y1={padY + innerH / 2}
          x2={width - padX}
          y2={padY + innerH / 2}
          stroke="currentColor"
          strokeWidth="0.5"
          className="text-border"
          strokeDasharray="2 2"
        />
        <path d={polyline('body')} fill="none" stroke="rgb(249 115 22)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d={polyline('mind')} fill="none" stroke="rgb(59 130 246)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex items-center gap-4 text-[11px] text-text-tertiary">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orange-500" /> Body
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500" /> Mind
        </span>
        <span className="ml-auto">30d · scale 1–5</span>
      </div>
    </div>
  );
}

// ─── Journaling frequency heatmap ─────────────────────────────────────

interface JournalDayDetail {
  date: string;
  count: number;
  previews: string[];
}

function JournalingHeatmap({
  daysDetail,
  onSelect,
  selectedDate,
}: {
  daysDetail: Map<string, JournalDayDetail>;
  onSelect: (date: string | null) => void;
  selectedDate: string | null;
}) {
  const dates = lastNDates(30);
  const counts = Array.from(daysDetail.values()).map((d) => d.count);
  const max = Math.max(1, ...counts);
  const opacity = (c: number) => (c === 0 ? 0.08 : 0.3 + 0.7 * (c / max));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-1.5">
        {dates.map((d) => {
          const detail = daysDetail.get(d);
          const c = detail?.count ?? 0;
          const isSelected = selectedDate === d;
          return (
            <button
              type="button"
              key={d}
              onClick={() => onSelect(isSelected ? null : d)}
              className={`aspect-square rounded-md bg-primary transition-all ${
                isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : ''
              }`}
              style={{ opacity: opacity(c) }}
              aria-label={`${d}: ${c} entr${c === 1 ? 'y' : 'ies'}`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-[10px] text-text-tertiary text-center">
        {dates.slice(0, 7).map((d) => (
          <span key={d}>{dayInitial(d)}</span>
        ))}
      </div>
      {selectedDate && (
        <div className="mt-3 rounded-xl bg-surface-elevated border border-border p-3 space-y-1">
          <p className="text-xs font-semibold text-text-primary">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </p>
          {(() => {
            const detail = daysDetail.get(selectedDate);
            if (!detail || detail.count === 0) {
              return <p className="text-xs text-text-tertiary italic">No entries.</p>;
            }
            return (
              <ul className="space-y-0.5">
                {detail.previews.map((p, i) => (
                  <li key={i} className="text-xs text-text-secondary truncate">
                    · {p}
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function PatternsPage() {
  const [selectedJournalDate, setSelectedJournalDate] = useState<string | null>(null);
  const entries = useJournalStore((s) => s.entries);
  const fetchEntries = useJournalStore((s) => s.fetchEntries);
  const fetchLetters = useLettersStore((s) => s.fetchLetters);
  const lettersHasFetched = useLettersStore((s) => s.hasFetched);
  const weeklyLetters = useLettersStore((s) => s.letters);
  const monthlyPatterns = useLettersStore((s) => s.patterns);
  const quarterlyLetters = useLettersStore((s) => s.quarterlies);

  useEffect(() => {
    fetchEntries();
    if (!lettersHasFetched) fetchLetters().catch(() => {});
  }, [fetchEntries, fetchLetters, lettersHasFetched]);

  // ─── Card 1: Latest letter ────────────────────────────────
  // Most-recent letter across all three kinds. Prefer unread; fall
  // back to the most recently generated. Drives the lead card.
  const latestLetter: ArchiveItem | null = useMemo(() => {
    const all: ArchiveItem[] = [
      ...weeklyLetters.map((l) => ({ kind: 'weekly' as const, ...l })),
      ...monthlyPatterns.map((p) => ({ kind: 'monthly' as const, ...p })),
      ...quarterlyLetters.map((q) => ({ kind: 'quarterly' as const, ...q })),
    ];
    if (all.length === 0) return null;
    all.sort((a, b) => (a.generated_at < b.generated_at ? 1 : -1));
    return all.find((i) => !i.seen_at) ?? all[0];
  }, [weeklyLetters, monthlyPatterns, quarterlyLetters]);
  const totalLetters = weeklyLetters.length + monthlyPatterns.length + quarterlyLetters.length;

  // ─── Card 2: What Ben noticed ─────────────────────────────
  const findings = useMemo(() => computeFindings(entries), [entries]);

  // ─── Card 3: Themes from this month ───────────────────────
  // Pull theme strings from the most-recent letter of each kind.
  // Monthly themes carry { name, summary, entry_ids } objects;
  // weekly + quarterly are plain string arrays. Dedupe case-
  // insensitive, cap at 6, attach the source letter id so a chip
  // can deep-link to it.
  interface ThemeChip {
    label: string;
    letterId: string;
    kind: 'weekly' | 'monthly' | 'quarterly';
  }
  const themeChips = useMemo<ThemeChip[]>(() => {
    const seen = new Set<string>();
    const out: ThemeChip[] = [];
    const push = (label: string, letterId: string, kind: ThemeChip['kind']) => {
      const key = label.trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({ label: label.trim(), letterId, kind });
    };
    // Order: monthly first (richest source), then weekly, then quarterly.
    // Keeps the most actionable themes at the front of the chip row.
    const latestMonthly = monthlyPatterns[0];
    if (latestMonthly && Array.isArray(latestMonthly.themes)) {
      for (const th of latestMonthly.themes) {
        const name = (th as { name?: string })?.name;
        if (name) push(name, latestMonthly.id, 'monthly');
      }
    }
    const latestWeekly = weeklyLetters[0];
    if (latestWeekly && Array.isArray(latestWeekly.themes)) {
      for (const th of latestWeekly.themes) {
        if (typeof th === 'string') push(th, latestWeekly.id, 'weekly');
      }
    }
    const latestQuarterly = quarterlyLetters[0];
    if (latestQuarterly && Array.isArray(latestQuarterly.themes)) {
      for (const th of latestQuarterly.themes) {
        if (typeof th === 'string') push(th, latestQuarterly.id, 'quarterly');
      }
    }
    return out.slice(0, 6);
  }, [weeklyLetters, monthlyPatterns, quarterlyLetters]);

  // ─── Card 4: Wins this week ──────────────────────────────
  // Pull `wentRight` strings from evening pulses in the last 7 days.
  // Already captured during the existing evening-pulse flow; surfacing
  // it here is just visibility.
  interface Win {
    text: string;
    date: string;
  }
  const winsThisWeek = useMemo<Win[]>(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const out: Win[] = [];
    for (const e of entries) {
      if (e.entry_type !== 'pulse') continue;
      const m = (e.metadata ?? {}) as Record<string, unknown>;
      if (m.pulseMode !== 'evening') continue;
      const ts = e.created_at ? new Date(e.created_at).getTime() : 0;
      if (!ts || ts < cutoff) continue;
      const wentRight = typeof m.wentRight === 'string' ? m.wentRight.trim() : '';
      if (!wentRight) continue;
      out.push({ text: wentRight, date: e.created_at });
    }
    out.sort((a, b) => (a.date < b.date ? 1 : -1));
    return out.slice(0, 5);
  }, [entries]);

  // ─── Card 5: Pulse trend (with extrema annotation) ───────
  const dates30 = useMemo(() => lastNDates(30), []);
  const pulsePoints = useMemo<PulsePoint[]>(() => {
    const byDay = new Map<string, { body: number[]; mind: number[] }>();
    for (const e of entries) {
      if (e.entry_type !== 'pulse') continue;
      const meta = e.metadata as Record<string, unknown> | null;
      const created = e.created_at ? new Date(e.created_at) : null;
      if (!created) continue;
      const day = toLocalDateStr(created);
      if (!dates30.includes(day)) continue;
      // Pulse metadata uses body_score / mind_score in current code;
      // some older entries used body / mind. Read both for back-compat.
      const body =
        typeof meta?.body_score === 'number' ? (meta.body_score as number)
        : typeof meta?.body === 'number' ? (meta.body as number)
        : null;
      const mind =
        typeof meta?.mind_score === 'number' ? (meta.mind_score as number)
        : typeof meta?.mind === 'number' ? (meta.mind as number)
        : null;
      const slot = byDay.get(day) ?? { body: [], mind: [] };
      if (body != null) slot.body.push(body);
      if (mind != null) slot.mind.push(mind);
      byDay.set(day, slot);
    }
    return dates30.map((d) => {
      const slot = byDay.get(d);
      const avg = (a: number[]) =>
        a.length === 0 ? null : a.reduce((s, v) => s + v, 0) / a.length;
      return { date: d, body: slot ? avg(slot.body) : null, mind: slot ? avg(slot.mind) : null };
    });
  }, [entries, dates30]);

  // Single annotation under the chart: highest-energy day + lowest-mood
  // day this month. Picks the actual date and value, formatted for
  // glance reading. Skipped when neither series has any data.
  const pulseExtrema = useMemo(() => {
    const points = pulsePoints.filter((p) => p.body != null || p.mind != null);
    if (points.length === 0) return null;
    let maxBody = -Infinity;
    let maxBodyDate = '';
    let minMind = Infinity;
    let minMindDate = '';
    for (const p of points) {
      if (p.body != null && p.body > maxBody) {
        maxBody = p.body;
        maxBodyDate = p.date;
      }
      if (p.mind != null && p.mind < minMind) {
        minMind = p.mind;
        minMindDate = p.date;
      }
    }
    const fmt = (d: string) => {
      const date = new Date(d + 'T00:00:00');
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };
    return {
      hasMaxBody: maxBody > -Infinity,
      maxBody,
      maxBodyDate: maxBodyDate ? fmt(maxBodyDate) : '',
      hasMinMind: minMind < Infinity,
      minMind,
      minMindDate: minMindDate ? fmt(minMindDate) : '',
    };
  }, [pulsePoints]);

  // ─── Card 6: Rhythm strip ────────────────────────────────
  // Three pieces: typical pulse times, journaling heatmap, voice+words
  // stats. All three answer "when / how often"; combining trims the
  // page from three look-alike cards down to one purposeful section.

  // (a) Typical pulse times — median completion time per mode.
  const pulseTimes = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const buckets: Record<'morning' | 'evening', number[]> = { morning: [], evening: [] };
    for (const e of entries) {
      if (e.entry_type !== 'pulse') continue;
      const ts = e.created_at ? new Date(e.created_at).getTime() : 0;
      if (!ts || ts < cutoff) continue;
      const m = (e.metadata ?? {}) as Record<string, unknown>;
      const mode = m.pulseMode === 'morning' || m.pulseMode === 'evening' ? m.pulseMode : null;
      if (!mode) continue;
      const d = new Date(ts);
      buckets[mode].push(d.getHours() * 60 + d.getMinutes());
    }
    const median = (arr: number[]): number | null => {
      if (arr.length === 0) return null;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
        : sorted[mid];
    };
    const fmt = (mins: number): string => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      const period = h < 12 ? 'AM' : 'PM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${h12}:${String(m).padStart(2, '0')} ${period}`;
    };
    const morningMedian = median(buckets.morning);
    const eveningMedian = median(buckets.evening);
    return {
      morning:
        buckets.morning.length >= 3 && morningMedian !== null ? fmt(morningMedian) : null,
      evening:
        buckets.evening.length >= 3 && eveningMedian !== null ? fmt(eveningMedian) : null,
    };
  }, [entries]);

  // (b) Journaling heatmap — non-pulse, non-practice entries grouped
  // by local date.
  const journalDaysDetail = useMemo<Map<string, JournalDayDetail>>(() => {
    const byDay = new Map<string, JournalDayDetail>();
    for (const d of dates30) byDay.set(d, { date: d, count: 0, previews: [] });
    for (const e of entries) {
      if (e.entry_type === 'pulse' || e.entry_type === 'practice') continue;
      const created = e.created_at ? new Date(e.created_at) : null;
      if (!created) continue;
      const day = toLocalDateStr(created);
      if (!dates30.includes(day)) continue;
      const preview =
        (e.title && e.title.trim()) ||
        (e.content_text && e.content_text.trim().slice(0, 60)) ||
        'Entry';
      const slot = byDay.get(day)!;
      slot.count += 1;
      if (slot.previews.length < 5) slot.previews.push(preview);
    }
    return byDay;
  }, [entries, dates30]);

  // (c) Voice + word stats this week.
  const { voiceThisWeek, wordsThisWeek } = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    let voice = 0;
    let words = 0;
    for (const e of entries) {
      if (!e.created_at) continue;
      const created = new Date(e.created_at);
      if (created < cutoff) continue;
      if (e.entry_type === 'pulse' || e.entry_type === 'practice') continue;
      voice += 1;
      if (typeof e.word_count === 'number') words += e.word_count;
    }
    return { voiceThisWeek: voice, wordsThisWeek: words };
  }, [entries]);

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-24 space-y-5">
      <h1 className="text-2xl font-bold text-text-primary">{t('tab.patterns')}</h1>

      {/* ─── 1. Latest letter ─────────────────────────────────── */}
      {latestLetter ? (
        (() => {
          const isQuarterly = latestLetter.kind === 'quarterly';
          const isMonthly = latestLetter.kind === 'monthly';
          const unread = !latestLetter.seen_at;
          const glyph = isQuarterly ? '✺' : isMonthly ? '✦' : '✉';
          const kindLabel = isQuarterly
            ? 'Quarterly letter'
            : isMonthly
            ? 'Monthly pattern'
            : 'Weekly letter';
          const preview =
            latestLetter.kind === 'monthly' ? latestLetter.narrative : latestLetter.letter_text;
          const gradientClass = unread
            ? isQuarterly
              ? 'bg-gradient-to-br from-primary/25 via-primary/12 to-transparent border-primary/50'
              : isMonthly
              ? 'bg-gradient-to-br from-primary/15 via-primary/8 to-transparent border-primary/40'
              : 'bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/30'
            : 'bg-surface border-border';
          return (
            <section className="space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="text-xs uppercase tracking-wider text-text-tertiary font-semibold">
                  {unread ? 'New letter' : 'Latest letter'}
                </p>
                {totalLetters > 1 && (
                  <Link href="/letters" className="text-xs text-primary hover:underline">
                    See all {totalLetters} →
                  </Link>
                )}
              </div>
              <Link
                href={`/letters/${latestLetter.id}`}
                className={`block relative rounded-2xl border p-4 transition-colors ${gradientClass} hover:border-primary/60`}
              >
                {unread && (
                  <span aria-hidden className="absolute top-3 right-3 inline-block w-2.5 h-2.5 rounded-full bg-primary" />
                )}
                <p className="text-[10px] uppercase tracking-widest text-text-tertiary font-semibold flex items-center gap-1.5">
                  <span aria-hidden>{glyph}</span>
                  {kindLabel}
                </p>
                <p className="text-sm text-text-primary mt-1 line-clamp-3 pr-6">
                  {preview.slice(0, 220)}…
                </p>
              </Link>
            </section>
          );
        })()
      ) : (
        <section className="bg-surface rounded-2xl border border-border p-4">
          <p className="text-sm font-semibold text-text-primary mb-1">Letters from your guide</p>
          <p className="text-xs text-text-tertiary leading-snug">
            Journal for a few days and a weekly letter will land here every Sunday.
          </p>
        </section>
      )}

      {/* ─── 2. What Ben noticed ──────────────────────────────── */}
      {findings.length > 0 && (
        <section className="bg-surface rounded-2xl border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-primary">What Ben noticed</h2>
          <ul className="space-y-2.5">
            {findings.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-primary mt-0.5 shrink-0" aria-hidden>✦</span>
                <span className="text-[14px] text-text-primary leading-snug">{f.text}</span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-text-tertiary leading-snug">
            Based on the last 30 days. New findings appear as more days accumulate on each side of a comparison.
          </p>
        </section>
      )}

      {/* ─── 3. Themes from this month ────────────────────────── */}
      <section className="bg-surface rounded-2xl border border-border p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Themes</h2>
        {themeChips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {themeChips.map((th, i) => (
              <Link
                key={`${th.letterId}-${i}`}
                href={`/letters/${th.letterId}`}
                className="text-[11px] px-2.5 py-1 rounded-full bg-primary/12 text-primary hover:bg-primary/20 transition-colors"
                title={
                  th.kind === 'monthly'
                    ? 'From your monthly pattern letter'
                    : th.kind === 'quarterly'
                    ? 'From your quarterly letter'
                    : 'From your weekly letter'
                }
              >
                {th.label}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-tertiary leading-snug">
            Themes appear after your first weekly letter (Sunday nights).
          </p>
        )}
      </section>

      {/* ─── 4. Wins this week ────────────────────────────────── */}
      <section className="bg-surface rounded-2xl border border-border p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Wins this week</h2>
        {winsThisWeek.length > 0 ? (
          <ul className="space-y-2.5">
            {winsThisWeek.map((w, i) => {
              const date = new Date(w.date);
              const today = new Date();
              const yest = new Date(today);
              yest.setDate(today.getDate() - 1);
              const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
              const dateLabel = sameDay(date, today)
                ? 'Today'
                : sameDay(date, yest)
                ? 'Yesterday'
                : date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
              return (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-success mt-0.5 shrink-0" aria-hidden>✓</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-text-primary leading-snug">{w.text}</p>
                    <p className="text-[10px] text-text-tertiary mt-0.5">{dateLabel}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-text-tertiary leading-snug">
            Your evening-pulse wins will appear here.
          </p>
        )}
      </section>

      {/* ─── 5. Pulse trend (with extrema annotation) ─────────── */}
      <section className="bg-surface rounded-2xl border border-border p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Pulse trend</h2>
        <PulseTrend points={pulsePoints} />
        {pulseExtrema && (pulseExtrema.hasMaxBody || pulseExtrema.hasMinMind) && (
          <p className="text-[11px] text-text-tertiary leading-snug">
            {pulseExtrema.hasMaxBody && (
              <>
                Highest energy: <span className="text-orange-400 font-medium">{pulseExtrema.maxBodyDate}</span> ({pulseExtrema.maxBody.toFixed(1)})
              </>
            )}
            {pulseExtrema.hasMaxBody && pulseExtrema.hasMinMind && ' · '}
            {pulseExtrema.hasMinMind && (
              <>
                Lowest mood: <span className="text-blue-400 font-medium">{pulseExtrema.minMindDate}</span> ({pulseExtrema.minMind.toFixed(1)})
              </>
            )}
          </p>
        )}
      </section>

      {/* ─── 6. Rhythm strip — typical times + heatmap + stats ── */}
      <section className="bg-surface rounded-2xl border border-border p-4 space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Your rhythm</h2>
          <span className="text-[10px] text-text-tertiary">last 30 days</span>
        </div>

        {/* Typical pulse times */}
        {(pulseTimes.morning || pulseTimes.evening) && (
          <div className="flex items-center gap-3 text-[12px] text-text-secondary">
            {pulseTimes.morning && (
              <span>
                <span className="text-text-tertiary">Morning ~</span>
                <span className="text-text-primary font-semibold">{pulseTimes.morning}</span>
              </span>
            )}
            {pulseTimes.morning && pulseTimes.evening && (
              <span className="text-text-tertiary">·</span>
            )}
            {pulseTimes.evening && (
              <span>
                <span className="text-text-tertiary">Evening ~</span>
                <span className="text-text-primary font-semibold">{pulseTimes.evening}</span>
              </span>
            )}
          </div>
        )}

        {/* Journaling heatmap — full width */}
        <div>
          <p className="text-[11px] text-text-tertiary mb-2">Journaling activity · tap a day</p>
          <JournalingHeatmap
            daysDetail={journalDaysDetail}
            selectedDate={selectedJournalDate}
            onSelect={setSelectedJournalDate}
          />
        </div>

        {/* Voice + word stats */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/60">
          <div>
            <p className="text-2xl font-bold text-text-primary tabular-nums">{voiceThisWeek}</p>
            <p className="text-[11px] text-text-tertiary leading-snug">
              {voiceThisWeek === 1 ? 'entry' : 'entries'} this week
            </p>
          </div>
          <div>
            <p className="text-2xl font-bold text-text-primary tabular-nums">
              {wordsThisWeek.toLocaleString()}
            </p>
            <p className="text-[11px] text-text-tertiary leading-snug">words journaled</p>
          </div>
        </div>
      </section>
    </div>
  );
}
