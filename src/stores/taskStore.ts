import { create } from 'zustand';
import { supabase } from '../lib/supabase';

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
  completed: boolean;
  sort_order: number;
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
  }) => Promise<Task | null>;
  updateTask: (id: string, patch: Partial<Omit<Task, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<void>;
  toggleComplete: (id: string) => Promise<void>;
  setQuadrant: (id: string, flags: { urgent?: boolean; important?: boolean }) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  // Batch re-ordering: pass the NEW sequence of task ids (for a
  // specific subgroup the caller cares about — a day, a list, etc).
  // The store rewrites those rows' sort_order in the given order.
  // Other tasks' sort_order is left alone. Optimistic + rollback.
  reorderTasks: (orderedIds: string[]) => Promise<void>;
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        set({ tasks: [], hasFetched: true });
        return;
      }
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      set({ tasks: (data ?? []) as Task[], hasFetched: true });
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
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const trimmed = input.text.trim();
      if (!trimmed) return null;
      const baseSort = get().tasks.filter((t) => t.list_id === (input.list_id ?? null)).length;
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          user_id: user.id,
          list_id: input.list_id ?? null,
          text: trimmed,
          due_date: input.due_date ?? null,
          time: input.time ?? null,
          urgent: !!input.urgent,
          important: !!input.important,
          completed: false,
          sort_order: baseSort,
          remind_at: input.remind_at ?? null,
          reminder_message: input.reminder_message ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      const created = data as Task;
      set((s) => ({ tasks: [...s.tasks, created] }));
      return created;
    } catch (err) {
      if (isMissingTableError(err)) return null;
      const msg = err instanceof Error ? err.message : 'Failed to add task';
      set({ error: msg });
      return null;
    }
  },

  updateTask: async (id, patch) => {
    const prev = get().tasks;
    set({ tasks: prev.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
    try {
      const { error } = await supabase.from('tasks').update(patch).eq('id', id);
      if (error) throw error;
    } catch {
      set({ tasks: prev });
    }
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
    });
  },

  removeTask: async (id) => {
    const prev = get().tasks;
    set({ tasks: prev.filter((t) => t.id !== id) });
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    } catch {
      set({ tasks: prev });
    }
  },

  reorderTasks: async (orderedIds) => {
    if (orderedIds.length === 0) return;
    const prev = get().tasks;
    // Assign new sort_orders based on position. We use simple
    // integers; the rest of the store already sorts ascending, so any
    // contiguous sequence works.
    const nextOrderById = new Map<string, number>();
    orderedIds.forEach((id, i) => nextOrderById.set(id, i));
    const optimistic = prev.map((t) => {
      const next = nextOrderById.get(t.id);
      return next != null ? { ...t, sort_order: next } : t;
    });
    set({ tasks: optimistic });
    try {
      // Batch-update all touched rows. A single upsert with a minimal
      // payload per row keeps the round-trip small. Any failure rolls
      // back the whole batch.
      const updates = Array.from(nextOrderById.entries()).map(([id, so]) =>
        supabase.from('tasks').update({ sort_order: so, updated_at: new Date().toISOString() }).eq('id', id),
      );
      const results = await Promise.all(updates);
      for (const r of results) if (r.error) throw r.error;
    } catch {
      set({ tasks: prev });
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
