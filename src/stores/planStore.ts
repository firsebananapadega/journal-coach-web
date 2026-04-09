import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface PlanSubtask {
  id: string;
  text: string;
  completed: boolean;
}

export interface PlanEvent {
  id: string;
  title: string;
  time: string | null;      // "09:00", "morning", "afternoon", "evening", or null
  location: string | null;
  subtasks: PlanSubtask[];
  completed: boolean;
  sort_order: number;
}

async function upsertPlans(userId: string, date: string, plans: PlanEvent[]) {
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
    plans: JSON.parse(JSON.stringify(plans)),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('daily_priorities')
    .upsert(row, { onConflict: 'user_id,date' });
  if (error) throw error;
}

interface PlanState {
  plans: PlanEvent[];
  date: string | null;
  loading: boolean;
  error: string | null;
  fetchPlans: (date: string) => Promise<void>;
  savePlans: (date: string, plans: PlanEvent[]) => Promise<void>;
  togglePlan: (planId: string) => void;
  toggleSubtask: (planId: string, subtaskId: string) => void;
  removePlan: (planId: string) => void;
  reset: () => void;
}

export const usePlanStore = create<PlanState>((set, get) => ({
  plans: [],
  date: null,
  loading: false,
  error: null,

  fetchPlans: async (date) => {
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
        plans: (data?.plans as PlanEvent[]) ?? [],
        date,
      });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch plans' });
    } finally {
      set({ loading: false });
    }
  },

  savePlans: async (date, plans) => {
    try {
      set({ loading: true, error: null });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');
      await upsertPlans(user.id, date, plans);
      set({ plans, date });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : (error as { message?: string })?.message || 'Failed to save plans';
      set({ error: msg });
      throw new Error(msg);
    } finally {
      set({ loading: false });
    }
  },

  togglePlan: (planId) => {
    const { plans, date } = get();
    if (!date) return;
    const updated = plans.map((plan) =>
      plan.id === planId ? { ...plan, completed: !plan.completed } : plan
    );
    set({ plans: updated });
    // Save to Supabase in background
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await upsertPlans(user.id, date, updated);
      } catch {
        set({ plans });
      }
    })();
  },

  toggleSubtask: (planId, subtaskId) => {
    const { plans, date } = get();
    if (!date) return;
    const updated = plans.map((plan) =>
      plan.id === planId
        ? {
            ...plan,
            subtasks: plan.subtasks.map((st) =>
              st.id === subtaskId ? { ...st, completed: !st.completed } : st
            ),
          }
        : plan
    );
    set({ plans: updated });
    // Save to Supabase in background
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await upsertPlans(user.id, date, updated);
      } catch {
        set({ plans });
      }
    })();
  },

  removePlan: (planId) => {
    const { plans, date } = get();
    if (!date) return;
    const updated = plans.filter((p) => p.id !== planId).map((p, idx) => ({ ...p, sort_order: idx }));
    set({ plans: updated });
    // Save to Supabase in background
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await upsertPlans(user.id, date, updated);
      } catch {
        set({ plans });
      }
    })();
  },

  reset: () => set({ plans: [], date: null, loading: false, error: null }),
}));
