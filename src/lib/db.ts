'use client';

// Local IndexedDB cache + outbox queue for offline-first writes.
//
// What lives here:
//   - Mirrors of the Supabase tables the user touches while offline:
//     tasks, lists, grocery_items, grocery_groups, grocery_lists,
//     journal_entries.
//   - An `outbox` table holding pending mutations (insert/update/delete)
//     that couldn't reach Supabase (because the user was offline OR
//     because the network was lying via navigator.onLine === true but
//     fetch actually failed).
//
// Read path: pages call `hydrateFromCache()` on the relevant Zustand
// store FIRST, which reads from these tables and populates in-memory
// state. The existing Supabase fetchAll() then runs in parallel and
// overrides once the network returns.
//
// Write path: every Zustand action that mutates server data routes
// through `enqueue()` in syncQueue.ts, which writes both the optimistic
// cache row AND an outbox row in a single Dexie transaction. The
// drainer fires the actual Supabase calls when the network is up.
//
// We deliberately mirror the FULL row shape (not just a subset) so
// callers can pass cached rows back into Zustand without translation.

import Dexie, { type Table } from 'dexie';
import type { Task } from '@/stores/taskStore';
import type { ListRecord } from '@/stores/listStore';
import type {
  GroceryItem,
  GroceryGroup,
} from '@/stores/groceryStore';
import type { JournalEntry } from '@/stores/journalStore';
import type { Notebook } from '@/stores/notebookStore';
import type {
  WeeklyLetter,
  MonthlyPattern,
  QuarterlyLetter,
} from '@/stores/lettersStore';

// Re-exported as Cached* names so callers don't accidentally pass a
// fresh-from-server row where a cache row was expected (or vice versa
// in TypeScript-strict mode). The shapes are identical today; if the
// cache ever needs to drop fields, only this file changes.
export type CachedTask = Task;
export type CachedList = ListRecord;
export type CachedGroceryItem = GroceryItem;
export type CachedGroceryGroup = GroceryGroup;
export type CachedJournalEntry = JournalEntry;
export type CachedNotebook = Notebook;
export type CachedWeeklyLetter = WeeklyLetter;
export type CachedMonthlyPattern = MonthlyPattern;
export type CachedQuarterlyLetter = QuarterlyLetter;

export type OutboxOp = 'insert' | 'update' | 'delete';
// `grocery_lists` (the parent shared-list metadata) is intentionally
// not cached — it only changes via online-only invite/share flows,
// and the offline writes the user cares about all live in items and
// groups under an existing list. Letters / patterns / notebooks are
// read-mostly so we cache for offline READ but don't enqueue writes
// for them in Phase 1.
export type OutboxTable =
  | 'tasks'
  | 'lists'
  | 'grocery_items'
  | 'grocery_groups'
  | 'journal_entries';

export interface OutboxRow {
  /** Auto-incremented IDB key (Dexie assigns). */
  id?: number;
  /** Idempotency key — same op replayed twice should be a no-op on
   *  the server side once the trigger lands in Phase 2. */
  client_op_id: string;
  op: OutboxOp;
  table: OutboxTable;
  /** PK of the row being mutated. For inserts, the client-generated UUID. */
  row_id: string;
  /** Insert: full row. Update: patch only. Delete: null. */
  payload: unknown;
  /** ISO. Drain order. */
  enqueued_at: string;
  attempts: number;
  last_error?: string;
}

class JournalCoachDB extends Dexie {
  tasks!: Table<CachedTask, string>;
  lists!: Table<CachedList, string>;
  grocery_items!: Table<CachedGroceryItem, string>;
  grocery_groups!: Table<CachedGroceryGroup, string>;
  journal_entries!: Table<CachedJournalEntry, string>;
  notebooks!: Table<CachedNotebook, string>;
  weekly_letters!: Table<CachedWeeklyLetter, string>;
  monthly_patterns!: Table<CachedMonthlyPattern, string>;
  quarterly_letters!: Table<CachedQuarterlyLetter, string>;
  outbox!: Table<OutboxRow, number>;

  constructor() {
    super('journalcoach.v1');
    // Index strings — first is the PK, rest are secondary indices used
    // by the page-level queries (e.g. tasks-for-list, items-by-group).
    this.version(1).stores({
      tasks: 'id, user_id, list_id, due_date, updated_at',
      lists: 'id, user_id, sort_order',
      grocery_items: 'id, list_id, group_id, completed',
      grocery_groups: 'id, list_id',
      journal_entries: 'id, user_id, entry_type, updated_at',
      outbox: '++id, client_op_id, table, enqueued_at',
    });
    // Read-mostly tables added so notebooks, weekly letters, monthly
    // patterns, and quarterly letters are visible offline. No outbox
    // entries for these — Phase 1 doesn't queue writes against them
    // (mutations on letters/patterns are server-generated; notebook
    // CRUD remains online-only).
    this.version(2).stores({
      notebooks: 'id, user_id, slug, sort_order',
      weekly_letters: 'id, user_id, week_key, generated_at',
      monthly_patterns: 'id, user_id, month_key, generated_at',
      quarterly_letters: 'id, user_id, quarter_key, generated_at',
    });
  }
}

// SSR-safe singleton. Dexie's constructor throws if there's no
// indexedDB global, so guard against the server prerender path.
let _db: JournalCoachDB | null = null;
export function getDB(): JournalCoachDB | null {
  if (typeof indexedDB === 'undefined') return null;
  if (!_db) _db = new JournalCoachDB();
  return _db;
}

/** Convenience for code paths that genuinely require the DB and
 *  always run client-side (e.g. inside store actions invoked from
 *  user gestures). Throws on the server. */
export function requireDB(): JournalCoachDB {
  const db = getDB();
  if (!db) throw new Error('IndexedDB unavailable in this environment');
  return db;
}
