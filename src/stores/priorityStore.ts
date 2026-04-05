import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface PriorityItem {
  id: string;
  text: string;
  completed: boolean;
  sort_order: number;
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

interface PriorityState {
  items: PriorityItem[];
  groceries: GroceryGroup[];
  date: string | null;
  loading: boolean;
  error: string | null;
  fetchPriorities: (date: string) => Promise<void>;
  savePriorities: (date: string, items: PriorityItem[]) => Promise<void>;
  toggleItem: (itemId: string) => Promise<void>;
  toggleGroceryItem: (groupId: string, itemId: string) => Promise<void>;
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
      set({
        items: (data?.items as PriorityItem[]) ?? [],
        groceries: (data?.groceries as GroceryGroup[]) ?? [],
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
      const msg = error instanceof Error ? error.message : 'Failed to save priorities';
      set({ error: msg });
      throw new Error(msg); // Re-throw so callers know it failed
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

  setItems: (items) => set({ items }),
  reset: () => set({ items: [], groceries: [], date: null, loading: false, error: null }),
}));
