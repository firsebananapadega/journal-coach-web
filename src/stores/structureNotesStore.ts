// Structure notes — user-nameable themes that group multiple journal
// entries (Zettelkasten-style "Structure Notizen"). The MVP is fully
// hand-curated: user creates a note, sets a title + optional
// description, and toggles entries in/out of the note's entry_ids
// array. v2 will add embedding-based suggestions so the app can
// propose entries that semantically match.

import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/withTimeout';

const READ_MS = 15000;
const WRITE_MS = 10000;
const AUTH_MS = 8000;

export interface StructureNote {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  entry_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface NewStructureNoteInput {
  title: string;
  description?: string | null;
}

interface StructureNotesState {
  notes: StructureNote[];
  loading: boolean;
  hasFetched: boolean;
  error: string | null;
  fetchNotes: () => Promise<void>;
  createNote: (input: NewStructureNoteInput) => Promise<StructureNote>;
  updateNote: (id: string, updates: Partial<StructureNote>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  /** Toggle an entry's membership in a note. Updates entry_ids in
   *  place; persisted via updateNote. */
  toggleEntry: (noteId: string, entryId: string) => Promise<void>;
  byId: (id: string) => StructureNote | null;
  /** All notes containing the given entry id. Used by the entry
   *  detail "Add to a note" picker to mark already-linked notes. */
  notesContainingEntry: (entryId: string) => StructureNote[];
  reset: () => void;
}

export const useStructureNotesStore = create<StructureNotesState>((set, get) => ({
  notes: [],
  loading: false,
  hasFetched: false,
  error: null,

  fetchNotes: async () => {
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
          .from('structure_notes')
          .select('*')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false }),
        READ_MS,
        'fetchStructureNotes',
      );
      if (error) throw error;
      // Postgres returns jsonb as a JS array already; just guard the
      // shape for safety.
      const notes = ((data ?? []) as StructureNote[]).map((n) => ({
        ...n,
        entry_ids: Array.isArray(n.entry_ids) ? n.entry_ids : [],
      }));
      set({ notes });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch notes' });
    } finally {
      set({ loading: false, hasFetched: true });
    }
  },

  createNote: async (input) => {
    set({ loading: true, error: null });
    try {
      const { data: { user } } = await withTimeout(
        supabase.auth.getUser(),
        AUTH_MS,
        'auth.getUser',
      );
      if (!user) throw new Error('Not signed in');
      const { data, error } = await withTimeout(
        supabase
          .from('structure_notes')
          .insert({
            user_id: user.id,
            title: input.title.trim(),
            description: input.description?.trim() || null,
            entry_ids: [],
          })
          .select()
          .single(),
        WRITE_MS,
        'createStructureNote',
      );
      if (error) throw error;
      const created = data as StructureNote;
      set({ notes: [{ ...created, entry_ids: created.entry_ids ?? [] }, ...get().notes] });
      return created;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create note';
      set({ error: msg });
      throw err;
    } finally {
      set({ loading: false });
    }
  },

  updateNote: async (id, updates) => {
    const previous = get().notes.find((n) => n.id === id);
    if (!previous) return;
    // Optimistic update; rollback on failure.
    set({
      notes: get().notes.map((n) =>
        n.id === id ? { ...n, ...updates, updated_at: new Date().toISOString() } : n,
      ),
    });
    try {
      const { error } = await withTimeout(
        supabase
          .from('structure_notes')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', id),
        WRITE_MS,
        'updateStructureNote',
      );
      if (error) throw error;
    } catch (err) {
      set({
        notes: get().notes.map((n) => (n.id === id ? previous : n)),
        error: err instanceof Error ? err.message : 'Failed to update note',
      });
      throw err;
    }
  },

  deleteNote: async (id) => {
    const previous = get().notes;
    set({ notes: previous.filter((n) => n.id !== id) });
    try {
      const { error } = await withTimeout(
        supabase.from('structure_notes').delete().eq('id', id),
        WRITE_MS,
        'deleteStructureNote',
      );
      if (error) throw error;
    } catch (err) {
      set({
        notes: previous,
        error: err instanceof Error ? err.message : 'Failed to delete note',
      });
      throw err;
    }
  },

  toggleEntry: async (noteId, entryId) => {
    const note = get().notes.find((n) => n.id === noteId);
    if (!note) return;
    const has = note.entry_ids.includes(entryId);
    const nextIds = has
      ? note.entry_ids.filter((x) => x !== entryId)
      : [...note.entry_ids, entryId];
    await get().updateNote(noteId, { entry_ids: nextIds });
  },

  byId: (id) => get().notes.find((n) => n.id === id) ?? null,
  notesContainingEntry: (entryId) =>
    get().notes.filter((n) => n.entry_ids.includes(entryId)),

  reset: () =>
    set({ notes: [], loading: false, hasFetched: false, error: null }),
}));
