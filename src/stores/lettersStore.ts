// Weekly letter store — thin wrapper over Supabase's `weekly_letters`
// table. Source of truth for the letter archive and the /home
// unread-letter card.
//
// The cron at /api/cron/generate-weekly-letters inserts rows
// server-side. Clients only read and mark-seen.

import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/withTimeout';

const READ_MS = 15000;
const WRITE_MS = 10000;
const AUTH_MS = 8000;

export interface WeeklyLetter {
  id: string;
  user_id: string;
  week_key: string;            // "2026-W17"
  guide_id: string;            // 'ben' | 'quinn' | 'sage' | 'bodhi'
  letter_text: string;
  themes: string[];
  model: string;
  generated_at: string;
  seen_at: string | null;
  delivered_via: string[];
}

interface LettersState {
  letters: WeeklyLetter[];
  loading: boolean;
  hasFetched: boolean;
  error: string | null;
  fetchLetters: () => Promise<void>;
  markSeen: (id: string) => Promise<void>;
  reset: () => void;
  /** Derived — the most recent unread letter, or null. */
  unread: () => WeeklyLetter | null;
  byId: (id: string) => WeeklyLetter | null;
}

export const useLettersStore = create<LettersState>((set, get) => ({
  letters: [],
  loading: false,
  hasFetched: false,
  error: null,

  fetchLetters: async () => {
    try {
      set({ loading: true, error: null });
      const { data: { user } } = await withTimeout(
        supabase.auth.getUser(),
        AUTH_MS,
        'auth.getUser',
      );
      if (!user) throw new Error('Not signed in');
      const { data, error } = await withTimeout(
        supabase
          .from('weekly_letters')
          .select('*')
          .eq('user_id', user.id)
          .order('generated_at', { ascending: false }),
        READ_MS,
        'fetchLetters',
      );
      if (error) throw error;
      set({ letters: (data as WeeklyLetter[]) ?? [] });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch letters' });
    } finally {
      set({ loading: false, hasFetched: true });
    }
  },

  markSeen: async (id: string) => {
    const current = get().letters.find((l) => l.id === id);
    if (!current || current.seen_at) return;
    // Optimistic local update; roll back on error.
    const seenAt = new Date().toISOString();
    set({
      letters: get().letters.map((l) => (l.id === id ? { ...l, seen_at: seenAt } : l)),
    });
    try {
      const { error } = await withTimeout(
        supabase.from('weekly_letters').update({ seen_at: seenAt }).eq('id', id),
        WRITE_MS,
        'markSeen',
      );
      if (error) throw error;
    } catch (err) {
      // Roll back — keep the card unread so the user doesn't silently
      // lose it.
      set({
        letters: get().letters.map((l) => (l.id === id ? { ...l, seen_at: null } : l)),
        error: err instanceof Error ? err.message : 'Failed to mark letter seen',
      });
    }
  },

  reset: () => set({ letters: [], loading: false, hasFetched: false, error: null }),

  unread: () => get().letters.find((l) => !l.seen_at) ?? null,
  byId: (id) => get().letters.find((l) => l.id === id) ?? null,
}));
