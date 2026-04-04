import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface Habit {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  cue: string | null;
  routine: string;
  reward: string | null;
  frequency: 'daily' | 'weekdays' | 'weekends' | 'custom';
  custom_days: number[];
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'anytime';
  stack_after_habit_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface HabitState {
  habits: Habit[];
  completions: Record<string, Set<string>>;
  loading: boolean;
  error: string | null;
  fetchHabits: () => Promise<void>;
  createHabit: (habit: Omit<Habit, 'id' | 'created_at' | 'updated_at'>) => Promise<Habit>;
  updateHabit: (id: string, updates: Partial<Habit>) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  toggleCompletion: (habitId: string, date: string) => Promise<void>;
  fetchCompletions: (startDate: string, endDate: string) => Promise<void>;
  getCompletionsForDate: (date: string) => Set<string>;
  reset: () => void;
}

export const useHabitStore = create<HabitState>((set, get) => ({
  habits: [],
  completions: {},
  loading: false,
  error: null,

  fetchHabits: async () => {
    try {
      set({ loading: true, error: null });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');
      const { data, error } = await supabase
        .from('habits')
        .select('*')
        .eq('user_id', user.id)
        .order('time_of_day')
        .order('sort_order');
      if (error) throw error;
      set({ habits: (data as Habit[]) ?? [] });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch habits' });
    } finally {
      set({ loading: false });
    }
  },

  createHabit: async (habit) => {
    try {
      set({ loading: true, error: null });
      const { data, error } = await supabase.from('habits').insert(habit).select().single();
      if (error) throw error;
      const created = data as Habit;
      set({ habits: [...get().habits, created] });
      return created;
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to create habit' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  updateHabit: async (id, updates) => {
    try {
      set({ loading: true, error: null });
      const { data, error } = await supabase
        .from('habits')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      set({ habits: get().habits.map((h) => (h.id === id ? (data as Habit) : h)) });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to update habit' });
    } finally {
      set({ loading: false });
    }
  },

  deleteHabit: async (id) => {
    try {
      set({ loading: true, error: null });
      const { error } = await supabase.from('habits').delete().eq('id', id);
      if (error) throw error;
      set({ habits: get().habits.filter((h) => h.id !== id) });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to delete habit' });
    } finally {
      set({ loading: false });
    }
  },

  toggleCompletion: async (habitId, date) => {
    try {
      set({ loading: true, error: null });
      const currentCompletions = get().completions[date];
      const isCompleted = currentCompletions?.has(habitId) ?? false;

      if (isCompleted) {
        const { error } = await supabase
          .from('habit_completions')
          .delete()
          .eq('habit_id', habitId)
          .eq('completed_date', date);
        if (error) throw error;
        const updatedSet = new Set(currentCompletions);
        updatedSet.delete(habitId);
        set({ completions: { ...get().completions, [date]: updatedSet } });
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No authenticated user');
        const { error } = await supabase
          .from('habit_completions')
          .insert({ habit_id: habitId, completed_date: date, user_id: user.id });
        if (error) throw error;
        const updatedSet = new Set(currentCompletions ?? []);
        updatedSet.add(habitId);
        set({ completions: { ...get().completions, [date]: updatedSet } });
      }
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to toggle completion' });
    } finally {
      set({ loading: false });
    }
  },

  fetchCompletions: async (startDate, endDate) => {
    try {
      set({ loading: true, error: null });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');
      const { data, error } = await supabase
        .from('habit_completions')
        .select('*')
        .eq('user_id', user.id)
        .gte('completed_date', startDate)
        .lte('completed_date', endDate);
      if (error) throw error;
      const completions: Record<string, Set<string>> = {};
      for (const row of (data as { habit_id: string; completed_date: string }[]) ?? []) {
        if (!completions[row.completed_date]) {
          completions[row.completed_date] = new Set();
        }
        completions[row.completed_date].add(row.habit_id);
      }
      set({ completions: { ...get().completions, ...completions } });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch completions' });
    } finally {
      set({ loading: false });
    }
  },

  getCompletionsForDate: (date) => get().completions[date] ?? new Set(),

  reset: () => set({ habits: [], completions: {}, loading: false, error: null }),
}));
