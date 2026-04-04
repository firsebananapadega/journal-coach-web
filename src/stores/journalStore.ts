import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface JournalEntry {
  id: string;
  user_id: string;
  entry_type: 'voice' | 'template' | 'guided' | 'freeform';
  title: string | null;
  content_text: string | null;
  template_id: string | null;
  mood_score: number | null;
  mood_label: string | null;
  tags: string[];
  is_favorite: boolean;
  duration_seconds: number | null;
  word_count: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type NewEntryInput = Pick<JournalEntry, 'entry_type' | 'content_text'> &
  Partial<Omit<JournalEntry, 'id' | 'created_at' | 'updated_at' | 'entry_type' | 'content_text'>>;

interface JournalState {
  entries: JournalEntry[];
  loading: boolean;
  error: string | null;
  fetchEntries: () => Promise<void>;
  createEntry: (entry: NewEntryInput) => Promise<JournalEntry>;
  updateEntry: (id: string, updates: Partial<JournalEntry>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  fetchEntryById: (id: string) => Promise<JournalEntry | null>;
  reset: () => void;
}

export const useJournalStore = create<JournalState>((set, get) => ({
  entries: [],
  loading: false,
  error: null,

  fetchEntries: async () => {
    try {
      set({ loading: true, error: null });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      set({ entries: (data as JournalEntry[]) ?? [] });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch entries' });
    } finally {
      set({ loading: false });
    }
  },

  createEntry: async (input: NewEntryInput) => {
    try {
      set({ loading: true, error: null });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');
      const entry = {
        user_id: user.id,
        template_id: null,
        tags: [],
        is_favorite: false,
        duration_seconds: null,
        word_count: null,
        title: null,
        mood_score: null,
        mood_label: null,
        metadata: null,
        ...input,
      };
      const { data, error } = await supabase
        .from('journal_entries')
        .insert(entry)
        .select()
        .single();
      if (error) throw error;
      const created = data as JournalEntry;
      set({ entries: [created, ...get().entries] });
      return created;
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to create entry' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  updateEntry: async (id: string, updates: Partial<JournalEntry>) => {
    try {
      set({ loading: true, error: null });
      const { data, error } = await supabase
        .from('journal_entries')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      const updated = data as JournalEntry;
      set({ entries: get().entries.map((e) => (e.id === id ? updated : e)) });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to update entry' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  deleteEntry: async (id: string) => {
    try {
      set({ loading: true, error: null });
      const { error } = await supabase.from('journal_entries').delete().eq('id', id);
      if (error) throw error;
      set({ entries: get().entries.filter((e) => e.id !== id) });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to delete entry' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  toggleFavorite: async (id: string) => {
    try {
      const entry = get().entries.find((e) => e.id === id);
      if (!entry) throw new Error('Entry not found');
      set({ loading: true, error: null });
      const { data, error } = await supabase
        .from('journal_entries')
        .update({ is_favorite: !entry.is_favorite, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      const updated = data as JournalEntry;
      set({ entries: get().entries.map((e) => (e.id === id ? updated : e)) });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to toggle favorite' });
    } finally {
      set({ loading: false });
    }
  },

  fetchEntryById: async (id: string) => {
    try {
      set({ loading: true, error: null });
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as JournalEntry;
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch entry' });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  reset: () => set({ entries: [], loading: false, error: null }),
}));
