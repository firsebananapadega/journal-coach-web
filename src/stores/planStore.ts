import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/withTimeout';
import { isOnline } from '../lib/networkStatus';
import { useNotebookStore } from './notebookStore';

// WOOP-grounded plans (Wish / Outcome / Obstacle / Plan).
//
// One ACTIVE plan at a time per user — research on goal saturation
// (HBS "Goals Gone Wild" 2009) is unambiguous that competing goals
// crowd each other out. The cap is enforced at the application layer:
// fetchActivePlan returns the one with status='active'; createPlan
// flips any prior active plan to 'archived' before inserting.
//
// Each plan has 1–3 plan_items. Each item is one obstacle paired
// with one if-then statement. Daily check-offs go to
// plan_item_completions (one row per item per day).

const READ_MS = 15000;
const WRITE_MS = 15000;

export interface Plan {
  id: string;
  user_id: string;
  title: string;
  wish: string;
  outcome: string;
  status: 'active' | 'completed' | 'archived';
  source_entry_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanItem {
  id: string;
  plan_id: string;
  obstacle_text: string;
  if_then_text: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PlanItemCompletion {
  id: string;
  plan_item_id: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
  created_at: string;
}

/** Bundled view used by ActivePlanCard. */
export interface ActivePlanView {
  plan: Plan;
  items: PlanItem[];
  /** Today's completion state per item (true = checked off, false =
   *  explicitly marked not-done, undefined = no row yet). */
  todayCompletions: Map<string, boolean>;
  /** All completion rows from the last 30 days — used by Optimize
   *  to compute working/not-working stats. */
  recentCompletions: PlanItemCompletion[];
}

interface PlanState {
  active: ActivePlanView | null;
  loading: boolean;
  error: string | null;
  hasFetched: boolean;

  fetchActive: () => Promise<void>;
  createPlan: (input: {
    wish: string;
    outcome: string;
    obstacles: Array<{ obstacle_text: string; if_then_text: string }>;
    source_entry_id?: string | null;
  }) => Promise<Plan | null>;
  toggleTodayCompletion: (itemId: string) => Promise<void>;
  archivePlan: (planId: string) => Promise<void>;
  /** Replace the items for an existing plan (used by Optimize). */
  replaceItems: (
    planId: string,
    items: Array<{ obstacle_text: string; if_then_text: string }>,
  ) => Promise<void>;
  reset: () => void;
}

function todayLocalDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function thirtyDaysAgoStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function deriveTitle(wish: string): string {
  const trimmed = wish.trim();
  if (trimmed.length <= 60) return trimmed;
  return trimmed.slice(0, 57) + '…';
}

/** Write a journal entry into the user's Plans notebook. Lazily
 *  materializes the notebook via ensurePlansNotebook so the very
 *  first plan-save creates it. Errors are swallowed — the journal
 *  entry is a side-record, not load-bearing. */
async function writePlanEntry(input: {
  userId: string;
  title: string;
  contentText: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  try {
    const notebook = await useNotebookStore.getState().ensurePlansNotebook();
    const wordCount = input.contentText.trim().split(/\s+/).filter(Boolean).length;
    await supabase.from('journal_entries').insert({
      user_id: input.userId,
      notebook_id: notebook.id,
      entry_type: 'plan',
      title: input.title,
      content_text: input.contentText,
      word_count: wordCount,
      metadata: input.metadata,
    });
  } catch (err) {
    console.warn('[planStore] writePlanEntry failed', err);
  }
}

export const usePlanStore = create<PlanState>((set, get) => ({
  active: null,
  loading: false,
  error: null,
  hasFetched: false,

  fetchActive: async () => {
    if (!isOnline()) return;
    try {
      set({ loading: true, error: null });
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        set({ hasFetched: true });
        return;
      }
      const { data: planRows, error: planErr } = await withTimeout(
        supabase
          .from('plans')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1),
        READ_MS,
        'planStore.fetchActive.plan',
      );
      if (planErr) throw planErr;
      const plan = (planRows as Plan[] | null)?.[0] ?? null;
      if (!plan) {
        set({ active: null, hasFetched: true });
        return;
      }

      // Items + last-30-days completions in parallel.
      const [{ data: items, error: itemsErr }, { data: completions, error: compErr }] =
        await Promise.all([
          withTimeout(
            supabase
              .from('plan_items')
              .select('*')
              .eq('plan_id', plan.id)
              .order('sort_order', { ascending: true }),
            READ_MS,
            'planStore.fetchActive.items',
          ),
          withTimeout(
            supabase
              .from('plan_item_completions')
              .select('*')
              .gte('date', thirtyDaysAgoStr())
              .order('date', { ascending: false }),
            READ_MS,
            'planStore.fetchActive.completions',
          ),
        ]);
      if (itemsErr) throw itemsErr;
      if (compErr) throw compErr;
      const itemList = (items as PlanItem[] | null) ?? [];
      const itemIds = new Set(itemList.map((i) => i.id));
      const recentCompletions = ((completions as PlanItemCompletion[] | null) ?? [])
        .filter((c) => itemIds.has(c.plan_item_id));
      const today = todayLocalDateStr();
      const todayCompletions = new Map<string, boolean>();
      for (const c of recentCompletions) {
        if (c.date === today) todayCompletions.set(c.plan_item_id, c.completed);
      }
      set({
        active: { plan, items: itemList, todayCompletions, recentCompletions },
        hasFetched: true,
      });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch plan' });
    } finally {
      set({ loading: false });
    }
  },

  createPlan: async ({ wish, outcome, obstacles, source_entry_id }) => {
    if (obstacles.length === 0) return null;
    try {
      set({ loading: true, error: null });
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('Not signed in');

      // Archive any existing active plan first — single-active-plan
      // invariant. The archived plan stays in the DB so Plans
      // notebook history is preserved.
      const existing = get().active;
      if (existing) {
        await supabase
          .from('plans')
          .update({ status: 'archived', updated_at: new Date().toISOString() })
          .eq('id', existing.plan.id);
      }

      const { data: planRow, error: planErr } = await withTimeout(
        supabase
          .from('plans')
          .insert({
            user_id: user.id,
            title: deriveTitle(wish),
            wish: wish.trim(),
            outcome: outcome.trim(),
            status: 'active',
            source_entry_id: source_entry_id ?? null,
          })
          .select()
          .single(),
        WRITE_MS,
        'planStore.createPlan.insert',
      );
      if (planErr) throw planErr;
      const plan = planRow as Plan;

      // Bulk-insert items.
      const itemRows = obstacles.map((o, i) => ({
        plan_id: plan.id,
        obstacle_text: o.obstacle_text.trim(),
        if_then_text: o.if_then_text.trim(),
        sort_order: i,
      }));
      const { data: items, error: itemsErr } = await withTimeout(
        supabase.from('plan_items').insert(itemRows).select(),
        WRITE_MS,
        'planStore.createPlan.items',
      );
      if (itemsErr) throw itemsErr;

      set({
        active: {
          plan,
          items: (items as PlanItem[]) ?? [],
          todayCompletions: new Map(),
          recentCompletions: [],
        },
      });

      // Write a starter journal entry into the Plans notebook so the
      // user's reflection history captures the plan kickoff. Fire-and-
      // forget — failure shouldn't block the UI.
      void writePlanEntry({
        userId: user.id,
        title: `Started: ${plan.title}`,
        contentText: [
          `Wish: ${plan.wish}`,
          ``,
          `Outcome: ${plan.outcome}`,
          ``,
          `If-then plan${itemRows.length > 1 ? 's' : ''}:`,
          ...itemRows.map((r) => `• ${r.if_then_text}  (obstacle: "${r.obstacle_text}")`),
        ].join('\n'),
        metadata: {
          plan_id: plan.id,
          plan_event: 'created',
        },
      });

      return plan;
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to create plan' });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  toggleTodayCompletion: async (itemId) => {
    const state = get();
    if (!state.active) return;
    const today = todayLocalDateStr();
    const cur = state.active.todayCompletions.get(itemId);
    const next = cur === true ? false : !cur ? true : false;
    // Optimistic update.
    const newToday = new Map(state.active.todayCompletions);
    newToday.set(itemId, next);
    set({
      active: { ...state.active, todayCompletions: newToday },
    });
    try {
      // Upsert by (plan_item_id, date) — schema has UNIQUE constraint
      // so on conflict we just overwrite the boolean.
      const { error } = await withTimeout(
        supabase
          .from('plan_item_completions')
          .upsert(
            { plan_item_id: itemId, date: today, completed: next },
            { onConflict: 'plan_item_id,date' },
          )
          .select()
          .single(),
        WRITE_MS,
        'planStore.toggleTodayCompletion',
      );
      if (error) throw error;
      // Refresh recent completions in-memory by replacing the today
      // row if it exists, or appending it.
      const recent = state.active.recentCompletions.filter(
        (c) => !(c.plan_item_id === itemId && c.date === today),
      );
      recent.push({
        id: 'optimistic-' + itemId,
        plan_item_id: itemId,
        date: today,
        completed: next,
        created_at: new Date().toISOString(),
      });
      set({
        active: {
          ...state.active,
          todayCompletions: newToday,
          recentCompletions: recent,
        },
      });
    } catch (error) {
      console.warn('[planStore] toggle failed', error);
      // Roll back on error.
      const rb = new Map(state.active.todayCompletions);
      if (cur === undefined) rb.delete(itemId);
      else rb.set(itemId, cur);
      set({
        active: { ...state.active, todayCompletions: rb },
      });
    }
  },

  archivePlan: async (planId) => {
    try {
      set({ loading: true });
      const before = get().active;
      // Cascade delete (vs. archive) so the user's "Delete plan"
      // expectation matches reality. Plans notebook entries are
      // independent journal_entries rows; they survive.
      const { error } = await withTimeout(
        supabase.from('plans').delete().eq('id', planId),
        WRITE_MS,
        'planStore.archivePlan.delete',
      );
      if (error) throw error;
      set({ active: null });

      // Closing journal entry — preserves the "I tried this and stopped"
      // signal in the user's history even though the plan rows are gone.
      if (before && before.plan.id === planId) {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (userId) {
          void writePlanEntry({
            userId,
            title: `Closed: ${before.plan.title}`,
            contentText: `Wish was: ${before.plan.wish}`,
            metadata: {
              plan_id: before.plan.id,
              plan_event: 'closed',
            },
          });
        }
      }
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to delete plan' });
    } finally {
      set({ loading: false });
    }
  },

  replaceItems: async (planId, newItems) => {
    try {
      set({ loading: true });
      // Delete-then-insert. Cascade clears completions tied to the
      // old items — that's the desired UX (Optimize is a fresh
      // start for the items the user wanted to change).
      const { error: delErr } = await withTimeout(
        supabase.from('plan_items').delete().eq('plan_id', planId),
        WRITE_MS,
        'planStore.replaceItems.delete',
      );
      if (delErr) throw delErr;
      const rows = newItems.map((o, i) => ({
        plan_id: planId,
        obstacle_text: o.obstacle_text.trim(),
        if_then_text: o.if_then_text.trim(),
        sort_order: i,
      }));
      const { data: items, error: insErr } = await withTimeout(
        supabase.from('plan_items').insert(rows).select(),
        WRITE_MS,
        'planStore.replaceItems.insert',
      );
      if (insErr) throw insErr;
      const cur = get().active;
      if (cur && cur.plan.id === planId) {
        set({
          active: {
            ...cur,
            items: (items as PlanItem[]) ?? [],
            todayCompletions: new Map(),
            recentCompletions: [],
          },
        });
      }
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to update plan items' });
    } finally {
      set({ loading: false });
    }
  },

  reset: () =>
    set({ active: null, loading: false, error: null, hasFetched: false }),
}));
