'use client';

// Patterns — the insights home. Each surface earns its space:
//   - Hero stat   : one number that matters (practices this week) +
//                   current and best streaks.
//   - Weekly letter: AI-generated reflection (emotional centerpiece).
//   - Pulse trend : body + mind, last 30 days.
//   - Practice heatmap: 5×7 grid; tap a day to see what was practiced.
//   - Intentions breakdown (collapsible): per-category bars + per-
//     intention totals. Default collapsed — valuable when you want it,
//     never noise.
//   - Stats strip : voice-entry count + word count at the bottom.
//
// Design principles:
//   - Hero → emotional → trend → grid → detail → stats.
//   - Progressive disclosure (collapsed by default for the breakdown).
//   - Category colors echo the Intentions tab so it reads as one app.
//   - Empty states teach, not shame.
//   - No vanity metrics ("total minutes meditated" = count × length; skip).

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getCachedReflection,
  type WeeklyReflectionData,
} from '@/lib/weeklyReflection';
import { useJournalStore } from '@/stores/journalStore';
import { useLettersStore, type ArchiveItem } from '@/stores/lettersStore';
import { INTENTION_PRACTICES } from '@/lib/intentionPractices';
import { PRESET_INTENTIONS, type IntentionCategory } from '@/lib/presetIntentions';
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

// Category colors — echo the Intentions tab so the breakdown reads
// as the same visual family. Order follows the Intentions gallery.
const CATEGORY_ORDER: IntentionCategory[] = [
  'presence',
  'body',
  'mind',
  'connection',
  'growth',
  'purpose',
];

const CATEGORY_COLORS: Record<
  IntentionCategory,
  { bg: string; bar: string; text: string; label: string }
> = {
  presence:   { bg: 'bg-emerald-500/15', bar: 'bg-emerald-500', text: 'text-emerald-400', label: 'Presence' },
  body:       { bg: 'bg-orange-500/15',  bar: 'bg-orange-500',  text: 'text-orange-400',  label: 'Body' },
  mind:       { bg: 'bg-blue-500/15',    bar: 'bg-blue-500',    text: 'text-blue-400',    label: 'Mind' },
  connection: { bg: 'bg-pink-500/15',    bar: 'bg-pink-500',    text: 'text-pink-400',    label: 'Connection' },
  growth:     { bg: 'bg-amber-500/15',   bar: 'bg-amber-500',   text: 'text-amber-400',   label: 'Growth' },
  purpose:    { bg: 'bg-purple-500/15',  bar: 'bg-purple-500',  text: 'text-purple-400',  label: 'Purpose' },
};

// Compute current + best streak over the last ~90 days of practice
// history. Current streak = consecutive days ending today (or
// yesterday — so a missed today doesn't reset to zero until midnight
// of the day after). Best streak = longest consecutive run ever seen.
function computeStreaks(practiceDates: Set<string>): {
  current: number;
  best: number;
} {
  if (practiceDates.size === 0) return { current: 0, best: 0 };
  // Iterate backward from today. A streak ends when a day is missing.
  const today = new Date();
  const todayStr = toLocalDateStr(today);
  const yStr = (() => {
    const d = new Date(today);
    d.setDate(today.getDate() - 1);
    return toLocalDateStr(d);
  })();

  let current = 0;
  if (practiceDates.has(todayStr) || practiceDates.has(yStr)) {
    const start = practiceDates.has(todayStr) ? today : new Date(today.setDate(today.getDate() - 1));
    const d = new Date(start);
    while (practiceDates.has(toLocalDateStr(d))) {
      current += 1;
      d.setDate(d.getDate() - 1);
    }
  }

  // Best streak — scan the full set. Order the dates and count
  // consecutive runs.
  const sorted = Array.from(practiceDates).sort();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const ds of sorted) {
    const d = new Date(ds + 'T00:00:00');
    if (prev) {
      const diff = (d.getTime() - prev.getTime()) / 86_400_000;
      if (diff === 1) run += 1;
      else run = 1;
    } else {
      run = 1;
    }
    if (run > best) best = run;
    prev = d;
  }
  return { current, best };
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
        <path
          d={polyline('body')}
          fill="none"
          stroke="rgb(249 115 22)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={polyline('mind')}
          fill="none"
          stroke="rgb(59 130 246)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
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

// ─── Practice consistency heatmap ─────────────────────────────────────
//
// 30-day grid. Tap a cell → pop-out reveals intentions practiced.

interface PracticeDayDetail {
  date: string;
  count: number;
  intentions: string[];
}

function PracticeHeatmap({
  daysDetail,
  onSelect,
  selectedDate,
}: {
  daysDetail: Map<string, PracticeDayDetail>;
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
              className={`aspect-square rounded-md bg-success transition-all ${
                isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : ''
              }`}
              style={{ opacity: opacity(c) }}
              aria-label={`${d}: ${c} practice${c === 1 ? '' : 's'}`}
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
              return (
                <p className="text-xs text-text-tertiary italic">No practices.</p>
              );
            }
            return (
              <ul className="space-y-0.5">
                {detail.intentions.map((name, i) => (
                  <li key={i} className="text-xs text-text-secondary">
                    · {name}
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

// ─── Journaling frequency heatmap ─────────────────────────────────────
//
// Same visual idiom as PracticeHeatmap but sourced from journal
// entries (non-pulse, non-practice). Tap a cell for that day's
// entry titles.

interface JournalDayDetail {
  date: string;
  count: number;
  previews: string[]; // short titles/snippets for tooltip
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
              return (
                <p className="text-xs text-text-tertiary italic">No entries.</p>
              );
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
  const router = useRouter();
  const [reflection, setReflection] = useState<WeeklyReflectionData | null>(null);
  const [expandBreakdown, setExpandBreakdown] = useState(false);
  const [selectedHeatmapDate, setSelectedHeatmapDate] = useState<string | null>(null);
  const [selectedJournalDate, setSelectedJournalDate] = useState<string | null>(null);
  const entries = useJournalStore((s) => s.entries);
  const fetchEntries = useJournalStore((s) => s.fetchEntries);
  // Letters store: surfacing the most-recent letter on /patterns is
  // how users discover the archive. Letters are a form of pattern
  // recognition, so this is the natural home.
  const fetchLetters = useLettersStore((s) => s.fetchLetters);
  const lettersHasFetched = useLettersStore((s) => s.hasFetched);
  const weeklyLetters = useLettersStore((s) => s.letters);
  const monthlyPatterns = useLettersStore((s) => s.patterns);
  const quarterlyLetters = useLettersStore((s) => s.quarterlies);

  useEffect(() => {
    setReflection(getCachedReflection());
    fetchEntries();
    if (!lettersHasFetched) fetchLetters().catch(() => {});
  }, [fetchEntries, fetchLetters, lettersHasFetched]);

  // Most-recent letter across all three kinds. Prefer unread; fall
  // back to the most recently generated. Drives the "Latest letter"
  // card just below the hero stat.
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

  const dates30 = useMemo(() => lastNDates(30), []);

  // Journaling frequency — non-pulse, non-practice entries grouped
  // by local date. Each day's detail gets a short preview string
  // (title if present, else first 40 chars of content).
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

  const journalEntriesThisWeek = useMemo(() => {
    const last7 = dates30.slice(-7);
    let total = 0;
    for (const d of last7) total += journalDaysDetail.get(d)?.count ?? 0;
    return total;
  }, [journalDaysDetail, dates30]);

  // Body + mind series, one point per day. Average if multiple pulses.
  const pulsePoints = useMemo<PulsePoint[]>(() => {
    const byDay = new Map<string, { body: number[]; mind: number[] }>();
    for (const e of entries) {
      if (e.entry_type !== 'pulse') continue;
      const meta = e.metadata as Record<string, unknown> | null;
      const created = e.created_at ? new Date(e.created_at) : null;
      if (!created) continue;
      const day = toLocalDateStr(created);
      if (!dates30.includes(day)) continue;
      const body = typeof meta?.body === 'number' ? (meta.body as number) : null;
      const mind = typeof meta?.mind === 'number' ? (meta.mind as number) : null;
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

  // Practice counts + intentions-per-day (last 30). Also collect
  // all-time per-intention and per-category totals for the breakdown.
  const {
    practiceDaysDetail,
    allPracticeDates,
    totalsByIntention,
    totalsByCategory,
    practicesThisWeek,
  } = useMemo(() => {
    const byDay = new Map<string, PracticeDayDetail>();
    const allDates = new Set<string>();
    const byIntention = new Map<string, number>();
    const byCategory = new Map<IntentionCategory, number>();
    const weekCutoff = new Date();
    weekCutoff.setDate(weekCutoff.getDate() - 7);
    let thisWeek = 0;

    for (const e of entries) {
      if (e.entry_type !== 'practice') continue;
      const created = e.created_at ? new Date(e.created_at) : null;
      if (!created) continue;
      const day = toLocalDateStr(created);
      allDates.add(day);
      const meta = e.metadata as Record<string, unknown> | null;
      const title = typeof meta?.intention_title === 'string' ? meta.intention_title : null;
      const category =
        typeof meta?.category === 'string' ? (meta.category as IntentionCategory) : null;
      if (title) byIntention.set(title, (byIntention.get(title) ?? 0) + 1);
      if (category) byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
      if (created >= weekCutoff) thisWeek += 1;
      if (dates30.includes(day)) {
        const existing = byDay.get(day) ?? { date: day, count: 0, intentions: [] };
        existing.count += 1;
        if (title) existing.intentions.push(title);
        byDay.set(day, existing);
      }
    }
    return {
      practiceDaysDetail: byDay,
      allPracticeDates: allDates,
      totalsByIntention: byIntention,
      totalsByCategory: byCategory,
      practicesThisWeek: thisWeek,
    };
  }, [entries, dates30]);

  const { current: currentStreak, best: bestStreak } = useMemo(
    () => computeStreaks(allPracticeDates),
    [allPracticeDates],
  );

  // Phase 5 — patterns I noticed (deterministic correlations) +
  // intention follow-through aggregate. Both are pure derivations
  // over `entries`; no network calls.
  const findings = useMemo(() => computeFindings(entries), [entries]);
  const intentionAggregate = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let total = 0;
    let fully = 0;
    let partially = 0;
    let drifted = 0;
    for (const e of entries) {
      if (e.entry_type !== 'pulse') continue;
      if (new Date(e.created_at).getTime() < cutoff) continue;
      const items = (e.metadata as Record<string, unknown> | null)?.prior_intention_items;
      if (!Array.isArray(items)) continue;
      for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        total += 1;
        const o = (it as { outcome?: unknown }).outcome;
        if (o === 'fully') fully += 1;
        else if (o === 'partially') partially += 1;
        else if (o === 'distracted' || o === 'not') drifted += 1;
      }
    }
    if (total === 0) return null;
    const rate = (fully + partially * 0.5) / total;
    return { total, fully, partially, drifted, rate };
  }, [entries]);

  // Consistency phrasing — "X of last 7 days" instead of streak count.
  // Research from quantified-self + Duolingo retention work shows hard
  // streaks shame the user on a missed day and can drive abandonment;
  // a "rhythm" framing rewards showing up without punishing breaks.
  const practiceDaysLast7 = useMemo(() => {
    const today = new Date();
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = toLocalDateStr(d);
      if (allPracticeDates.has(key)) count += 1;
    }
    return count;
  }, [allPracticeDates]);

  // Voice + word stats for the bottom strip.
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

  // For the intentions breakdown: group all known intentions by
  // category, sorted by completion count desc within each.
  const breakdownByCategory = useMemo(() => {
    const result: Array<{
      category: IntentionCategory;
      total: number;
      intentions: Array<{ title: string; icon: string; slug: string | null; count: number }>;
    }> = [];
    for (const cat of CATEGORY_ORDER) {
      const presets = PRESET_INTENTIONS.filter((p) => p.category === cat);
      const rows = presets
        .map((p) => {
          const practice = INTENTION_PRACTICES.find((ip) => ip.intentionTitle === p.title);
          return {
            title: p.title,
            icon: p.icon,
            slug: practice?.slug ?? null,
            count: totalsByIntention.get(p.title) ?? 0,
          };
        })
        .filter((r) => r.count > 0) // only surface intentions with at least one completion
        .sort((a, b) => b.count - a.count);
      if (rows.length > 0 || (totalsByCategory.get(cat) ?? 0) > 0) {
        result.push({
          category: cat,
          total: totalsByCategory.get(cat) ?? 0,
          intentions: rows,
        });
      }
    }
    return result;
  }, [totalsByIntention, totalsByCategory]);

  const totalPracticesAllTime = Array.from(totalsByIntention.values()).reduce(
    (s, v) => s + v,
    0,
  );

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-24 space-y-5">
      <h1 className="text-2xl font-bold text-text-primary">{t('tab.patterns')}</h1>

      {/* ─── Hero stat block ─────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl border border-primary/20 p-5">
        <p className="text-xs uppercase tracking-wider text-text-tertiary font-semibold">
          This week
        </p>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-4xl font-bold text-text-primary tabular-nums">
            {practicesThisWeek}
          </span>
          <span className="text-sm text-text-secondary">
            practice{practicesThisWeek === 1 ? '' : 's'} done
          </span>
        </div>
        {practiceDaysLast7 > 0 && (
          <div className="flex items-center gap-4 mt-3 text-[11px]">
            {/* Consistency over streaks — counts practice days in the
                rolling last 7, not consecutive-day streaks. A missed
                day no longer resets anything; the user's rhythm just
                ticks down by one and ticks back up next time. */}
            <span className="flex items-center gap-1.5 text-success font-medium">
              ✦ {practiceDaysLast7} {practiceDaysLast7 === 1 ? 'day' : 'days'} of the last 7
            </span>
          </div>
        )}
        {practicesThisWeek === 0 && practiceDaysLast7 === 0 && (
          <p className="text-xs text-text-tertiary mt-2 leading-snug">
            Tap an intention to begin — each has a ~2-minute guided practice.
          </p>
        )}
      </section>

      {/* ─── Latest letter from your guide ────────────────────────────
          The discoverability surface for the /letters archive. Prefers
          the unread item across weekly/monthly/quarterly, falls back to
          the most-recent overall. Tap → /letters/[id] (which marks
          seen). The "see all" link goes to /letters. Hidden when no
          server letters exist yet — the client-generated weekly card
          below still fills the slot. */}
      {latestLetter && (() => {
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
                <Link
                  href="/letters"
                  className="text-xs text-primary hover:underline"
                >
                  See all {totalLetters} →
                </Link>
              )}
            </div>
            <Link
              href={`/letters/${latestLetter.id}`}
              className={`block relative rounded-2xl border p-4 transition-colors ${gradientClass} hover:border-primary/60`}
            >
              {unread && (
                <span
                  aria-hidden
                  className="absolute top-3 right-3 inline-block w-2.5 h-2.5 rounded-full bg-primary"
                />
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
      })()}

      {/* ─── Weekly letter ───────────────────────────────────────────── */}
      {reflection ? (
        <section className="bg-surface rounded-2xl border border-border p-4 space-y-2">
          <p className="text-sm font-semibold text-text-primary">Your week, in a letter</p>
          {reflection.themes && reflection.themes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {reflection.themes.map((th) => (
                <span
                  key={th}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary"
                >
                  {th}
                </span>
              ))}
            </div>
          )}
          <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
            {reflection.letter}
          </p>
        </section>
      ) : (
        <section className="bg-surface rounded-2xl border border-border p-4">
          <p className="text-sm font-semibold text-text-primary mb-1">Your week, in a letter</p>
          <p className="text-xs text-text-tertiary leading-snug">
            Journal for a few days and a weekly reflection will land here every Sunday.
          </p>
        </section>
      )}

      {/* ─── Patterns I noticed (correlations) ───────────────────────
          Deterministic findings over the last 30 days. Surfaces 1-3
          one-sentence statements only when the data crosses a
          minimum-effect threshold (so a single weird day can't
          drive a "finding"). Section is hidden entirely when no
          findings clear the bar — empty space beats meaningless
          space. */}
      {findings.length > 0 && (
        <section className="bg-surface rounded-2xl border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-primary">Patterns I noticed</h2>
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

      {/* ─── Intention follow-through (last 30 days) ──────────────── */}
      {intentionAggregate && (
        <section className="bg-surface rounded-2xl border border-border p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Intention follow-through</h2>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              Last 30 days of evening recall.
            </p>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-text-primary tabular-nums">
                {Math.round(intentionAggregate.rate * 100)}%
              </span>
              <span className="text-xs text-text-secondary">followed through</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-success/15 text-success font-medium">
                ✓ {intentionAggregate.fully} fully
              </span>
              {intentionAggregate.partially > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                  ~ {intentionAggregate.partially} partial
                </span>
              )}
              {intentionAggregate.drifted > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-elevated text-text-secondary font-medium">
                  ⤳ {intentionAggregate.drifted} drifted
                </span>
              )}
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-elevated text-text-tertiary">
                {intentionAggregate.total} total
              </span>
            </div>
          </div>
        </section>
      )}

      {/* ─── Pulse trend ─────────────────────────────────────────────── */}
      <section className="bg-surface rounded-2xl border border-border p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Pulse trend</h2>
        <PulseTrend points={pulsePoints} />
      </section>

      {/* ─── Journaling frequency ────────────────────────────────────── */}
      <section className="bg-surface rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Journaling activity</h2>
          <span className="text-[10px] text-text-tertiary">
            {journalEntriesThisWeek} this week · tap a day
          </span>
        </div>
        <JournalingHeatmap
          daysDetail={journalDaysDetail}
          selectedDate={selectedJournalDate}
          onSelect={setSelectedJournalDate}
        />
      </section>

      {/* ─── Practice heatmap ────────────────────────────────────────── */}
      <section className="bg-surface rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Practice consistency</h2>
          <span className="text-[10px] text-text-tertiary">Tap a day</span>
        </div>
        <PracticeHeatmap
          daysDetail={practiceDaysDetail}
          selectedDate={selectedHeatmapDate}
          onSelect={setSelectedHeatmapDate}
        />
        {totalPracticesAllTime === 0 && (
          <p className="text-xs text-text-tertiary leading-snug">
            No practices yet — tap an intention to begin.
          </p>
        )}
      </section>

      {/* ─── Intentions breakdown (collapsible) ──────────────────────── */}
      {totalPracticesAllTime > 0 && (
        <section className="bg-surface rounded-2xl border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setExpandBreakdown((v) => !v)}
            className="w-full flex items-center justify-between p-4 hover:bg-surface-elevated transition-colors"
          >
            <div className="text-left">
              <h2 className="text-sm font-semibold text-text-primary">Intentions breakdown</h2>
              <p className="text-[11px] text-text-tertiary mt-0.5">
                {totalPracticesAllTime} total · by category + intention
              </p>
            </div>
            <span
              className={`text-text-tertiary transition-transform ${
                expandBreakdown ? 'rotate-90' : ''
              }`}
              aria-hidden
            >
              ›
            </span>
          </button>
          {expandBreakdown && (
            <div className="px-4 pb-4 space-y-4">
              {/* Per-category bars */}
              <div className="space-y-2">
                {breakdownByCategory.map((row) => {
                  const max = Math.max(
                    1,
                    ...breakdownByCategory.map((r) => r.total),
                  );
                  const pct = (row.total / max) * 100;
                  const c = CATEGORY_COLORS[row.category];
                  return (
                    <div key={row.category} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={`font-semibold ${c.text}`}>{c.label}</span>
                        <span className="text-text-tertiary tabular-nums">{row.total}</span>
                      </div>
                      <div className={`h-2 rounded-full ${c.bg} overflow-hidden`}>
                        <div
                          className={`h-full rounded-full ${c.bar} transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Per-intention rows, grouped under their category */}
              <div className="space-y-3 pt-2 border-t border-border">
                {breakdownByCategory
                  .filter((r) => r.intentions.length > 0)
                  .map((row) => {
                    const c = CATEGORY_COLORS[row.category];
                    return (
                      <div key={row.category} className="space-y-1">
                        <p className={`text-[10px] uppercase tracking-wider font-semibold ${c.text}`}>
                          {c.label}
                        </p>
                        {row.intentions.map((it) => {
                          const content = (
                            <div className="flex items-center gap-2 py-1.5">
                              <span
                                className={`w-7 h-7 rounded-full flex items-center justify-center text-sm ${c.bg}`}
                              >
                                {it.icon}
                              </span>
                              <span className="flex-1 text-sm text-text-primary truncate">
                                {it.title}
                              </span>
                              <span className="text-xs font-semibold text-text-secondary tabular-nums">
                                {it.count} ✓
                              </span>
                            </div>
                          );
                          return it.slug ? (
                            <button
                              key={it.title}
                              type="button"
                              onClick={() => router.push(`/practice/${it.slug}`)}
                              className="w-full text-left rounded-lg hover:bg-surface-elevated transition-colors px-2"
                            >
                              {content}
                            </button>
                          ) : (
                            <div key={it.title} className="px-2">
                              {content}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                {breakdownByCategory.every((r) => r.intentions.length === 0) && (
                  <p className="text-xs text-text-tertiary italic">
                    Complete a practice to see it broken down here.
                  </p>
                )}
              </div>
              <Link
                href="/intentions"
                className="block text-center text-xs text-primary font-medium pt-1"
              >
                Go to Intentions →
              </Link>
            </div>
          )}
        </section>
      )}

      {/* ─── Stats strip ─────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3">
        <div className="bg-surface rounded-2xl border border-border p-3">
          <p className="text-2xl font-bold text-text-primary tabular-nums">
            {voiceThisWeek}
          </p>
          <p className="text-[11px] text-text-tertiary leading-snug">
            voice {voiceThisWeek === 1 ? 'entry' : 'entries'} this week
          </p>
        </div>
        <div className="bg-surface rounded-2xl border border-border p-3">
          <p className="text-2xl font-bold text-text-primary tabular-nums">
            {wordsThisWeek.toLocaleString()}
          </p>
          <p className="text-[11px] text-text-tertiary leading-snug">
            words journaled
          </p>
        </div>
      </section>
    </div>
  );
}
