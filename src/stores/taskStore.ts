import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { getDB } from '../lib/db';
import { enqueue } from '../lib/syncQueue';

// Tasks live in their own table now. Each task belongs to a list
// (Inbox by default for unassigned), has an optional due_date for
// the Upcoming view, and optional urgent/important flags for the
// Eisenhower matrix view inside a list.
//
// The store keeps a single in-memory cache `tasks: Task[]` and the
// page-level views (Lists, Upcoming, /lists/[id]) filter that cache.
// fetchAll() pulls every uncompleted + recently-completed task; that's
// fine at the personal-app scale we're targeting (single user, low
// hundreds of tasks). If volume grows we can switch to per-view
// fetches without changing the page-level callsites.

export interface Task {
  id: string;
  user_id: string;
  list_id: string | null;
  text: string;
  due_date: string | null; // YYYY-MM-DD
  time: string | null;
  urgent: boolean;
  important: boolean;
  /** True once the user has explicitly placed this task into ANY
   *  Eisenhower quadrant (Q1/Q2/Q3/Q4). False = Unsorted. Lets Q4
   *  (Drop) be visually distinct from Unsorted, which both have
   *  urgent=false + important=false. Default false. */
  triaged: boolean;
  completed: boolean;
  sort_order: number;
  /** /today-only sort field. NULL = no manual /today position yet —
   *  fall back to sort_order (which is the /lists/[id] order). Drag
   *  on /today writes this column only, leaving sort_order untouched
   *  so the project-list view keeps its own ordering. */
  today_sort_order: number | null;
  /** Auto-tagged category from the capture engine: 'home' | 'work' |
   *  'errands' | 'bills' | 'medications' | 'other'. NULL when capture
   *  didn't classify (no chip rendered). Free-text in DB; the UI
   *  treats it as a typed enum for chip styling. */
  category: string | null;
  /** Subgroup within a category — e.g. 'morning' / 'evening' for
   *  medications. Renders as a small chip alongside the category. */
  subgroup: string | null;
  notes: string | null;
  // Sprint 3 reminder columns.
  remind_at: string | null;            // UTC ISO; null = no reminder.
  remind_sent_at: string | null;       // cron stamps this when push fires.
  remind_snoozed_until: string | null; // future UTC when a notification
                                       // is snoozed; cron re-fires at this time.
  reminder_message: string | null;     // override text; null → use `text`.
  created_at: string;
  updated_at: string;
}

interface TaskState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  hasFetched: boolean;
  fetchAll: () => Promise<void>;
  addTask: (input: {
    text: string;
    list_id?: string | null;
    due_date?: string | null;
    time?: string | null;
    urgent?: boolean;
    important?: boolean;
    remind_at?: string | null;
    reminder_message?: string | null;
    category?: string | null;
    subgroup?: string | null;
  }) => Promise<Task | null>;
  updateTask: (id: string, patch: Partial<Omit<Task, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<void>;
  toggleComplete: (id: string) => Promise<void>;
  setQuadrant: (
    id: string,
    flags: { urgent?: boolean; important?: boolean; triaged?: boolean },
  ) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  // Batch re-ordering: pass the NEW sequence of task ids (for a
  // specific subgroup the caller cares about — a day, a list, etc).
  // The store rewrites those rows' sort_order in the given order.
  // Other tasks' sort_order is left alone. Optimistic + rollback.
  reorderTasks: (orderedIds: string[]) => Promise<void>;
  // Same as reorderTasks but writes today_sort_order instead. Used
  // by /today's unified drag-reorder so changes there don't bleed
  // into /lists/[id] order. Takes a Map of id → explicit position so
  // task positions can match the combined priority+task position space
  // (where priorities and tasks share the same global ranks).
  reorderForToday: (positionsById: Map<string, number>) => Promise<void>;
  // Selectors (not async; read from current cache).
  byList: (listId: string | null) => Task[];
  byDate: (yyyymmdd: string) => Task[];
  betweenDates: (start: string, end: string) => Task[];
  reset: () => void;
}

function isMissingTableError(err: unknown): boolean {
  const msg = (err as { message?: string })?.message?.toLowerCase() ?? '';
  return (
    msg.includes('relation') &&
    (msg.includes('does not exist') || msg.includes('not exist'))
  );
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  loading: false,
  error: null,
  hasFetched: false,

  fetchAll: async () => {
    try {
      set({ loading: true, error: null });

      // Hydrate from Dexie first so offline cold-opens (and slow
      // networks) paint immediately. Sort here to match Supabase's
      // ordering (sort_order ASC, created_at ASC) so the in-memory
      // list doesn't reshuffle when the network fetch returns.
      const db = getDB();
      if (db) {
        try {
          const cached = await db.tasks.toArray();
          if (cached.length > 0) {
            const sorted = [...cached].sort((a, b) => {
              if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
              return (a.created_at ?? '').localeCompare(b.created_at ?? '');
            });
            set({ tasks: sorted as Task[], hasFetched: true });
          }
        } catch {}
      }

      // Use getSession (localStorage read) instead of getUser (network
      // call). getUser was returning null offline and the previous
      // null-handling cleared the cache, which is what caused the
      // "data flashes then disappears" bug.
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        // Don't clear cached state — the user may be transiently
        // unverifiable (offline, or session refresh pending). The
        // explicit signOut path calls reset() to clear.
        return;
      }
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      const fresh = (data ?? []) as Task[];
      set({ tasks: fresh, hasFetched: true });

      // Mirror to Dexie so the next cold-start has fresh data even
      // if the user is offline at that point.
      if (db) {
        try {
          await db.tasks.clear();
          if (fresh.length > 0) await db.tasks.bulkPut(fresh);
        } catch {}
      }
    } catch (err) {
      if (isMissingTableError(err)) {
        set({ tasks: [], hasFetched: true, error: 'tasks table not found' });
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to fetch tasks';
        set({ error: msg });
      }
    } finally {
      set({ loading: false });
    }
  },

  addTask: async (input) => {
    // Use getSession so offline adds still succeed via the outbox.
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return null;
    const trimmed = input.text.trim();
    if (!trimmed) return null;

    // Build the full row client-side so it can be persisted to Dexie
    // immediately and replayed verbatim when the outbox drains.
    const now = new Date().toISOString();
    const baseSort = get().tasks.filter((t) => t.list_id === (input.list_id ?? null)).length;
    const created: Task = {
      id: crypto.randomUUID(),
      user_id: user.id,
      list_id: input.list_id ?? null,
      text: trimmed,
      due_date: input.due_date ?? null,
      time: input.time ?? null,
      urgent: !!input.urgent,
      important: !!input.important,
      triaged: false,
      completed: false,
      sort_order: baseSort,
      today_sort_order: null,
      category: input.category ?? null,
      subgroup: input.subgroup ?? null,
      notes: null,
      remind_at: input.remind_at ?? null,
      remind_sent_at: null,
      remind_snoozed_until: null,
      reminder_message: input.reminder_message ?? null,
      created_at: now,
      updated_at: now,
    };

    set((s) => ({ tasks: [...s.tasks, created] }));
    await enqueue({ op: 'insert', table: 'tasks', row_id: created.id, payload: created });
    return created;
  },

  updateTask: async (id, patch) => {
    const next = { ...patch, updated_at: new Date().toISOString() };
    set({ tasks: get().tasks.map((t) => (t.id === id ? { ...t, ...next } : t)) });
    await enqueue({ op: 'update', table: 'tasks', row_id: id, payload: next });
  },

  toggleComplete: async (id) => {
    const target = get().tasks.find((t) => t.id === id);
    if (!target) return;
    return get().updateTask(id, { completed: !target.completed });
  },

  setQuadrant: async (id, flags) => {
    const target = get().tasks.find((t) => t.id === id);
    if (!target) return;
    return get().updateTask(id, {
      urgent: flags.urgent ?? target.urgent,
      important: flags.important ?? target.important,
      triaged: flags.triaged ?? target.triaged,
    });
  },

  removeTask: async (id) => {
    set({ tasks: get().tasks.filter((t) => t.id !== id) });
    await enqueue({ op: 'delete', table: 'tasks', row_id: id, payload: null });
  },

  reorderTasks: async (orderedIds) => {
    if (orderedIds.length === 0) return;
    const nextOrderById = new Map<string, number>();
    orderedIds.forEach((id, i) => nextOrderById.set(id, i));
    set({
      tasks: get().tasks.map((t) => {
        const next = nextOrderById.get(t.id);
        return next != null ? { ...t, sort_order: next } : t;
      }),
    });
    const now = new Date().toISOString();
    for (const [id, sort_order] of nextOrderById.entries()) {
      await enqueue({
        op: 'update',
        table: 'tasks',
        row_id: id,
        payload: { sort_order, updated_at: now },
      });
    }
  },

  reorderForToday: async (positionsById) => {
    if (positionsById.size === 0) return;
    set({
      tasks: get().tasks.map((t) => {
        const next = positionsById.get(t.id);
        return next != null ? { ...t, today_sort_order: next } : t;
      }),
    });
    const now = new Date().toISOString();
    for (const [id, today_sort_order] of positionsById.entries()) {
      await enqueue({
        op: 'update',
        table: 'tasks',
        row_id: id,
        payload: { today_sort_order, updated_at: now },
      });
    }
  },

  byList: (listId) => get().tasks.filter((t) => t.list_id === listId),

  byDate: (yyyymmdd) => get().tasks.filter((t) => t.due_date === yyyymmdd),

  betweenDates: (start, end) =>
    get().tasks.filter(
      (t) => t.due_date != null && t.due_date >= start && t.due_date <= end,
    ),

  reset: () => set({ tasks: [], hasFetched: false, error: null }),
}));
