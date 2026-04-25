// Shared eligibility gates for the weekly / monthly / quarterly
// letter crons.
//
// Why three gates instead of "≥ N entries":
//   - Account age — a user 3 days into the app shouldn't get a
//     "monthly pattern" letter. Pattern claims need genuine
//     longitudinal data, not a binge weekend.
//   - Active days — distinct calendar days with ≥ 1 entry. Guards
//     against the same binge that an entry-count gate misses.
//   - Entry count — the existing floor (Pennebaker minimum for
//     weekly, thematic-saturation floor for monthly).
//
// Research:
//   - Guest, Bunce & Johnson (2006), Hennink et al. (2019): thematic
//     saturation reached at 12-20 sources.
//   - Pennebaker & Beall (1986); Frattaroli (2006) meta-analysis:
//     expressive writing protocol = 3-4 sessions per week.
//   - Lally et al. (2010): habit automaticity at mean 66 days
//     (range 18-254). 45 days = midpoint, supports quarterly gate.
//   - McAdams (1993, 2013): narrative-arc construction needs
//     multi-period spans, not single bursts.

export interface EligibilityCheck {
  ok: boolean;
  /** Short tag like "gate-account-age-12d" or "gate-active-days-4".
   *  Surfaced in the cron's results array so debug can diff "why
   *  didn't this user get a letter." */
  reason?: string;
}

export function checkAccountAge(
  createdAt: string | null | undefined,
  minDays: number,
): EligibilityCheck {
  if (!createdAt) return { ok: false, reason: 'gate-no-account-created-at' };
  const ageDays =
    (Date.now() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays < minDays) {
    return { ok: false, reason: `gate-account-age-${Math.floor(ageDays)}d` };
  }
  return { ok: true };
}

/** Distinct calendar dates (YYYY-MM-DD, UTC) covered by `entries`. */
export function countActiveDays(entries: { created_at: string }[]): number {
  const days = new Set<string>();
  for (const e of entries) {
    days.add(new Date(e.created_at).toISOString().slice(0, 10));
  }
  return days.size;
}

export function checkActiveDays(
  entries: { created_at: string }[],
  minDays: number,
): EligibilityCheck {
  const n = countActiveDays(entries);
  if (n < minDays) return { ok: false, reason: `gate-active-days-${n}` };
  return { ok: true };
}

export function checkEntryCount(
  entries: unknown[],
  minCount: number,
): EligibilityCheck {
  if (entries.length < minCount) {
    return { ok: false, reason: `gate-entries-${entries.length}` };
  }
  return { ok: true };
}

/** Centralized thresholds — bump in one place when research updates. */
export const ELIGIBILITY = {
  weekly: { accountAgeDays: 7, minEntries: 3, minActiveDays: 3 },
  monthly: { accountAgeDays: 30, minEntries: 15, minActiveDays: 10 },
  quarterly: { accountAgeDays: 45, minEntries: 30, minActiveDays: 20 },
} as const;
