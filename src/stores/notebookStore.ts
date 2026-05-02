import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/withTimeout';
import { getDB } from '../lib/db';
import { isOnline } from '../lib/networkStatus';

// Notebooks are user-owned collections for journal entries.
// Four "system" notebooks are seeded at signup: journal / gratitude /
// prompts / pulse. A fifth — 'plans' — is materialized lazily the
// first time a user saves a WOOP plan (see ensurePlansNotebook). Users
// add "project" notebooks themselves. The capture classifier picks a
// notebook slug; the preview sheet lets the user override before save.
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
  system_key: 'journal' | 'gratitude' | 'prompts' | 'pulse' | 'plans' | null;
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
  /** Persist a new ordering. Caller passes the full ordered list of
   *  notebook ids; the store rewrites every row's sort_order to its
   *  index in that list (so the DB matches the on-screen order
   *  exactly). Optimistic — UI reflects the new order immediately;
   *  server writes happen in the background. */
  reorderNotebooks: (orderedIds: string[]) => Promise<void>;
  archiveNotebook: (id: string) => Promise<void>;
  /** Lazily materialize the 'Plans' system notebook. Unlike the
   *  signup-seeded systems (Journal/Gratitude/Pulse), Plans is only
   *  created the first time a user saves a WOOP plan. Idempotent —
   *  returns the existing row if one is already on disk or in state. */
  ensurePlansNotebook: () => Promise<Notebook>;
  reset: () => void;

  // Helpers
  byId: (id: string | null | undefined) => Notebook | null;
  bySlug: (slug: string | null | undefined) => Notebook | null;
  journalId: () => string | null;
  pulseId: () => string | null;
  gratitudeId: () => string | null;
  plansId: () => string | null;
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
            // Dexie's toArray() doesn't guarantee insertion order, so
            // sort to match the Supabase ORDER BY (sort_order ASC,
            // created_at ASC). Without this, offline cold-opens (and
            // the moment between Dexie hydrate + Supabase fetch on
            // online opens) showed notebooks in a shuffled order —
            // exactly the bug the user reported.
            const sorted = [...cached].sort((a, b) => {
              if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
              return (a.created_at ?? '').localeCompare(b.created_at ?? '');
            });
            set({ notebooks: sorted as Notebook[] });
          }
        } catch {}
      }

      // Skip the network fetch when offline so the hydrated cache
      // can't get overwritten by a failure-mode empty response.
      if (!isOnline()) return;

      const { data: { session } } = await withTimeout(
        supabase.auth.getSession(),
        AUTH_MS,
        'auth.getSession',
      );
      const user = session?.user;
      if (!user) {
        // Don't clear cached notebooks — keep last-known-good state
        // until the user explicitly signs out.
        return;
      }
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
      const { data: { session } } = await withTimeout(
        supabase.auth.getSession(),
        AUTH_MS,
        'auth.getSession',
      );
      const user = session?.user;
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

  reorderNotebooks: async (orderedIds: string[]) => {
    if (orderedIds.length === 0) return;
    const orderById = new Map<string, number>();
    orderedIds.forEach((id, i) => orderById.set(id, i));
    const now = new Date().toISOString();
    // Optimistically reorder the in-memory slice + reassign sort_order.
    set({
      notebooks: get()
        .notebooks.map((n) => {
          const next = orderById.get(n.id);
          return next != null ? { ...n, sort_order: next } : n;
        })
        .sort((a, b) => a.sort_order - b.sort_order),
    });
    // Mirror to Dexie so the next cold-start has the new order.
    const db = getDB();
    if (db) {
      try {
        await db.notebooks.bulkPut(get().notebooks);
      } catch {}
    }
    // Fire one UPDATE per row. The notebooks table doesn't have a
    // bulk-update RPC; sequential updates are fine at the personal-
    // app scale (handful of notebooks).
    for (const [id, sort_order] of orderById.entries()) {
      try {
        await withTimeout(
          supabase
            .from('notebooks')
            .update({ sort_order, updated_at: now })
            .eq('id', id),
          WRITE_MS,
          'reorderNotebooks',
        );
      } catch {
        // Soft fail — the optimistic in-memory order persists; the
        // next online fetch will re-sync from Supabase. If the user
        // was offline mid-reorder, their device shows the new order
        // until the next sync.
      }
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

  gratitudeId: () => {
    const g = get().notebooks.find((n) => n.system_key === 'gratitude');
    return g?.id ?? null;
  },

  plansId: () => {
    const p = get().notebooks.find((n) => n.system_key === 'plans');
    return p?.id ?? null;
  },

  ensurePlansNotebook: async () => {
    // Fast path: already in state.
    const cached = get().notebooks.find((n) => n.system_key === 'plans');
    if (cached) return cached;

    const { data: { session } } = await withTimeout(
      supabase.auth.getSession(),
      AUTH_MS,
      'auth.getSession',
    );
    const user = session?.user;
    if (!user) throw new Error('No authenticated user');

    // Server-side dedup by the unique (user_id, system_key) constraint.
    // If a parallel call materialized it first, on-conflict-do-nothing
    // returns no row → re-select.
    const sortAfter = (get().notebooks[get().notebooks.length - 1]?.sort_order ?? 10) + 1;
    const row = {
      user_id: user.id,
      name: 'Plans',
      slug: 'plans',
      color: '#7CA585',
      icon: 'check-square',
      kind: 'system' as const,
      system_key: 'plans' as const,
      is_default: false,
      sort_order: sortAfter,
      archived: false,
    };
    const { data: inserted, error: insertErr } = await withTimeout(
      supabase.from('notebooks').insert(row).select().single(),
      WRITE_MS,
      'ensurePlansNotebook',
    );
    if (inserted) {
      const created = inserted as Notebook;
      set({ notebooks: [...get().notebooks, created] });
      const db = getDB();
      if (db) await db.notebooks.put(created).catch(() => {});
      return created;
    }
    // Insert failed (likely the unique constraint kicked in from a
    // concurrent path). Re-select the row that won.
    if (insertErr) {
      const { data: existing } = await withTimeout(
        supabase
          .from('notebooks')
          .select('*')
          .eq('user_id', user.id)
          .eq('system_key', 'plans')
          .single(),
        READ_MS,
        'ensurePlansNotebook.reselect',
      );
      if (existing) {
        const found = existing as Notebook;
        set({ notebooks: [...get().notebooks.filter((n) => n.id !== found.id), found] });
        return found;
      }
      throw insertErr;
    }
    throw new Error('Plans notebook not created');
  },
}));
