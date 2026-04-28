import { create } from 'zustand';
import { supabase } from '../lib/supabase';

// Daily priorities (a.k.a. tasks on /today). Per-user, per-day rows in
// `daily_priorities`, with the items array stored in a JSONB column.
//
// Groceries used to live in this same row but moved to their own
// normalized + realtime tables (see groceryStore). The 30-day
// carry-forward read-fallback that hacked around the per-day model
// for groceries went with them.

export type PriorityCategory =
  | 'medications'
  | 'errands'
  | 'work'
  | 'home'
  | 'bills'
  | 'other';

export const PRIORITY_CATEGORY_ORDER: PriorityCategory[] = [
  'medications',
  'errands',
  'work',
  'home',
  'bills',
  'other',
];

export interface PriorityItem {
  id: string;
  text: string;
  completed: boolean;
  sort_order: number;
  // Category and subgroup ride inside the existing daily_priorities.items
  // JSON column — no DB migration needed. Older rows without these fields
  // default to category='other' on read (see normalizeItem below).
  category?: PriorityCategory;
  subgroup?: string | null;
  // Eisenhower matrix flags. Default false (= Unsorted bucket in matrix
  // view). Toggle via setQuadrant() or the TaskQuadrantSheet bottom
  // sheet. Stored in the same JSON column — no migration needed.
  urgent?: boolean;
  important?: boolean;
  /** True once the user has explicitly placed this item into ANY
   *  quadrant (Q1/Q2/Q3/Q4). False = Unsorted. Distinguishes Q4
   *  (Drop) from Unsorted — both have urgent=false + important=false. */
  triaged?: boolean;
}

function normalizeItem(raw: unknown): PriorityItem {
  const r = (raw ?? {}) as Record<string, unknown>;
  const u = !!r.urgent;
  const i = !!r.important;
  const triaged =
    typeof r.triaged === 'boolean' ? r.triaged : u || i;
  return {
    id: typeof r.id === 'string' ? r.id : crypto.randomUUID(),
    text: typeof r.text === 'string' ? r.text : '',
    completed: !!r.completed,
    sort_order: typeof r.sort_order === 'number' ? r.sort_order : 0,
    category: isCategory(r.category) ? r.category : 'other',
    subgroup: typeof r.subgroup === 'string' ? r.subgroup : null,
    urgent: u,
    important: i,
    triaged,
  };
}

function isCategory(v: unknown): v is PriorityCategory {
  return typeof v === 'string' && PRIORITY_CATEGORY_ORDER.includes(v as PriorityCategory);
}

interface PriorityState {
  items: PriorityItem[];
  date: string | null;
  loading: boolean;
  error: string | null;
  fetchPriorities: (date: string) => Promise<void>;
  savePriorities: (date: string, items: PriorityItem[]) => Promise<void>;
  addItems: (date: string, newItems: PriorityItem[]) => Promise<void>;
  toggleItem: (itemId: string) => Promise<void>;
  updateItemText: (itemId: string, nextText: string) => Promise<void>;
  setQuadrant: (
    itemId: string,
    flags: { urgent?: boolean; important?: boolean; triaged?: boolean },
  ) => Promise<void>;
  markItemDone: (itemId: string) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  setItems: (items: PriorityItem[]) => void;
  reset: () => void;
}

async function upsertRow(userId: string, date: string, updates: Record<string, unknown>) {
  const { data: existing } = await supabase
    .from('daily_priorities')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  const row = {
    user_id: userId,
    date,
    items: existing?.items ?? [],
    ...updates,
    updated_at: new Date().toISOString(),
  };

  row.items = JSON.parse(JSON.stringify(row.items));

  const { error } = await supabase
    .from('daily_priorities')
    .upsert(row, { onConflict: 'user_id,date' });
  if (error) throw error;
}

export const usePriorityStore = create<PriorityState>((set, get) => ({
  items: [],
  date: null,
  loading: false,
  error: null,

  fetchPriorities: async (date) => {
    try {
      set({ loading: true, error: null });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');
      const { data, error } = await supabase
        .from('daily_priorities')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', date)
        .maybeSingle();
      if (error) throw error;
      const rawItems = Array.isArray(data?.items) ? (data!.items as unknown[]) : [];
      set({
        items: rawItems.map(normalizeItem),
        date,
      });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch priorities' });
    } finally {
      set({ loading: false });
    }
  },

  savePriorities: async (date, items) => {
    try {
      set({ loading: true, error: null });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');
      await upsertRow(user.id, date, { items });
      set({ items, date });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : (error as { message?: string })?.message || 'Failed to save priorities';
      set({ error: msg });
      throw new Error(msg);
    } finally {
      set({ loading: false });
    }
  },

  toggleItem: async (itemId) => {
    const { items, date } = get();
    if (!date) return;
    const updated = items.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    set({ items: updated });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await upsertRow(user.id, date, { items: updated });
    } catch {
      set({ items });
    }
  },

  updateItemText: async (itemId, nextText) => {
    const { items, date } = get();
    if (!date) return;
    const trimmed = nextText.trim();
    if (!trimmed) return;
    const target = items.find((it) => it.id === itemId);
    if (!target || target.text === trimmed) return;
    const updated = items.map((item) =>
      item.id === itemId ? { ...item, text: trimmed } : item,
    );
    set({ items: updated });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await upsertRow(user.id, date, { items: updated });
    } catch {
      set({ items });
    }
  },

  setQuadrant: async (itemId, flags) => {
    const { items, date } = get();
    if (!date) return;
    const updated = items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            urgent: flags.urgent ?? item.urgent ?? false,
            important: flags.important ?? item.important ?? false,
            triaged: flags.triaged ?? item.triaged ?? false,
          }
        : item,
    );
    set({ items: updated });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await upsertRow(user.id, date, { items: updated });
    } catch {
      set({ items });
    }
  },

  removeItem: async (itemId) => {
    const { items, date } = get();
    if (!date) return;
    const updated = items.filter((i) => i.id !== itemId).map((i, idx) => ({ ...i, sort_order: idx }));
    set({ items: updated });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await upsertRow(user.id, date, { items: updated });
    } catch { set({ items }); }
  },

  setItems: (items) => set({ items }),

  // Append new items to whatever already exists for `date`. Reads from
  // Supabase if `date` differs from the currently-loaded date so we
  // never clobber yesterday's tasks while saving today's.
  addItems: async (date, newItems) => {
    if (newItems.length === 0) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');
      let existing: PriorityItem[] = [];
      if (get().date === date) {
        existing = get().items;
      } else {
        const { data } = await supabase
          .from('daily_priorities')
          .select('items')
          .eq('user_id', user.id)
          .eq('date', date)
          .maybeSingle();
        const raw = Array.isArray(data?.items) ? (data!.items as unknown[]) : [];
        existing = raw.map(normalizeItem);
      }
      const baseSort = existing.length;
      const renumbered = newItems.map((it, i) => ({
        ...normalizeItem(it),
        sort_order: baseSort + i,
      }));
      const merged = [...existing, ...renumbered];
      await upsertRow(user.id, date, { items: merged });
      if (get().date === date) set({ items: merged });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to add priorities';
      set({ error: msg });
      throw new Error(msg);
    }
  },

  markItemDone: async (itemId) => {
    const { items, date } = get();
    if (!date) return;
    const target = items.find((i) => i.id === itemId);
    if (!target || target.completed) return;
    const updated = items.map((i) => (i.id === itemId ? { ...i, completed: true } : i));
    set({ items: updated });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await upsertRow(user.id, date, { items: updated });
    } catch {
      set({ items });
    }
  },

  reset: () => set({ items: [], date: null, loading: false, error: null }),
}));
