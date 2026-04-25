// Letter + monthly-pattern archive store. Wraps two Supabase tables
// (`weekly_letters` and `monthly_patterns`), exposing a unified
// "items" feed sorted by generated_at so the UI can interleave both
// kinds in the /letters archive without caring which is which.
//
// Crons insert rows server-side. Clients only read + mark-seen.

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

export interface MonthlyTheme {
  name: string;
  summary: string;
  entry_ids: string[];
}

export interface MonthlyPattern {
  id: string;
  user_id: string;
  month_key: string;           // "2026-04"
  guide_id: string;
  narrative: string;
  themes: MonthlyTheme[];
  model: string;
  generated_at: string;
  seen_at: string | null;
  delivered_via: string[];
}

/** A discriminated union so /letters can render either kind. The
 *  `kind` field disambiguates at runtime; pattern-matching on it is
 *  exhaustive in TypeScript via `never`. */
export type ArchiveItem =
  | ({ kind: 'weekly' } & WeeklyLetter)
  | ({ kind: 'monthly' } & MonthlyPattern);

interface LettersState {
  letters: WeeklyLetter[];
  patterns: MonthlyPattern[];
  loading: boolean;
  hasFetched: boolean;
  error: string | null;
  fetchLetters: () => Promise<void>;
  markSeen: (id: string, kind?: 'weekly' | 'monthly') => Promise<void>;
  reset: () => void;
  /** Derived — the most recent unread item across both kinds. */
  unread: () => ArchiveItem | null;
  byId: (id: string) => ArchiveItem | null;
  /** All archive items, sorted by generated_at desc. */
  allItems: () => ArchiveItem[];
}

export const useLettersStore = create<LettersState>((set, get) => ({
  letters: [],
  patterns: [],
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
      // Two parallel reads. Either failing surfaces — both kinds are
      // independently useful, so we don't gate one on the other.
      const [lettersRes, patternsRes] = await Promise.all([
        withTimeout(
          supabase
            .from('weekly_letters')
            .select('*')
            .eq('user_id', user.id)
            .order('generated_at', { ascending: false }),
          READ_MS,
          'fetchLetters.weekly',
        ),
        withTimeout(
          supabase
            .from('monthly_patterns')
            .select('*')
            .eq('user_id', user.id)
            .order('generated_at', { ascending: false }),
          READ_MS,
          'fetchLetters.monthly',
        ),
      ]);
      if (lettersRes.error) throw lettersRes.error;
      if (patternsRes.error) throw patternsRes.error;
      set({
        letters: (lettersRes.data as WeeklyLetter[]) ?? [],
        patterns: (patternsRes.data as MonthlyPattern[]) ?? [],
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch letters' });
    } finally {
      set({ loading: false, hasFetched: true });
    }
  },

  markSeen: async (id: string, kind?: 'weekly' | 'monthly') => {
    // Determine which table the id belongs to. `kind` is preferred
    // when supplied (avoids a state lookup); otherwise we infer.
    const inferredKind: 'weekly' | 'monthly' | null =
      kind ??
      (get().letters.some((l) => l.id === id)
        ? 'weekly'
        : get().patterns.some((p) => p.id === id)
        ? 'monthly'
        : null);
    if (!inferredKind) return;

    const seenAt = new Date().toISOString();
    if (inferredKind === 'weekly') {
      const cur = get().letters.find((l) => l.id === id);
      if (!cur || cur.seen_at) return;
      set({
        letters: get().letters.map((l) =>
          l.id === id ? { ...l, seen_at: seenAt } : l,
        ),
      });
      try {
        const { error } = await withTimeout(
          supabase.from('weekly_letters').update({ seen_at: seenAt }).eq('id', id),
          WRITE_MS,
          'markSeen.weekly',
        );
        if (error) throw error;
      } catch (err) {
        set({
          letters: get().letters.map((l) =>
            l.id === id ? { ...l, seen_at: null } : l,
          ),
          error: err instanceof Error ? err.message : 'Failed to mark letter seen',
        });
      }
      return;
    }

    // monthly
    const cur = get().patterns.find((p) => p.id === id);
    if (!cur || cur.seen_at) return;
    set({
      patterns: get().patterns.map((p) =>
        p.id === id ? { ...p, seen_at: seenAt } : p,
      ),
    });
    try {
      const { error } = await withTimeout(
        supabase.from('monthly_patterns').update({ seen_at: seenAt }).eq('id', id),
        WRITE_MS,
        'markSeen.monthly',
      );
      if (error) throw error;
    } catch (err) {
      set({
        patterns: get().patterns.map((p) =>
          p.id === id ? { ...p, seen_at: null } : p,
        ),
        error: err instanceof Error ? err.message : 'Failed to mark pattern seen',
      });
    }
  },

  reset: () =>
    set({ letters: [], patterns: [], loading: false, hasFetched: false, error: null }),

  allItems: () => {
    const { letters, patterns } = get();
    const items: ArchiveItem[] = [
      ...letters.map((l) => ({ kind: 'weekly' as const, ...l })),
      ...patterns.map((p) => ({ kind: 'monthly' as const, ...p })),
    ];
    return items.sort((a, b) =>
      a.generated_at < b.generated_at ? 1 : -1,
    );
  },

  unread: () => {
    const items = get().allItems();
    return items.find((i) => !i.seen_at) ?? null;
  },
  byId: (id) => {
    const items = get().allItems();
    return items.find((i) => i.id === id) ?? null;
  },
}));
