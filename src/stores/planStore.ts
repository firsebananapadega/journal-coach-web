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

// ── localStorage-based storage (works without DB migration) ──

const PLANS_KEY_PREFIX = 'plans_';

function getLocalPlans(date: string): PlanEvent[] {
  try {
    const raw = localStorage.getItem(PLANS_KEY_PREFIX + date);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function setLocalPlans(date: string, plans: PlanEvent[]) {
  try {
    localStorage.setItem(PLANS_KEY_PREFIX + date, JSON.stringify(plans));
  } catch {}
}

// Also try Supabase if the column exists (best-effort)
async function trySaveToSupabase(date: string, plans: PlanEvent[]) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: existing } = await supabase
      .from('daily_priorities')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', date)
      .maybeSingle();

    const row = {
      user_id: user.id,
      date,
      items: existing?.items ?? [],
      groceries: existing?.groceries ?? [],
      plans: JSON.parse(JSON.stringify(plans)),
      updated_at: new Date().toISOString(),
    };

    await supabase
      .from('daily_priorities')
      .upsert(row, { onConflict: 'user_id,date' });
  } catch {
    // Column may not exist yet — localStorage is the fallback
  }
}

async function tryLoadFromSupabase(date: string): Promise<PlanEvent[] | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('daily_priorities')
      .select('plans')
      .eq('user_id', user.id)
      .eq('date', date)
      .maybeSingle();

    if (error || !data) return null;
    const plans = data.plans as PlanEvent[] | null;
    return plans && plans.length > 0 ? plans : null;
  } catch {
    return null;
  }
}

// ── Store ──

interface PlanState {
  plans: PlanEvent[];
  date: string | null;
  loading: boolean;
  error: string | null;
  fetchPlans: (date: string) => Promise<void>;
  savePlans: (date: string, plans: PlanEvent[]) => Promise<void>;
  togglePlan: (planId: string) => void;
  toggleSubtask: (planId: string, subtaskId: string) => void;
  updatePlan: (planId: string, updates: Partial<Omit<PlanEvent, 'id'>>) => void;
  removePlan: (planId: string) => void;
  reset: () => void;
}

export const usePlanStore = create<PlanState>((set, get) => ({
  plans: [],
  date: null,
  loading: false,
  error: null,

  fetchPlans: async (date) => {
    // Instant load from localStorage — no blocking on network
    const plans = getLocalPlans(date);
    set({ plans, date, loading: false, error: null });

    // Background sync from Supabase (non-blocking)
    tryLoadFromSupabase(date).then((supabasePlans) => {
      if (supabasePlans && supabasePlans.length > 0) {
        const localPlans = getLocalPlans(date);
        // Only use Supabase data if it has MORE plans (newer sync from another device)
        if (supabasePlans.length > localPlans.length) {
          setLocalPlans(date, supabasePlans);
          // Only update UI if still viewing this date
          if (get().date === date) {
            set({ plans: supabasePlans });
          }
        }
      }
    });
  },

  savePlans: async (date, plans) => {
    // Always save to localStorage
    setLocalPlans(date, plans);
    // Only update UI state if saving to the currently viewed date
    if (get().date === date || get().date === null) {
      set({ plans, date });
    }
    // Best-effort save to Supabase (non-blocking)
    trySaveToSupabase(date, plans);
  },

  togglePlan: (planId) => {
    const { plans, date } = get();
    if (!date) return;
    const updated = plans.map((p) =>
      p.id === planId ? { ...p, completed: !p.completed } : p
    );
    set({ plans: updated });
    setLocalPlans(date, updated);
    trySaveToSupabase(date, updated);
  },

  toggleSubtask: (planId, subtaskId) => {
    const { plans, date } = get();
    if (!date) return;
    const updated = plans.map((p) =>
      p.id === planId
        ? {
            ...p,
            subtasks: p.subtasks.map((st) =>
              st.id === subtaskId ? { ...st, completed: !st.completed } : st
            ),
          }
        : p
    );
    set({ plans: updated });
    setLocalPlans(date, updated);
    trySaveToSupabase(date, updated);
  },

  updatePlan: (planId, updates) => {
    const { plans, date } = get();
    if (!date) return;
    const updated = plans.map((p) =>
      p.id === planId ? { ...p, ...updates } : p
    );
    set({ plans: updated });
    setLocalPlans(date, updated);
    trySaveToSupabase(date, updated);
  },

  removePlan: (planId) => {
    const { plans, date } = get();
    if (!date) return;
    const updated = plans.filter((p) => p.id !== planId);
    set({ plans: updated });
    setLocalPlans(date, updated);
    trySaveToSupabase(date, updated);
  },

  reset: () => set({ plans: [], date: null, loading: false, error: null }),
}));
