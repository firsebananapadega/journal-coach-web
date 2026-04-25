// Correlation surfacing — the "Patterns I noticed" section on
// /patterns. Surfaces 1-3 deterministic findings the user can read
// at a glance, computed from data that already lives on the device
// (no network round-trip, no LLM call).
//
// Design choices:
//   * No fancy stats. Just compares "on days X" vs "on days not X"
//     means, with a minimum sample size guard. Simple findings the
//     user can reason about, not p-values.
//   * Threshold: at least 7 days on EACH side of any binary split,
//     so a finding can't ride on a single outlier.
//   * Effect-size threshold: only surface when the difference is
//     ≥ 0.4 on the 1-5 scale (i.e. a meaningful jump, not statistical
//     noise).
//   * Sorted strongest-effect-first; cap at 3 findings so the
//     section stays scannable.
//
// The output is a `Finding` array the UI renders as plain English
// sentences. No charts in v1.

import type { JournalEntry } from '@/stores/journalStore';

export interface Finding {
  /** Plain-English sentence. UI renders verbatim. */
  text: string;
  /** Difference in mean (effect-size) — used to sort and to render
   *  any small "+0.6" badge if we want one later. */
  effect: number;
  /** Internal label so future code can dedupe / inspect. */
  kind: string;
}

interface DayBucket {
  day: string;            // "YYYY-MM-DD"
  bodyAvg: number | null; // average body_score across pulses on this day
  mindAvg: number | null;
  /** Count of intention items rated 'fully' by the evening pulse on
   *  this day. Used by the intention-vs-mood split. */
  fullyCount: number;
  /** Count of intention items NOT 'fully' (partial/distracted/not). */
  unfullyCount: number;
  /** Was this entry-day reflective (≥1 non-pulse, non-practice
   *  entry)? Distinguishes "wrote a real journal entry" from "only
   *  did a pulse." */
  hasReflectiveEntry: boolean;
  /** Body label tag for the day (most-frequent picked among pulses
   *  on this day). */
  bodyLabel: string | null;
  mindLabel: string | null;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mostFreq(values: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let top: string | null = null;
  let topCount = 0;
  for (const [k, c] of counts) {
    if (c > topCount) {
      top = k;
      topCount = c;
    }
  }
  return top;
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Build the per-day bucket map over the last `windowDays` days from
 *  the user's entries. */
export function buildDayBuckets(
  entries: JournalEntry[],
  windowDays = 30,
): Map<string, DayBucket> {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const recent = entries.filter((e) => new Date(e.created_at).getTime() >= cutoff);

  const buckets = new Map<string, DayBucket>();
  for (const e of recent) {
    const key = dayKey(e.created_at);
    let b = buckets.get(key);
    if (!b) {
      b = {
        day: key,
        bodyAvg: null,
        mindAvg: null,
        fullyCount: 0,
        unfullyCount: 0,
        hasReflectiveEntry: false,
        bodyLabel: null,
        mindLabel: null,
      };
      buckets.set(key, b);
    }
    if (e.entry_type !== 'pulse' && e.entry_type !== 'practice') {
      b.hasReflectiveEntry = true;
    }
  }

  // Pulses — collect raw scores per day, then average.
  const bodyValsByDay = new Map<string, number[]>();
  const mindValsByDay = new Map<string, number[]>();
  const bodyLabelsByDay = new Map<string, string[]>();
  const mindLabelsByDay = new Map<string, string[]>();
  for (const e of recent) {
    if (e.entry_type !== 'pulse') continue;
    const m = (e.metadata ?? {}) as Record<string, unknown>;
    const key = dayKey(e.created_at);
    const bs = typeof m.body_score === 'number' ? m.body_score : null;
    const ms = typeof m.mind_score === 'number' ? m.mind_score : null;
    if (bs !== null) {
      const arr = bodyValsByDay.get(key) ?? [];
      arr.push(bs);
      bodyValsByDay.set(key, arr);
    }
    if (ms !== null) {
      const arr = mindValsByDay.get(key) ?? [];
      arr.push(ms);
      mindValsByDay.set(key, arr);
    }
    if (typeof m.body_label === 'string') {
      const arr = bodyLabelsByDay.get(key) ?? [];
      arr.push(m.body_label as string);
      bodyLabelsByDay.set(key, arr);
    }
    if (typeof m.mind_label === 'string') {
      const arr = mindLabelsByDay.get(key) ?? [];
      arr.push(m.mind_label as string);
      mindLabelsByDay.set(key, arr);
    }
    // Intention follow-through — count items per outcome.
    const items = m.prior_intention_items;
    if (Array.isArray(items)) {
      for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        const o = (it as { outcome?: unknown }).outcome;
        let b = buckets.get(key);
        if (!b) continue;
        if (o === 'fully') b.fullyCount += 1;
        else if (o === 'partially' || o === 'distracted' || o === 'not') b.unfullyCount += 1;
      }
    }
  }

  for (const [key, b] of buckets) {
    const bv = bodyValsByDay.get(key);
    const mv = mindValsByDay.get(key);
    b.bodyAvg = bv && bv.length > 0 ? avg(bv) : null;
    b.mindAvg = mv && mv.length > 0 ? avg(mv) : null;
    b.bodyLabel = mostFreq(bodyLabelsByDay.get(key) ?? []);
    b.mindLabel = mostFreq(mindLabelsByDay.get(key) ?? []);
  }

  return buckets;
}

/** Generic A/B compare. Returns the difference of means (A - B), and
 *  the size of each side. */
function compareMeans(
  a: number[],
  b: number[],
): { diff: number; nA: number; nB: number; meanA: number; meanB: number } {
  const meanA = avg(a);
  const meanB = avg(b);
  return { diff: meanA - meanB, nA: a.length, nB: b.length, meanA, meanB };
}

const MIN_PER_SIDE = 7;
const MIN_EFFECT = 0.4;

interface FindingDraft {
  text: string;
  effect: number;
  kind: string;
}

/**
 * Compute up to 3 findings from the user's entries. Pure function —
 * call from anywhere. Empty array when nothing crosses threshold.
 */
export function computeFindings(entries: JournalEntry[]): Finding[] {
  const buckets = buildDayBuckets(entries, 30);
  const days = Array.from(buckets.values());

  const drafts: FindingDraft[] = [];

  // ── Reflective journaling vs. evening mind score ──
  const wroteMind = days
    .filter((d) => d.hasReflectiveEntry && d.mindAvg !== null)
    .map((d) => d.mindAvg as number);
  const noWriteMind = days
    .filter((d) => !d.hasReflectiveEntry && d.mindAvg !== null)
    .map((d) => d.mindAvg as number);
  if (wroteMind.length >= MIN_PER_SIDE && noWriteMind.length >= MIN_PER_SIDE) {
    const r = compareMeans(wroteMind, noWriteMind);
    if (Math.abs(r.diff) >= MIN_EFFECT) {
      drafts.push({
        kind: 'reflective-vs-mind',
        effect: r.diff,
        text:
          r.diff > 0
            ? `On days you journaled (beyond the pulse), your mind score averaged ${r.meanA.toFixed(1)} vs. ${r.meanB.toFixed(1)} on days you didn't.`
            : `Interesting — your mind score averaged ${r.meanA.toFixed(1)} on days you journaled vs. ${r.meanB.toFixed(1)} on days you didn't. Not all reflection feels lighter in the moment.`,
      });
    }
  }

  // ── Intention follow-through vs. evening mind score ──
  const followedMind = days
    .filter((d) => d.fullyCount > 0 && d.mindAvg !== null)
    .map((d) => d.mindAvg as number);
  const driftedMind = days
    .filter((d) => d.unfullyCount > 0 && d.fullyCount === 0 && d.mindAvg !== null)
    .map((d) => d.mindAvg as number);
  if (followedMind.length >= MIN_PER_SIDE && driftedMind.length >= MIN_PER_SIDE) {
    const r = compareMeans(followedMind, driftedMind);
    if (Math.abs(r.diff) >= MIN_EFFECT) {
      drafts.push({
        kind: 'follow-through-vs-mind',
        effect: r.diff,
        text:
          r.diff > 0
            ? `On days you followed through on your morning intention, your mind score averaged ${r.meanA.toFixed(1)} vs. ${r.meanB.toFixed(1)} on days you drifted.`
            : `Curious — on days you drifted from your morning intention, your mind score was ${r.meanB.toFixed(1)} vs. ${r.meanA.toFixed(1)} when you followed through. The "should" might be costing you.`,
      });
    }
  }

  // ── Body vs mind co-movement ──
  const matched = days
    .filter((d) => d.bodyAvg !== null && d.mindAvg !== null)
    .map((d) => ({ b: d.bodyAvg as number, m: d.mindAvg as number }));
  if (matched.length >= MIN_PER_SIDE * 2) {
    // Crude correlation check: split by body high (≥4) vs low (<4)
    // and compare mean mind score on each side. Avoids pulling in a
    // proper Pearson r calc for v1.
    const bodyHigh = matched.filter((p) => p.b >= 4).map((p) => p.m);
    const bodyLow = matched.filter((p) => p.b < 4).map((p) => p.m);
    if (bodyHigh.length >= MIN_PER_SIDE && bodyLow.length >= MIN_PER_SIDE) {
      const r = compareMeans(bodyHigh, bodyLow);
      if (Math.abs(r.diff) >= MIN_EFFECT) {
        drafts.push({
          kind: 'body-mind-coupling',
          effect: r.diff,
          text:
            r.diff > 0
              ? `Your mind tracks your body — when your body score was 4+, mind averaged ${r.meanA.toFixed(1)} vs. ${r.meanB.toFixed(1)} on lower-body days.`
              : `Surprisingly, your mind ran higher on lower-body days (${r.meanB.toFixed(1)} vs. ${r.meanA.toFixed(1)}). Less drive can mean less self-judgment.`,
        });
      }
    }
  }

  // Sort by absolute effect size, take 3.
  drafts.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
  return drafts.slice(0, 3).map((d) => ({
    text: d.text,
    effect: d.effect,
    kind: d.kind,
  }));
}
