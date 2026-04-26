import { create } from 'zustand';
import { supabase } from '../lib/supabase';

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

export interface GroceryItem {
  id: string;
  name: string;
  completed: boolean;
}

export interface GroceryGroup {
  id: string;
  store: string;
  items: GroceryItem[];
}

function normalizeItem(raw: unknown): PriorityItem {
  const r = (raw ?? {}) as Record<string, unknown>;
  const u = !!r.urgent;
  const i = !!r.important;
  // Backfill: rows written before the triaged field existed but
  // already carry an urgent/important flag were explicitly placed
  // by the user — treat as triaged so their Q1/Q2/Q3 placement
  // survives. Brand-new untouched items stay false (Unsorted).
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
  groceries: GroceryGroup[];
  date: string | null;
  loading: boolean;
  error: string | null;
  fetchPriorities: (date: string) => Promise<void>;
  savePriorities: (date: string, items: PriorityItem[]) => Promise<void>;
  saveGroceries: (date: string, groceries: GroceryGroup[]) => Promise<void>;
  // Append-only convenience: merges new items into the existing date row.
  // Used by the CapturePreviewSheet so each surface doesn't have to
  // re-implement fetch-merge-save.
  addItems: (date: string, newItems: PriorityItem[]) => Promise<void>;
  addGroceryGroups: (date: string, newGroups: GroceryGroup[]) => Promise<void>;
  toggleItem: (itemId: string) => Promise<void>;
  /** Replace a priority item's text. Used by the Today-tab inline-
   *  edit affordance (tap the text → autoFocus textarea → save on
   *  blur). No-op when text is empty or unchanged. */
  updateItemText: (itemId: string, nextText: string) => Promise<void>;
  // Eisenhower matrix flag setters. Persist into the existing JSON
  // items column — no schema change. Optimistic update + rollback on
  // failure (same pattern as toggleItem).
  setQuadrant: (
    itemId: string,
    flags: { urgent?: boolean; important?: boolean; triaged?: boolean },
  ) => Promise<void>;
  toggleGroceryItem: (groupId: string, itemId: string) => Promise<void>;
  // Manual edit + add — used by the Groceries tab's per-group "+ Add item"
  // input and the tap-to-rename affordance on each item row. Both are
  // optimistic + rollback, same pattern as toggleGroceryItem.
  addItemToGroup: (groupId: string, name: string) => Promise<void>;
  renameGroceryItem: (
    groupId: string,
    itemId: string,
    name: string,
  ) => Promise<void>;
  // Mark-done helpers for the voice check-off flow. They locate the item
  // by id (caller has already done fuzzy matching) and set completed=true.
  // Idempotent — calling twice is a no-op.
  markItemDone: (itemId: string) => Promise<void>;
  markGroceryDone: (groupId: string, itemId: string) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  removeGroceryItem: (groupId: string, itemId: string) => Promise<void>;
  removeGroceryGroup: (groupId: string) => Promise<void>;
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
    groceries: existing?.groceries ?? [],
    ...updates,
    updated_at: new Date().toISOString(),
  };

  row.items = JSON.parse(JSON.stringify(row.items));
  row.groceries = JSON.parse(JSON.stringify(row.groceries));

  const { error } = await supabase
    .from('daily_priorities')
    .upsert(row, { onConflict: 'user_id,date' });
  if (error) throw error;
}

export const usePriorityStore = create<PriorityState>((set, get) => ({
  items: [],
  groceries: [],
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

      // Groceries persist across days. Tasks are legitimately per-day,
      // but a shopping list isn't — if yesterday's eggs didn't get
      // checked off, today shouldn't start empty. If today's row
      // either doesn't exist OR exists but has no groceries (e.g.
      // the user added a task today but hasn't touched groceries),
      // carry the most recent non-empty grocery list forward. Only
      // a write to today's row commits the migration to storage; the
      // read side just surfaces it in memory so it's always visible.
      let groceries: GroceryGroup[] = (data?.groceries as GroceryGroup[]) ?? [];
      if (groceries.length === 0) {
        const { data: priorRows } = await supabase
          .from('daily_priorities')
          .select('date, groceries')
          .eq('user_id', user.id)
          .lt('date', date)
          .order('date', { ascending: false })
          .limit(30);
        if (priorRows) {
          for (const r of priorRows) {
            const g = (r.groceries as GroceryGroup[]) ?? [];
            if (g.length > 0) {
              groceries = g;
              break;
            }
          }
        }
      }

      set({
        items: rawItems.map(normalizeItem),
        groceries,
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

  saveGroceries: async (date, groceries) => {
    try {
      set({ loading: true, error: null });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');
      await upsertRow(user.id, date, { groceries });
      set({ groceries, date });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : (error as { message?: string })?.message || 'Failed to save groceries';
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

  toggleGroceryItem: async (groupId, itemId) => {
    const { groceries, date } = get();
    if (!date) return;
    const updated = groceries.map((group) =>
      group.id === groupId
        ? {
            ...group,
            items: group.items.map((item) =>
              item.id === itemId ? { ...item, completed: !item.completed } : item
            ),
          }
        : group
    );
    set({ groceries: updated });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await upsertRow(user.id, date, { groceries: updated });
    } catch {
      set({ groceries });
    }
  },

  addItemToGroup: async (groupId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { groceries, date } = get();
    if (!date) return;
    // Skip if the group already has an item with this name (case-insensitive).
    const target = groceries.find((g) => g.id === groupId);
    if (!target) return;
    if (target.items.some((i) => i.name.toLowerCase() === trimmed.toLowerCase())) {
      return;
    }
    const newItem: GroceryItem = {
      id: crypto.randomUUID(),
      name: trimmed,
      completed: false,
    };
    const updated = groceries.map((g) =>
      g.id === groupId ? { ...g, items: [...g.items, newItem] } : g,
    );
    set({ groceries: updated });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await upsertRow(user.id, date, { groceries: updated });
    } catch {
      set({ groceries });
    }
  },

  renameGroceryItem: async (groupId, itemId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { groceries, date } = get();
    if (!date) return;
    const updated = groceries.map((g) =>
      g.id === groupId
        ? {
            ...g,
            items: g.items.map((i) =>
              i.id === itemId ? { ...i, name: trimmed } : i,
            ),
          }
        : g,
    );
    set({ groceries: updated });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await upsertRow(user.id, date, { groceries: updated });
    } catch {
      set({ groceries });
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

  removeGroceryItem: async (groupId, itemId) => {
    const { groceries, date } = get();
    if (!date) return;
    const updated = groceries
      .map((g) => g.id === groupId ? { ...g, items: g.items.filter((i) => i.id !== itemId) } : g)
      .filter((g) => g.items.length > 0);
    set({ groceries: updated });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await upsertRow(user.id, date, { groceries: updated });
    } catch { set({ groceries }); }
  },

  removeGroceryGroup: async (groupId) => {
    const { groceries, date } = get();
    if (!date) return;
    const updated = groceries.filter((g) => g.id !== groupId);
    set({ groceries: updated });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await upsertRow(user.id, date, { groceries: updated });
    } catch { set({ groceries }); }
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

  // Append new grocery groups, merging by store name (case-insensitive)
  // and de-duplicating items within a store.
  addGroceryGroups: async (date, newGroups) => {
    if (newGroups.length === 0) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');
      let existing: GroceryGroup[] = [];
      if (get().date === date) {
        existing = get().groceries;
      } else {
        const { data } = await supabase
          .from('daily_priorities')
          .select('groceries')
          .eq('user_id', user.id)
          .eq('date', date)
          .maybeSingle();
        existing = (data?.groceries as GroceryGroup[]) ?? [];
      }
      const merged = [...existing];
      for (const g of newGroups) {
        const match = merged.find((m) => m.store.toLowerCase() === g.store.toLowerCase());
        if (match) {
          const dedup = g.items.filter(
            (i) => !match.items.some((ei) => ei.name.toLowerCase() === i.name.toLowerCase()),
          );
          match.items.push(...dedup);
        } else {
          merged.push(g);
        }
      }
      await upsertRow(user.id, date, { groceries: merged });
      if (get().date === date) set({ groceries: merged });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to add groceries';
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

  markGroceryDone: async (groupId, itemId) => {
    const { groceries, date } = get();
    if (!date) return;
    const updated = groceries.map((g) =>
      g.id === groupId
        ? {
            ...g,
            items: g.items.map((i) => (i.id === itemId ? { ...i, completed: true } : i)),
          }
        : g,
    );
    set({ groceries: updated });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await upsertRow(user.id, date, { groceries: updated });
    } catch {
      set({ groceries });
    }
  },

  reset: () => set({ items: [], groceries: [], date: null, loading: false, error: null }),
}));
