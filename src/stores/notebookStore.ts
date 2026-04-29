import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/withTimeout';
import { getDB } from '../lib/db';

// Notebooks are user-owned collections for journal entries.
// Four "system" notebooks are seeded at signup: journal / gratitude /
// prompts / pulse. Users add "project" notebooks themselves. The
// capture classifier picks a notebook slug; the preview sheet lets
// the user override before save.
//
// System notebooks are non-deletable (archiveNotebook refuses them)
// because they back app-level surfaces: Journal is the default for
// free-form entries, Pulse holds morning/evening check-ins, etc.

const READ_MS = 15000;
const WRITE_MS = 15000;
const AUTH_MS = 8000;

export interface Notebook {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  color: string;
  icon: string;
  kind: 'system' | 'project';
  system_key: 'journal' | 'gratitude' | 'prompts' | 'pulse' | null;
  is_default: boolean;
  sort_order: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export type NewNotebookInput = {
  name: string;
  slug?: string;
  color?: string;
  icon?: string;
};

interface NotebookState {
  notebooks: Notebook[];
  loading: boolean;
  hasFetched: boolean;
  error: string | null;

  fetchNotebooks: () => Promise<void>;
  createNotebook: (input: NewNotebookInput) => Promise<Notebook>;
  updateNotebook: (id: string, updates: Partial<Notebook>) => Promise<void>;
  archiveNotebook: (id: string) => Promise<void>;
  reset: () => void;

  // Helpers
  byId: (id: string | null | undefined) => Notebook | null;
  bySlug: (slug: string | null | undefined) => Notebook | null;
  journalId: () => string | null;
  pulseId: () => string | null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'notebook';
}

export const useNotebookStore = create<NotebookState>((set, get) => ({
  notebooks: [],
  loading: false,
  hasFetched: false,
  error: null,

  fetchNotebooks: async () => {
    try {
      set({ loading: true, error: null });

      // Hydrate from Dexie first for offline cold-opens.
      const db = getDB();
      if (db) {
        try {
          const cached = await db.notebooks.toArray();
          if (cached.length > 0) {
            set({ notebooks: cached as Notebook[] });
          }
        } catch {}
      }

      const { data: { user } } = await withTimeout(
        supabase.auth.getUser(),
        AUTH_MS,
        'auth.getUser',
      );
      if (!user) throw new Error('Not signed in');
      const { data, error } = await withTimeout(
        supabase
          .from('notebooks')
          .select('*')
          .eq('user_id', user.id)
          .eq('archived', false)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        READ_MS,
        'fetchNotebooks',
      );
      if (error) throw error;
      const notebooks = (data as Notebook[]) ?? [];
      set({ notebooks });

      if (db) {
        try {
          await db.notebooks.clear();
          if (notebooks.length > 0) await db.notebooks.bulkPut(notebooks);
        } catch {}
      }
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch notebooks' });
    } finally {
      set({ loading: false, hasFetched: true });
    }
  },

  createNotebook: async (input: NewNotebookInput) => {
    try {
      set({ loading: true, error: null });
      const { data: { user } } = await withTimeout(
        supabase.auth.getUser(),
        AUTH_MS,
        'auth.getUser',
      );
      if (!user) throw new Error('No authenticated user');
      const slug = input.slug ?? slugify(input.name);
      const row = {
        user_id: user.id,
        name: input.name,
        slug,
        color: input.color ?? '#C4553D',
        icon: input.icon ?? 'book',
        kind: 'project' as const,
        system_key: null,
        is_default: false,
        sort_order: (get().notebooks[get().notebooks.length - 1]?.sort_order ?? 10) + 1,
        archived: false,
      };
      const { data, error } = await withTimeout(
        supabase.from('notebooks').insert(row).select().single(),
        WRITE_MS,
        'createNotebook',
      );
      if (error) throw error;
      const created = data as Notebook;
      set({ notebooks: [...get().notebooks, created] });
      return created;
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to create notebook' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  updateNotebook: async (id: string, updates: Partial<Notebook>) => {
    try {
      set({ loading: true, error: null });
      const { data, error } = await withTimeout(
        supabase
          .from('notebooks')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single(),
        WRITE_MS,
        'updateNotebook',
      );
      if (error) throw error;
      const updated = data as Notebook;
      set({
        notebooks: get().notebooks.map((n) => (n.id === id ? updated : n)),
      });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to update notebook' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  archiveNotebook: async (id: string) => {
    // System notebooks are persistent app surfaces (Journal default,
    // Pulse check-ins, etc.) — refuse to archive them even if a caller
    // somehow gets an id. UI doesn't surface a delete button for
    // system notebooks; this is the belt-and-braces check.
    const target = get().notebooks.find((n) => n.id === id);
    if (target && target.kind === 'system') {
      const err = new Error('System notebooks cannot be archived');
      set({ error: err.message });
      throw err;
    }
    try {
      set({ loading: true, error: null });
      const { error } = await withTimeout(
        supabase
          .from('notebooks')
          .update({ archived: true, updated_at: new Date().toISOString() })
          .eq('id', id),
        WRITE_MS,
        'archiveNotebook',
      );
      if (error) throw error;
      set({ notebooks: get().notebooks.filter((n) => n.id !== id) });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to archive notebook' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  reset: () => set({ notebooks: [], loading: false, hasFetched: false, error: null }),

  byId: (id) => {
    if (!id) return null;
    return get().notebooks.find((n) => n.id === id) ?? null;
  },

  bySlug: (slug) => {
    if (!slug) return null;
    return get().notebooks.find((n) => n.slug === slug) ?? null;
  },

  journalId: () => {
    const j = get().notebooks.find((n) => n.system_key === 'journal');
    return j?.id ?? null;
  },

  pulseId: () => {
    const p = get().notebooks.find((n) => n.system_key === 'pulse');
    return p?.id ?? null;
  },
}));
