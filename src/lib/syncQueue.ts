'use client';

// Outbox-pattern sync queue for offline-first writes.
//
// Every Zustand action that writes to Supabase routes through
// `enqueue()` instead of calling Supabase directly. enqueue does two
// things in a single Dexie transaction:
//   1. Optimistic write to the local mirror table (so pages reading
//      from cache see the change immediately).
//   2. Append an outbox row recording the pending mutation.
//
// `drainOutbox()` is the worker — it reads outbox rows in
// enqueued_at order and dispatches them via the normal supabase-js
// client (so RLS, auth headers, and Realtime invalidation all keep
// working unchanged). Successful rows are deleted from the outbox.
// Failures stop the drain; the next trigger retries.
//
// Drain triggers are wired up in AuthProvider (post-sign-in) and
// (app)/layout.tsx (online + visibilitychange events).
//
// This file is the single integration seam — store actions only know
// about `enqueue()`. They do not import Dexie or Supabase write
// methods directly.

import { create } from 'zustand';
import { supabase } from './supabase';
import {
  getDB,
  requireDB,
  type OutboxOp,
  type OutboxRow,
  type OutboxTable,
} from './db';
import { isOnline } from './networkStatus';

// ── UI-facing reactive state ─────────────────────────────────────
// Shows pending sync count + drain state so a future "Pending sync: 3"
// pill can read it. Phase 1 doesn't render this anywhere; we still
// keep the store so wiring it later is a one-line render.
interface SyncQueueState {
  pendingCount: number;
  state: 'idle' | 'draining' | 'error';
  lastError: string | null;
}
export const useSyncQueueStore = create<SyncQueueState>(() => ({
  pendingCount: 0,
  state: 'idle',
  lastError: null,
}));

async function refreshPendingCount(): Promise<void> {
  const db = getDB();
  if (!db) return;
  const count = await db.outbox.count();
  useSyncQueueStore.setState({ pendingCount: count });
}

// ── Public API ───────────────────────────────────────────────────

/** Atomic optimistic write + outbox enqueue. The cache write happens
 *  in the same Dexie transaction as the outbox append so the two
 *  cannot diverge. Fire-and-forget triggers a drain attempt at the
 *  end — if offline, the drainer aborts after the first network
 *  failure and the row sits in the outbox until the next trigger. */
export async function enqueue(args: {
  op: OutboxOp;
  table: OutboxTable;
  row_id: string;
  /** Insert: full row. Update: patch only. Delete: null. */
  payload: unknown;
  /** Optional explicit row to write to the local cache table. Defaults
   *  to merging `payload` over any existing cached row (for updates)
   *  or using `payload` directly (for inserts). For deletes, the
   *  cache row is removed regardless of this field. */
  cacheRow?: unknown;
}): Promise<void> {
  const db = requireDB();
  const client_op_id = crypto.randomUUID();
  const enqueued_at = new Date().toISOString();

  await db.transaction(
    'rw',
    [db.tasks, db.lists, db.grocery_items, db.grocery_groups, db.journal_entries, db.outbox],
    async () => {
      // 1. Mirror the change in the local cache.
      const cacheTable = tableFor(db, args.table);
      if (args.op === 'delete') {
        await cacheTable.delete(args.row_id);
      } else if (args.op === 'insert') {
        const row = (args.cacheRow ?? args.payload) as Record<string, unknown>;
        await cacheTable.put(row as never);
      } else {
        // update — merge patch over any existing cached row.
        const existing = (await cacheTable.get(args.row_id)) ?? {};
        const merged = {
          ...(existing as Record<string, unknown>),
          ...(args.cacheRow ?? args.payload) as Record<string, unknown>,
          id: args.row_id,
        };
        await cacheTable.put(merged as never);
      }

      // 2. Append the outbox row.
      const row: OutboxRow = {
        client_op_id,
        op: args.op,
        table: args.table,
        row_id: args.row_id,
        payload: args.payload,
        enqueued_at,
        attempts: 0,
      };
      await db.outbox.add(row);
    },
  );

  await refreshPendingCount();

  // Fire-and-forget drain. If offline, the first dispatch fails and
  // we abort cleanly; the row stays put for the next trigger.
  void drainOutbox();
}

// In-module flag to coalesce concurrent drain calls. Multiple triggers
// (online + visibilitychange + post-sign-in) often fire in quick
// succession; we don't need parallel drains.
let draining = false;

/** Drain pending outbox rows in order. Idempotent. Safe to call from
 *  anywhere. Aborts on first dispatch failure (network/auth) and
 *  leaves remaining rows for the next trigger. */
export async function drainOutbox(): Promise<void> {
  if (draining) return;
  const db = getDB();
  if (!db) return;
  if (!isOnline()) return;

  draining = true;
  useSyncQueueStore.setState({ state: 'draining', lastError: null });

  try {
    // Process one row at a time so we respect mutation ordering
    // (an insert must commit before its subsequent update can apply).
    while (true) {
      const next = await db.outbox.orderBy('enqueued_at').first();
      if (!next) break;

      try {
        await dispatchOne(next);
        await db.outbox.delete(next.id!);
        await refreshPendingCount();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db.outbox.update(next.id!, {
          attempts: next.attempts + 1,
          last_error: msg,
        });
        useSyncQueueStore.setState({ state: 'error', lastError: msg });
        return; // abort drain; next trigger will retry
      }
    }

    useSyncQueueStore.setState({ state: 'idle', lastError: null });
  } finally {
    draining = false;
  }
}

// ── Internals ────────────────────────────────────────────────────

function tableFor(db: ReturnType<typeof requireDB>, table: OutboxTable) {
  switch (table) {
    case 'tasks': return db.tasks;
    case 'lists': return db.lists;
    case 'grocery_items': return db.grocery_items;
    case 'grocery_groups': return db.grocery_groups;
    case 'journal_entries': return db.journal_entries;
  }
}

async function dispatchOne(row: OutboxRow): Promise<void> {
  const tbl = supabase.from(row.table);

  if (row.op === 'insert') {
    const { error } = await tbl.insert(row.payload as Record<string, unknown>);
    // 23505 = duplicate key. Means a previous drain succeeded but we
    // crashed before deleting the outbox row. Treat as success.
    if (error && (error as { code?: string }).code !== '23505') throw error;
    return;
  }

  if (row.op === 'update') {
    const { error } = await tbl
      .update(row.payload as Record<string, unknown>)
      .eq('id', row.row_id);
    if (error) throw error;
    return;
  }

  if (row.op === 'delete') {
    const { error } = await tbl.delete().eq('id', row.row_id);
    if (error) throw error;
    return;
  }
}
