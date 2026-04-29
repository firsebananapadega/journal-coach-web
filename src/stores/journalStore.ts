import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/withTimeout';
import { getDB } from '../lib/db';
import { enqueue } from '../lib/syncQueue';
import { isOnline } from '../lib/networkStatus';

// Deadlines for each Supabase operation. The app was shipping "Saving…"
// spinners that hung forever when a round-trip stalled — converting
// hangs into explicit throws is the only way to recover without a
// force-quit.
const READ_MS = 15000;

// Module-level lock for the structured-backfill queue. Prevents two
// concurrent fetchEntries calls from each kicking off their own
// backfill pass and double-spending Gemini quota on the same entries.
let backfillInFlight = false;
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

interface PendingDelete {
  entry: JournalEntry;
  timer: ReturnType<typeof setTimeout>;
}

interface JournalState {
  entries: JournalEntry[];
  loading: boolean;
  hasFetched: boolean;
  error: string | null;
  // Entries the user has swipe-deleted but not yet committed. Kept in
  // memory so Undo can restore them before the timer elapses. Not
  // persisted across reloads (if the user refreshes, the delete
  // commits immediately — same as iOS Mail).
  pendingDeletes: Record<string, PendingDelete>;
  fetchEntries: () => Promise<void>;
  createEntry: (entry: NewEntryInput) => Promise<JournalEntry>;
  updateEntry: (id: string, updates: Partial<JournalEntry>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  // Optimistically remove from the visible list and schedule the
  // real DB delete after `delayMs`. Returns an undo function the
  // caller wires up to a toast. If `undo` is never called, the
  // delete commits when the timer fires.
  softDeleteEntry: (id: string, delayMs?: number) => { undo: () => void } | null;
  toggleFavorite: (id: string) => Promise<void>;
  fetchEntryById: (id: string) => Promise<JournalEntry | null>;
  // Local-only patch to an entry in the store. Used by Raw/Structured
  // caching in EntryCard to reflect a freshly generated structured
  // view without triggering a refetch.
  applyEntryPatch: (id: string, patch: Partial<JournalEntry>) => void;
  /** Sequential backfill: scans the current entries slice for rows
   *  that have raw text but no structured view, runs Gemini on them
   *  one at a time, and patches the store as each lands. Cap-limited
   *  per call (default 5) so we don't burn the daily Gemini quota in
   *  one shot. No-op when offline. Idempotent — already-running
   *  backfill calls become no-ops via an internal lock. */
  backfillStructured: (cap?: number) => Promise<void>;
  reset: () => void;
}

export const useJournalStore = create<JournalState>((set, get) => ({
  entries: [],
  loading: false,
  hasFetched: false,
  error: null,
  pendingDeletes: {},

  fetchEntries: async () => {
    try {
      set({ loading: true, error: null });

      // Hydrate from Dexie first for offline-friendly cold-opens.
      const db = getDB();
      if (db) {
        try {
          const cached = await db.journal_entries.toArray();
          if (cached.length > 0) {
            // Sort newest-first to match Supabase ordering.
            const sorted = [...cached].sort((a, b) =>
              a.created_at < b.created_at ? 1 : -1,
            );
            set({ entries: sorted as JournalEntry[] });
          }
        } catch {}
      }

      // Skip the network fetch when offline. The hydrate above
      // already populated state from Dexie; running the fetch would
      // only risk overwriting it with [] in failure modes.
      if (!isOnline()) return;

      // Use getSession (localStorage read) so this works offline.
      // The retry loop is dropped — getSession is synchronous-ish
      // and either returns a session or doesn't.
      const { data: { session } } = await withTimeout(
        supabase.auth.getSession(),
        AUTH_MS,
        'auth.getSession',
      );
      const user = session?.user;
      if (!user) {
        // Don't clear cached entries — sign-out reset() handles that.
        return;
      }
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
      const entries = (data as JournalEntry[]) ?? [];
      set({ entries });

      if (db) {
        try {
          await db.journal_entries.clear();
          if (entries.length > 0) await db.journal_entries.bulkPut(entries);
        } catch {}
      }
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch entries' });
    } finally {
      set({ loading: false, hasFetched: true });
      // Kick off a structured backfill pass once entries have landed.
      // Fire-and-forget — the backfill action handles its own
      // concurrency lock and offline guard, and the user's view
      // doesn't block on it.
      void get().backfillStructured();
    }
  },

  createEntry: async (input: NewEntryInput) => {
    try {
      set({ loading: true, error: null });
      const { data: { session } } = await withTimeout(
        supabase.auth.getSession(),
        AUTH_MS,
        'auth.getSession',
      );
      const user = session?.user;
      if (!user) throw new Error('No authenticated user');
      // Auto-assign the Journal system notebook when none is provided.
      // This best-effort lookup needs the network — offline the entry
      // just lands with null notebook_id and gets refiled when caller
      // wants. Wrapped in try/catch so an offline lookup doesn't
      // block creation.
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
      const now = new Date().toISOString();
      const created: JournalEntry = {
        id: crypto.randomUUID(),
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
        content_structured: null,
        structured_generated_at: null,
        structured_gemini_model: null,
        ...input,
        notebook_id: notebookId,
        created_at: now,
        updated_at: now,
      };
      set({ entries: [created, ...get().entries] });
      await enqueue({ op: 'insert', table: 'journal_entries', row_id: created.id, payload: created });

      // Pre-generate the structured view in the background so the
      // next notebook-feed render is instant. Don't await — the
      // user sees their entry immediately; the polished version
      // lands in content_structured a beat later. Pulse entries
      // are rendered by PulseEntryCard (structured prompts already)
      // so we don't need the polish pass for them.
      const shouldStructure =
        created.entry_type !== 'pulse' &&
        !!created.content_text &&
        created.content_text.trim().length > 5;
      if (shouldStructure) {
        (async () => {
          try {
            const { getStructured } = await import('../lib/structureEntry');
            // guardAgainstUserEdits: if the user has already opened
            // entry-detail and saved a manual edit to content_structured
            // by the time this background call resolves, the SQL
            // .is('content_structured', null) filter prevents this
            // call from overwriting their edit.
            const res = await getStructured(
              {
                id: created.id,
                content_text: created.content_text,
                content_structured: null,
              },
              { guardAgainstUserEdits: true },
            );
            // Reflect the cached result in the store ONLY if the
            // current in-memory row still has no structured value —
            // mirrors the SQL guard so we don't clobber an in-memory
            // user edit either.
            set((s) => ({
              entries: s.entries.map((e) => {
                if (e.id !== created.id) return e;
                if (e.content_structured && e.content_structured.trim()) return e;
                return {
                  ...e,
                  content_structured: res.text,
                  structured_generated_at: new Date().toISOString(),
                };
              }),
            }));
          } catch (err) {
            console.warn('[journalStore] background structure failed', err);
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
    // Edit-the-structured architecture: callers write exactly the
    // fields they want changed, and the store doesn't second-guess
    // them. Specifically: changing `content_text` does NOT auto-blow-
    // away `content_structured`. The structured version is the user's
    // edited working copy and should never be lost without explicit
    // intent (the "Re-polish from raw" button is the explicit path).
    const payload = { ...updates, updated_at: new Date().toISOString() };
    set({ entries: get().entries.map((e) => (e.id === id ? { ...e, ...payload } : e)) });
    await enqueue({ op: 'update', table: 'journal_entries', row_id: id, payload });
  },

  deleteEntry: async (id: string) => {
    set({ entries: get().entries.filter((e) => e.id !== id) });
    await enqueue({ op: 'delete', table: 'journal_entries', row_id: id, payload: null });
  },

  softDeleteEntry: (id: string, delayMs = 5000) => {
    const entry = get().entries.find((e) => e.id === id);
    if (!entry) return null;

    // Stash the row + remove from the visible list immediately so the
    // UI feels responsive. The real DB delete fires after `delayMs`
    // unless undone.
    const commit = () => {
      set((s) => {
        const rest = { ...s.pendingDeletes };
        delete rest[id];
        return { pendingDeletes: rest };
      });
      // Route the commit through the outbox so it works offline too —
      // a queued delete drains as soon as the network returns. The
      // previous version called supabase directly and re-inserted on
      // failure, which is incompatible with offline-first because every
      // offline delete would re-appear immediately.
      void enqueue({ op: 'delete', table: 'journal_entries', row_id: id, payload: null });
    };

    const timer = setTimeout(commit, delayMs);

    set((s) => ({
      entries: s.entries.filter((e) => e.id !== id),
      pendingDeletes: { ...s.pendingDeletes, [id]: { entry, timer } },
    }));

    return {
      undo: () => {
        const pending = get().pendingDeletes[id];
        if (!pending) return;
        clearTimeout(pending.timer);
        set((s) => {
          const rest = { ...s.pendingDeletes };
          delete rest[id];
          return {
            entries: [...s.entries, pending.entry].sort((a, b) =>
              a.created_at < b.created_at ? 1 : -1,
            ),
            pendingDeletes: rest,
          };
        });
      },
    };
  },

  toggleFavorite: async (id: string) => {
    const entry = get().entries.find((e) => e.id === id);
    if (!entry) return;
    const next = { is_favorite: !entry.is_favorite, updated_at: new Date().toISOString() };
    set({ entries: get().entries.map((e) => (e.id === id ? { ...e, ...next } : e)) });
    await enqueue({ op: 'update', table: 'journal_entries', row_id: id, payload: next });
  },

  fetchEntryById: async (id: string) => {
    // Try the local cache first — useful for offline read of a row
    // the user just navigated to.
    const db = getDB();
    if (db) {
      try {
        const cached = await db.journal_entries.get(id);
        if (cached) {
          // Fire a Supabase fetch in the background to refresh, but
          // return the cache row immediately. (A page that needs the
          // freshest version can read from `entries` after the bg
          // refresh writes through.)
          void (async () => {
            try {
              const { data } = await withTimeout(
                supabase.from('journal_entries').select('*').eq('id', id).single(),
                READ_MS,
                'fetchEntryById.bg',
              );
              if (data && db) await db.journal_entries.put(data as JournalEntry);
            } catch {}
          })();
          return cached as JournalEntry;
        }
      } catch {}
    }
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

  backfillStructured: async (cap = 5) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (backfillInFlight) return;
    backfillInFlight = true;
    try {
      // Snapshot at start — we work off the slice as it was when the
      // backfill kicked in, so a concurrent fetch can't make us iterate
      // forever.
      const snapshot = get().entries;
      const candidates = snapshot.filter((e) => {
        if (e.entry_type === 'pulse') return false;
        if (e.entry_type === 'guided') return false;
        if (e.entry_type === 'template') return false;
        const hasRaw = !!e.content_text && e.content_text.trim().length > 5;
        const hasStructured =
          !!e.content_structured && e.content_structured.trim().length > 0;
        return hasRaw && !hasStructured;
      });
      if (candidates.length === 0) return;
      const slice = candidates.slice(0, cap);
      const { getStructured } = await import('../lib/structureEntry');
      for (const entry of slice) {
        try {
          const res = await getStructured(
            {
              id: entry.id,
              content_text: entry.content_text,
              content_structured: null,
            },
            // Same race protection as the create-time call: if the
            // user manually saved a structured edit while we were
            // working through the queue, don't overwrite it.
            { guardAgainstUserEdits: true },
          );
          // Reflect into the in-memory slice — but only if no edit
          // landed in the meantime.
          set((s) => ({
            entries: s.entries.map((e) => {
              if (e.id !== entry.id) return e;
              if (e.content_structured && e.content_structured.trim()) return e;
              return {
                ...e,
                content_structured: res.text,
                structured_generated_at: new Date().toISOString(),
              };
            }),
          }));
        } catch (err) {
          console.warn('[journalStore] backfill error for entry', entry.id, err);
          // Continue with the remaining candidates — one bad entry
          // shouldn't stop the queue.
        }
      }
    } finally {
      backfillInFlight = false;
    }
  },

  reset: () => {
    // Cancel every outstanding undo timer before clearing — otherwise
    // a pending delete could fire against a freshly signed-in user's
    // RLS context once the timer elapses.
    for (const p of Object.values(get().pendingDeletes)) {
      clearTimeout(p.timer);
    }
    set({ entries: [], loading: false, hasFetched: false, error: null, pendingDeletes: {} });
  },
}));
