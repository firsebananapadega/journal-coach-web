// Weekly behavior signals for the guide letter prompt.
//
// The Phase-1 prompt only saw journal text. The Phase-2A change is to
// also feed Gemini what the user actually DID this week — habit
// completion rate, body/mind from pulses, intention practice counts,
// task completion %, notebook distribution. With these in the prompt
// the letter can say "you ran 4 of 7 days and your evening mind score
// climbed from 3 to 4" instead of generic "you've been reflecting on
// patterns of stress."
//
// All queries use the service-role admin client passed in by the cron
// route so RLS doesn't get in the way. Pure-ish: no side effects, no
// throws — every section degrades gracefully to its empty/null shape
// if the underlying query fails.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface WeeklySignals {
  /** Period covered, ISO YYYY-MM-DD inclusive. */
  windowStart: string;
  windowEnd: string;
  habits: {
    activeCount: number;
    completionsThisWeek: number;
    /** Per-habit row, only habits with ≥1 completion this week. */
    perHabit: Array<{ name: string; completions: number; daysOfWindow: number }>;
  };
  pulses: {
    morningCount: number;
    eveningCount: number;
    bodyAvg: number | null;
    mindAvg: number | null;
    /** Most-frequent body label this week. */
    dominantBody: string | null;
    dominantMind: string | null;
  };
  practices: {
    total: number;
    /** category → count. Categories: presence | body | mind | connection | growth | purpose */
    byCategory: Record<string, number>;
  };
  tasks: {
    completed: number;
    created: number;
    completionRate: number | null; // 0..1, null when created=0
  };
  notebooks: {
    /** Notebook name → entry count this week. Excludes pulse + practice. */
    byName: Record<string, number>;
    /** Notebook with the most entries; null if no entries. */
    dominant: string | null;
  };
  /** Aggregate of evening-pulse intention recall outcomes. Counts
   *  individual intention items (not pulses), since each evening
   *  pulse can carry multiple. Drives the "you followed through on
   *  X of Y intentions this week" line in letters. */
  intentions: {
    itemsTotal: number;          // every prior_intention_items entry counted across the week
    fully: number;
    partially: number;
    distracted: number;
    not: number;
    /** Followed-through rate = (fully + 0.5 * partially) / itemsTotal. Null when itemsTotal=0. */
    followThroughRate: number | null;
  };
}

const EMPTY_SIGNALS: Omit<WeeklySignals, 'windowStart' | 'windowEnd'> = {
  habits: { activeCount: 0, completionsThisWeek: 0, perHabit: [] },
  pulses: {
    morningCount: 0,
    eveningCount: 0,
    bodyAvg: null,
    mindAvg: null,
    dominantBody: null,
    dominantMind: null,
  },
  practices: { total: 0, byCategory: {} },
  tasks: { completed: 0, created: 0, completionRate: null },
  notebooks: { byName: {}, dominant: null },
  intentions: {
    itemsTotal: 0,
    fully: 0,
    partially: 0,
    distracted: 0,
    not: 0,
    followThroughRate: null,
  },
};

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mostFrequent(values: (string | null | undefined)[]): string | null {
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

export async function gatherWeeklySignals(
  admin: SupabaseClient,
  userId: string,
  /** End of the week — defaults to now. The window is the 7-day span ending here. */
  end: Date = new Date(),
): Promise<WeeklySignals> {
  const windowEnd = isoDate(end);
  const startDate = new Date(end);
  startDate.setDate(startDate.getDate() - 7);
  const windowStart = isoDate(startDate);
  const startIso = startDate.toISOString();

  const signals: WeeklySignals = {
    windowStart,
    windowEnd,
    ...JSON.parse(JSON.stringify(EMPTY_SIGNALS)),
  };

  // ── Habits ────────────────────────────────────────────────────
  try {
    const { data: habits } = await admin
      .from('habits')
      .select('id, name, is_active')
      .eq('user_id', userId);
    const activeHabits = ((habits ?? []) as Array<{ id: string; name: string; is_active: boolean }>)
      .filter((h) => h.is_active);
    signals.habits.activeCount = activeHabits.length;

    if (activeHabits.length > 0) {
      const habitIds = activeHabits.map((h) => h.id);
      const { data: comps } = await admin
        .from('habit_completions')
        .select('habit_id, completed_date')
        .eq('user_id', userId)
        .gte('completed_date', windowStart)
        .lte('completed_date', windowEnd)
        .in('habit_id', habitIds);

      const compRows = (comps ?? []) as Array<{ habit_id: string; completed_date: string }>;
      signals.habits.completionsThisWeek = compRows.length;

      const perHabitMap = new Map<string, number>();
      for (const r of compRows) {
        perHabitMap.set(r.habit_id, (perHabitMap.get(r.habit_id) ?? 0) + 1);
      }
      const idToName = new Map(activeHabits.map((h) => [h.id, h.name]));
      signals.habits.perHabit = Array.from(perHabitMap.entries())
        .map(([habitId, completions]) => ({
          name: idToName.get(habitId) ?? 'Habit',
          completions,
          daysOfWindow: 7,
        }))
        .sort((a, b) => b.completions - a.completions);
    }
  } catch {
    // Leave habits at their empty shape.
  }

  // ── Pulses + Practices (both live in journal_entries) ────────
  try {
    const { data: entries } = await admin
      .from('journal_entries')
      .select('id, entry_type, metadata, notebook_id, created_at')
      .eq('user_id', userId)
      .gte('created_at', startIso);
    type Row = {
      id: string;
      entry_type: string;
      metadata: Record<string, unknown> | null;
      notebook_id: string | null;
      created_at: string;
    };
    const rows = (entries ?? []) as Row[];

    const pulses = rows.filter((r) => r.entry_type === 'pulse');
    const practices = rows.filter((r) => r.entry_type === 'practice');
    const reflective = rows.filter(
      (r) => r.entry_type !== 'pulse' && r.entry_type !== 'practice',
    );

    // Pulses
    let morningCount = 0;
    let eveningCount = 0;
    const bodyVals: number[] = [];
    const mindVals: number[] = [];
    const bodyLabels: string[] = [];
    const mindLabels: string[] = [];
    // Intention recall aggregates (only present on evening pulses
    // where the user actually answered the recall step).
    let intentionItemsTotal = 0;
    let intentionFully = 0;
    let intentionPartially = 0;
    let intentionDistracted = 0;
    let intentionNot = 0;
    for (const p of pulses) {
      const m = p.metadata ?? {};
      if (m.pulseMode === 'morning') morningCount++;
      if (m.pulseMode === 'evening') eveningCount++;
      const bs = typeof m.body_score === 'number' ? m.body_score : null;
      const ms = typeof m.mind_score === 'number' ? m.mind_score : null;
      if (bs !== null) bodyVals.push(bs);
      if (ms !== null) mindVals.push(ms);
      if (typeof m.body_label === 'string') bodyLabels.push(m.body_label);
      if (typeof m.mind_label === 'string') mindLabels.push(m.mind_label);
      // Intention recall — Phase 4 schema.
      const items = m.prior_intention_items;
      if (Array.isArray(items)) {
        for (const it of items) {
          if (!it || typeof it !== 'object') continue;
          intentionItemsTotal += 1;
          const o = (it as { outcome?: unknown }).outcome;
          if (o === 'fully') intentionFully += 1;
          else if (o === 'partially') intentionPartially += 1;
          else if (o === 'distracted') intentionDistracted += 1;
          else if (o === 'not') intentionNot += 1;
        }
      }
    }
    signals.intentions.itemsTotal = intentionItemsTotal;
    signals.intentions.fully = intentionFully;
    signals.intentions.partially = intentionPartially;
    signals.intentions.distracted = intentionDistracted;
    signals.intentions.not = intentionNot;
    signals.intentions.followThroughRate =
      intentionItemsTotal === 0
        ? null
        : (intentionFully + intentionPartially * 0.5) / intentionItemsTotal;
    const avg = (xs: number[]) =>
      xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
    signals.pulses.morningCount = morningCount;
    signals.pulses.eveningCount = eveningCount;
    signals.pulses.bodyAvg = avg(bodyVals);
    signals.pulses.mindAvg = avg(mindVals);
    signals.pulses.dominantBody = mostFrequent(bodyLabels);
    signals.pulses.dominantMind = mostFrequent(mindLabels);

    // Practices
    signals.practices.total = practices.length;
    for (const p of practices) {
      const cat = (p.metadata ?? {}).category;
      if (typeof cat === 'string' && cat) {
        signals.practices.byCategory[cat] =
          (signals.practices.byCategory[cat] ?? 0) + 1;
      }
    }

    // Notebook distribution (reflective entries only)
    if (reflective.length > 0) {
      const notebookIds = Array.from(
        new Set(reflective.map((r) => r.notebook_id).filter((x): x is string => !!x)),
      );
      if (notebookIds.length > 0) {
        const { data: nbs } = await admin
          .from('notebooks')
          .select('id, name')
          .in('id', notebookIds);
        const idToName = new Map(((nbs ?? []) as { id: string; name: string }[]).map((n) => [n.id, n.name]));
        const counts = new Map<string, number>();
        for (const r of reflective) {
          const name = (r.notebook_id && idToName.get(r.notebook_id)) || 'Unfiled';
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
        for (const [name, c] of counts) signals.notebooks.byName[name] = c;
        let topName: string | null = null;
        let topCount = 0;
        for (const [name, c] of counts) {
          if (c > topCount) {
            topName = name;
            topCount = c;
          }
        }
        signals.notebooks.dominant = topName;
      }
    }
  } catch {
    // pulses/practices/notebooks stay empty
  }

  // ── Tasks ────────────────────────────────────────────────────
  try {
    const { data: tasks } = await admin
      .from('tasks')
      .select('id, completed, created_at')
      .eq('user_id', userId)
      .gte('created_at', startIso);
    const trows = (tasks ?? []) as Array<{ id: string; completed: boolean; created_at: string }>;
    signals.tasks.created = trows.length;
    signals.tasks.completed = trows.filter((t) => t.completed).length;
    signals.tasks.completionRate =
      trows.length === 0 ? null : signals.tasks.completed / trows.length;
  } catch {
    // tasks stay empty
  }

  return signals;
}

/** Compact textual summary the prompt builder can paste verbatim. */
export function formatSignalsForPrompt(s: WeeklySignals): string {
  const lines: string[] = [];

  // Habits — only mention if there's something to mention.
  if (s.habits.activeCount > 0) {
    if (s.habits.perHabit.length === 0) {
      lines.push(`- Habits: ${s.habits.activeCount} tracked, none completed this week.`);
    } else {
      const top = s.habits.perHabit
        .slice(0, 4)
        .map((h) => `${h.name} ×${h.completions}`)
        .join(', ');
      lines.push(
        `- Habits: ${s.habits.completionsThisWeek} completions across ${s.habits.activeCount} active habits (${top}).`,
      );
    }
  }

  // Pulses
  const pulseTotal = s.pulses.morningCount + s.pulses.eveningCount;
  if (pulseTotal > 0) {
    const parts: string[] = [];
    parts.push(`${s.pulses.morningCount} morning + ${s.pulses.eveningCount} evening pulse(s)`);
    if (s.pulses.bodyAvg !== null) parts.push(`body avg ${s.pulses.bodyAvg}/5`);
    if (s.pulses.mindAvg !== null) parts.push(`mind avg ${s.pulses.mindAvg}/5`);
    if (s.pulses.dominantBody) parts.push(`body mostly "${s.pulses.dominantBody}"`);
    if (s.pulses.dominantMind) parts.push(`mind mostly "${s.pulses.dominantMind}"`);
    lines.push(`- Pulses: ${parts.join(', ')}.`);
  }

  // Practices
  if (s.practices.total > 0) {
    const cats = Object.entries(s.practices.byCategory)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => `${k} ×${v}`)
      .join(', ');
    lines.push(`- Intention practices: ${s.practices.total} total (${cats}).`);
  }

  // Tasks
  if (s.tasks.created > 0) {
    const pct =
      s.tasks.completionRate === null
        ? ''
        : ` (${Math.round(s.tasks.completionRate * 100)}%)`;
    lines.push(
      `- Tasks: ${s.tasks.completed} of ${s.tasks.created} completed${pct}.`,
    );
  }

  // Intention follow-through — only when the user actually used the
  // evening recall (itemsTotal > 0). Reports the count split + the
  // weighted follow-through rate so the letter can ground a
  // sentence like "you followed through on 4 of 7 morning intentions
  // this week."
  if (s.intentions.itemsTotal > 0) {
    const pct =
      s.intentions.followThroughRate === null
        ? ''
        : ` (${Math.round(s.intentions.followThroughRate * 100)}% follow-through)`;
    const splitParts: string[] = [];
    if (s.intentions.fully > 0) splitParts.push(`${s.intentions.fully} fully`);
    if (s.intentions.partially > 0) splitParts.push(`${s.intentions.partially} partial`);
    if (s.intentions.distracted > 0) splitParts.push(`${s.intentions.distracted} drifted`);
    if (s.intentions.not > 0) splitParts.push(`${s.intentions.not} not at all`);
    lines.push(
      `- Intention follow-through: ${s.intentions.itemsTotal} morning intention(s) reviewed${pct}; ${splitParts.join(', ')}.`,
    );
  }

  // Notebooks — only call out distribution when there's variety.
  const nbCount = Object.keys(s.notebooks.byName).length;
  if (nbCount > 0) {
    if (nbCount === 1) {
      const [only] = Object.keys(s.notebooks.byName);
      lines.push(`- Most entries landed in "${only}".`);
    } else {
      const top = Object.entries(s.notebooks.byName)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([k, v]) => `${k} ×${v}`)
        .join(', ');
      lines.push(`- Notebook spread: ${top}.`);
    }
  }

  if (lines.length === 0) return '';
  return `\n\nBehavioral signals from the past 7 days (use these to ground specific observations — don't list them mechanically):\n${lines.join('\n')}`;
}
