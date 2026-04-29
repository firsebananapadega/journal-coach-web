import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { getDB } from '../lib/db';
import { enqueue } from '../lib/syncQueue';
import { isOnline } from '../lib/networkStatus';

// Project lists. Inbox is a system-created list (is_inbox = true)
// that lives at the top of the Lists tab. ensureInbox() creates it
// idempotently the first time the user lands on Lists or fires a
// capture that needs a default destination.
//
// The store degrades gracefully if the lists table doesn't exist yet
// (migration not applied): all reads return empty, all writes log a
// warning and fail silently. This means the app stays usable while
// the user copy-pastes the SQL into the Supabase editor.

export interface ListRecord {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  icon: string | null;
  sort_order: number;
  is_inbox: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

interface ListState {
  lists: ListRecord[];
  inboxId: string | null;
  loading: boolean;
  error: string | null;
  hasFetched: boolean;
  fetchLists: () => Promise<void>;
  ensureInbox: () => Promise<string | null>;
  createList: (name: string, opts?: { color?: string; icon?: string }) => Promise<ListRecord | null>;
  renameList: (id: string, name: string) => Promise<void>;
  /** Set the icon (a single emoji string). Pass an empty string to
   *  clear back to the default 📁 in render code. */
  updateListIcon: (id: string, icon: string) => Promise<void>;
  deleteList: (id: string) => Promise<void>;
  reset: () => void;
}

const INBOX_NAME = 'Inbox';

function isMissingTableError(err: unknown): boolean {
  const msg = (err as { message?: string })?.message?.toLowerCase() ?? '';
  return (
    msg.includes('relation') &&
    (msg.includes('does not exist') || msg.includes('not exist'))
  );
}

export const useListStore = create<ListState>((set, get) => ({
  lists: [],
  inboxId: null,
  loading: false,
  error: null,
  hasFetched: false,

  fetchLists: async () => {
    try {
      set({ loading: true, error: null });

      // Hydrate from Dexie first for offline cold-opens. Sort to
      // match Supabase's order (is_inbox DESC, sort_order ASC,
      // created_at ASC) so /lists doesn't reshuffle when the network
      // fetch returns.
      const db = getDB();
      if (db) {
        try {
          const cached = await db.lists.toArray();
          if (cached.length > 0) {
            const sorted = [...cached].sort((a, b) => {
              if (a.is_inbox !== b.is_inbox) return a.is_inbox ? -1 : 1;
              if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
              return (a.created_at ?? '').localeCompare(b.created_at ?? '');
            });
            const inbox = sorted.find((l) => l.is_inbox) ?? null;
            set({ lists: sorted as ListRecord[], inboxId: inbox?.id ?? null, hasFetched: true });
          }
        } catch {}
      }

      // Skip the network fetch entirely when offline. The hydrate
      // above already populated state from Dexie; running the fetch
      // would only risk overwriting it with [] in failure modes
      // where supabase-js doesn't surface an error properly.
      if (!isOnline()) return;

      // getSession is a localStorage read; getUser hits the network
      // and returns null offline (which would wrongly clear cache).
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        // Don't clear — sign-out path calls reset() explicitly.
        return;
      }
      const { data, error } = await supabase
        .from('lists')
        .select('*')
        .eq('user_id', user.id)
        .eq('archived', false)
        .order('is_inbox', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      const lists = (data ?? []) as ListRecord[];

      // Don't clobber populated state with an empty success response
      // — RLS or stale-token glitches can return [] without setting
      // error. Skip the set + Dexie clear so the cache stays as the
      // source of truth until the next successful fetch.
      if (lists.length === 0 && get().lists.length > 0) {
        return;
      }

      const inbox = lists.find((l) => l.is_inbox) ?? null;
      set({ lists, inboxId: inbox?.id ?? null, hasFetched: true });

      if (db) {
        try {
          await db.lists.clear();
          if (lists.length > 0) await db.lists.bulkPut(lists);
        } catch {}
      }
    } catch (err) {
      if (isMissingTableError(err)) {
        // Migration not applied yet — surface a friendly empty state.
        set({ lists: [], inboxId: null, hasFetched: true, error: 'lists table not found' });
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to fetch lists';
        set({ error: msg });
      }
    } finally {
      set({ loading: false });
    }
  },

  ensureInbox: async () => {
    const cached = get().inboxId;
    if (cached) return cached;
    if (!get().hasFetched) {
      await get().fetchLists();
      const after = get().inboxId;
      if (after) return after;
    }
    // Don't try to insert offline — supabase would NetworkError and
    // the retry loop becomes noise. Inbox creation is a one-time
    // online operation; if the user genuinely has no inbox cached,
    // we'll create it on next online cold-open.
    if (!isOnline()) return null;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return null;
      const { data, error } = await supabase
        .from('lists')
        .insert({
          user_id: user.id,
          name: INBOX_NAME,
          is_inbox: true,
          sort_order: 0,
        })
        .select()
        .single();
      if (error) {
        // Race: another tab beat us to it. Re-fetch and read.
        await get().fetchLists();
        return get().inboxId;
      }
      const inbox = data as ListRecord;
      set((s) => ({
        lists: [inbox, ...s.lists.filter((l) => l.id !== inbox.id)],
        inboxId: inbox.id,
      }));
      return inbox.id;
    } catch (err) {
      if (isMissingTableError(err)) {
        return null;
      }
      console.warn('ensureInbox failed', err);
      return null;
    }
  },

  createList: async (name, opts) => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;

    const now = new Date().toISOString();
    const created: ListRecord = {
      id: crypto.randomUUID(),
      user_id: user.id,
      name: trimmed,
      color: opts?.color ?? null,
      icon: opts?.icon ?? null,
      sort_order: get().lists.filter((l) => !l.is_inbox).length + 1,
      is_inbox: false,
      archived: false,
      created_at: now,
      updated_at: now,
    };
    set((s) => ({ lists: [...s.lists, created] }));
    await enqueue({ op: 'insert', table: 'lists', row_id: created.id, payload: created });
    return created;
  },

  renameList: async (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = { name: trimmed, updated_at: new Date().toISOString() };
    set({
      lists: get().lists.map((l) => (l.id === id ? { ...l, ...next } : l)),
    });
    await enqueue({ op: 'update', table: 'lists', row_id: id, payload: next });
  },

  updateListIcon: async (id, icon) => {
    const iconValue = icon.trim() || null;
    const next = { icon: iconValue, updated_at: new Date().toISOString() };
    set({
      lists: get().lists.map((l) => (l.id === id ? { ...l, ...next } : l)),
    });
    await enqueue({ op: 'update', table: 'lists', row_id: id, payload: next });
  },

  deleteList: async (id) => {
    const list = get().lists.find((l) => l.id === id);
    if (!list || list.is_inbox) return; // Can't delete Inbox.
    set({ lists: get().lists.filter((l) => l.id !== id) });
    await enqueue({ op: 'delete', table: 'lists', row_id: id, payload: null });
  },

  reset: () => set({ lists: [], inboxId: null, hasFetched: false, error: null }),
}));
