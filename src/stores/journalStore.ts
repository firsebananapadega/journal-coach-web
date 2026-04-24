import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/withTimeout';

// Deadlines for each Supabase operation. The app was shipping "Saving…"
// spinners that hung forever when a round-trip stalled — converting
// hangs into explicit throws is the only way to recover without a
// force-quit.
const READ_MS = 15000;
const WRITE_MS = 15000;
const AUTH_MS = 8000;

export interface JournalEntry {
  id: string;
  user_id: string;
  entry_type: 'voice' | 'template' | 'guided' | 'freeform' | 'pulse' | 'check_in' | 'practice';
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
  // Sprint 2: notebook routing + Raw/Structured pair.
  // `content_structured` is a cached Gemini-polished view of
  // `content_text`; invalidated (set to null) on edit, regenerated
  // on first view of the Structured tab.
  notebook_id: string | null;
  content_structured: string | null;
  structured_generated_at: string | null;
  structured_gemini_model: string | null;
  created_at: string;
  updated_at: string;
}

export type NewEntryInput = Pick<JournalEntry, 'entry_type' | 'content_text'> &
  Partial<Omit<JournalEntry, 'id' | 'created_at' | 'updated_at' | 'entry_type' | 'content_text'>>;

interface JournalState {
  entries: JournalEntry[];
  loading: boolean;
  hasFetched: boolean;
  error: string | null;
  fetchEntries: () => Promise<void>;
  createEntry: (entry: NewEntryInput) => Promise<JournalEntry>;
  updateEntry: (id: string, updates: Partial<JournalEntry>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  fetchEntryById: (id: string) => Promise<JournalEntry | null>;
  // Local-only patch to an entry in the store. Used by Raw/Structured
  // caching in EntryCard to reflect a freshly generated structured
  // view without triggering a refetch.
  applyEntryPatch: (id: string, patch: Partial<JournalEntry>) => void;
  reset: () => void;
}

export const useJournalStore = create<JournalState>((set, get) => ({
  entries: [],
  loading: false,
  hasFetched: false,
  error: null,

  fetchEntries: async () => {
    try {
      set({ loading: true, error: null });
      let user = (await withTimeout(supabase.auth.getUser(), AUTH_MS, 'auth.getUser')).data.user;
      // Retry once if auth not ready yet
      if (!user) {
        await new Promise((r) => setTimeout(r, 1000));
        user = (await withTimeout(supabase.auth.getUser(), AUTH_MS, 'auth.getUser')).data.user;
      }
      if (!user) throw new Error('Not signed in');
      const { data, error } = await withTimeout(
        supabase
          .from('journal_entries')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        READ_MS,
        'fetchEntries',
      );
      if (error) throw error;
      set({ entries: (data as JournalEntry[]) ?? [] });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch entries' });
    } finally {
      set({ loading: false, hasFetched: true });
    }
  },

  createEntry: async (input: NewEntryInput) => {
    try {
      set({ loading: true, error: null });
      const { data: { user } } = await withTimeout(
        supabase.auth.getUser(),
        AUTH_MS,
        'auth.getUser',
      );
      if (!user) throw new Error('No authenticated user');
      // Auto-assign the Journal system notebook when none is provided.
      // Callers that know the target notebook (capture flow, per-notebook
      // pages) pass `notebook_id` explicitly and skip this.
      let notebookId: string | null = input.notebook_id ?? null;
      if (!notebookId) {
        try {
          const { data: nb } = await withTimeout(
            supabase
              .from('notebooks')
              .select('id')
              .eq('user_id', user.id)
              .eq('system_key', 'journal')
              .maybeSingle(),
            READ_MS,
            'resolve-default-notebook',
          );
          notebookId = (nb as { id: string } | null)?.id ?? null;
        } catch {
          // Fine — entry just lands with null notebook_id and the
          // user can refile later.
        }
      }
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
        notebook_id: notebookId,
      };
      const { data, error } = await withTimeout(
        supabase.from('journal_entries').insert(entry).select().single(),
        WRITE_MS,
        'createEntry.insert',
      );
      if (error) throw error;
      const created = data as JournalEntry;
      set({ entries: [created, ...get().entries] });

      // Pre-generate the structured view in the background so the
      // next notebook-feed render is instant. Don't await — the
      // user sees their entry immediately; the polished version
      // lands in content_structured a beat later.
      if (created.content_text && created.content_text.trim().length > 10) {
        (async () => {
          try {
            const { getStructured } = await import('../lib/structureEntry');
            const res = await getStructured({
              id: created.id,
              content_text: created.content_text,
              content_structured: null,
            });
            // Reflect the cached result in the store so any mounted
            // EntryCard rendering this row picks it up.
            set((s) => ({
              entries: s.entries.map((e) =>
                e.id === created.id
                  ? {
                      ...e,
                      content_structured: res.text,
                      structured_generated_at: new Date().toISOString(),
                    }
                  : e,
              ),
            }));
          } catch {
            // Swallow — EntryCard falls back to generating lazily
            // on first view.
          }
        })();
      }

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
      // If the raw content changed, invalidate the cached structured
      // view so the next toggle regenerates it.
      const invalidatesStructured =
        Object.prototype.hasOwnProperty.call(updates, 'content_text') &&
        !Object.prototype.hasOwnProperty.call(updates, 'content_structured');
      const payload = invalidatesStructured
        ? { ...updates, content_structured: null, structured_generated_at: null, updated_at: new Date().toISOString() }
        : { ...updates, updated_at: new Date().toISOString() };
      const { data, error } = await withTimeout(
        supabase
          .from('journal_entries')
          .update(payload)
          .eq('id', id)
          .select()
          .single(),
        WRITE_MS,
        'updateEntry',
      );
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
      const { error } = await withTimeout(
        supabase.from('journal_entries').delete().eq('id', id),
        WRITE_MS,
        'deleteEntry',
      );
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
      const { data, error } = await withTimeout(
        supabase
          .from('journal_entries')
          .update({ is_favorite: !entry.is_favorite, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single(),
        WRITE_MS,
        'toggleFavorite',
      );
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
      const { data, error } = await withTimeout(
        supabase.from('journal_entries').select('*').eq('id', id).single(),
        READ_MS,
        'fetchEntryById',
      );
      if (error) throw error;
      return data as JournalEntry;
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch entry' });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  applyEntryPatch: (id, patch) =>
    set((s) => ({
      entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })),

  reset: () => set({ entries: [], loading: false, hasFetched: false, error: null }),
}));
