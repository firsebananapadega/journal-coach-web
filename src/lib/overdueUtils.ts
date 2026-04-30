// Overdue helpers shared between the OverdueSection component and any
// future surfaces (notifications, pattern analytics, etc.).
//
// Definitions:
//   - "Overdue" = a task whose due_date is strictly before today AND
//     completed = false. Tasks due today are NOT overdue.
//   - All comparisons are done as YYYY-MM-DD string-comparison so we
//     don't have to deal with timezone shifts on the date field
//     (Postgres date is timezone-naive; the column stores the user's
//     local "due day").

import type { Task } from '@/stores/taskStore';
import { toLocalDateStr } from './dateUtils';

export function isOverdue(task: Task, todayStr: string = toLocalDateStr(new Date())): boolean {
  if (task.completed) return false;
  if (!task.due_date) return false;
  return task.due_date < todayStr;
}

export function daysOverdue(task: Task, todayStr: string = toLocalDateStr(new Date())): number {
  if (!task.due_date) return 0;
  // Both YYYY-MM-DD strings; convert to UTC dates for math.
  const a = new Date(`${task.due_date}T00:00:00`);
  const b = new Date(`${todayStr}T00:00:00`);
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

/** Format an overdue task's age for inline display. Examples:
 *    1 → "1d ago"
 *    5 → "5d ago"
 *    7 → "1w ago"
 *    14 → "2w ago"
 *    30+ → "Apr 22" (raw localized date)
 *  Keeps the chrome calm — we don't want the user staring at "37d
 *  ago" on every overdue row. Beyond ~4 weeks, the absolute date is
 *  more useful than a rolling counter.
 */
export function formatOverdueAge(task: Task, todayStr: string = toLocalDateStr(new Date())): string {
  const days = daysOverdue(task, todayStr);
  if (days <= 0) return '';
  if (days < 7) return `${days}d ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
  }
  // 30+ days — show the absolute date instead of a growing counter.
  if (!task.due_date) return '';
  const d = new Date(`${task.due_date}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Threshold for the "Still relevant?" stale prompt. Items overdue
 *  this long get a small affordance below them offering Archive /
 *  Today / Reschedule. */
export const STALE_THRESHOLD_DAYS = 14;

/** Threshold for the "bankruptcy escape" banner. When the user has
 *  this many overdue items, surface a one-tap "archive everything"
 *  button — the nuclear option for users who've fallen off the wagon. */
export const BANKRUPTCY_THRESHOLD = 30;

/** Visual cap — when overdue count exceeds this, the section
 *  collapses to first N + "+ M more (tap to expand)". Lets the user
 *  see scope without drowning. */
export const OVERDUE_VISIBLE_CAP = 7;

export function isStale(task: Task, todayStr: string = toLocalDateStr(new Date())): boolean {
  return daysOverdue(task, todayStr) >= STALE_THRESHOLD_DAYS;
}
