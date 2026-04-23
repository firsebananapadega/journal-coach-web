// Shared "commit a reviewed capture" helper. Used by every page that
// shows a CapturePreviewSheet (/voice, /priorities, /journal,
// /groceries) so the routing logic lives in one place.
//
// Scope: this helper handles priorities (routed by per-item destination)
// and groceries. It does NOT handle intentions, habits, ideas, gratitude,
// journal, or completions — those touch domain-specific stores and stay
// in the caller's existing commit logic. Callers can call this AND their
// own follow-up logic in any order.

import { resolveWhen, type CaptureResult } from './captureEngine';
import { resolveRemindAt } from './reminderParse';
import type { PriorityDestinations } from '@/components/CapturePreviewSheet';
import {
  usePriorityStore,
  type GroceryGroup,
  type PriorityItem,
} from '@/stores/priorityStore';
import { useListStore, type ListRecord } from '@/stores/listStore';
import { useTaskStore } from '@/stores/taskStore';

export interface CommitCaptureOptions {
  selectedDate: string;        // YYYY-MM-DD — fallback for "today" routing + groceries
  lists: ListRecord[];          // current lists for new-list dedup
  log?: (msg: string) => void;  // optional trace
}

export interface CommitCaptureResult {
  todayCount: number;     // priorities written to legacy daily_priorities.items
  taskCount: number;      // tasks written to the new tasks table
  groceryCount: number;   // grocery items added
  newListsCreated: string[];  // names of lists auto-created from "+ New list…" picks
}

/**
 * Route a reviewed capture's priorities + groceries to the right stores.
 *
 * - Priorities with destination='today' → priorityStore.addItems (legacy
 *   per-day daily_priorities.items column).
 * - Priorities with destination='list' → tasks table via taskStore.addTask
 *   with list_id, due_date (if set), time (if set).
 * - Priorities with destination='new-list' → first createList(newName),
 *   then addTask to that list. New lists are deduped by name within the
 *   same commit so two items routed to "+ New: Trip" share one list.
 * - Groceries → priorityStore.addGroceryGroups (existing behavior).
 *
 * Caller handles intentions/habits/ideas/gratitude/journal/completions.
 */
export async function commitCapture(
  edited: CaptureResult,
  destinations: PriorityDestinations,
  opts: CommitCaptureOptions,
): Promise<CommitCaptureResult> {
  const log = opts.log ?? (() => {});
  const result: CommitCaptureResult = {
    todayCount: 0,
    taskCount: 0,
    groceryCount: 0,
    newListsCreated: [],
  };

  // ── 1. Bucket priorities by destination ─────────────────────────────
  const todayItems: PriorityItem[] = [];
  const taskItems: Array<{
    text: string;
    list_id: string | null; // null = lives in Upcoming, not in any list
    due_date: string | null;
    time: string | null;
    remind_at: string | null;
    reminder_message: string | null;
  }> = [];
  // Map from "+ New: <name>" lower-cased name → list_id once created, so
  // duplicate routes within one commit reuse the same list.
  const newListCache = new Map<string, string>();

  for (let i = 0; i < edited.priorities.length; i++) {
    const task = edited.priorities[i];
    const dest = destinations[i] ?? { kind: 'today' };

    if (dest.kind === 'today') {
      todayItems.push({
        id: crypto.randomUUID(),
        text: task.text,
        completed: false,
        sort_order: 0, // re-numbered downstream by addItems
        category: task.category,
        subgroup: task.subgroup ?? null,
        urgent: false,
        important: false,
      });
      continue;
    }

    if (dest.kind === 'upcoming') {
      // Dated event with no project home — list_id null + due_date set.
      // Surfaces only in the Upcoming tab (filter: due_date IS NOT NULL).
      // If the AI didn't supply a date, fall back to today so the row
      // isn't orphaned (Upcoming Week view will still show it).
      const due =
        task.due_date ?? resolveWhen(task.when, opts.selectedDate);
      const remindIso = resolveRemindAt(
        task.remind_at_iso ?? null,
        task.reminder_phrase ?? null,
      );
      taskItems.push({
        text: task.text,
        list_id: null,
        due_date: due,
        time: task.time ?? null,
        remind_at: remindIso,
        reminder_message: null,
      });
      continue;
    }

    let listId: string | null = null;

    if (dest.kind === 'list') {
      listId = dest.listId;
    } else if (dest.kind === 'new-list') {
      const key = dest.newName.toLowerCase();
      if (newListCache.has(key)) {
        listId = newListCache.get(key)!;
      } else {
        // Reuse an existing list if one already exists with that name
        // (case-insensitive) — the partial unique index would reject a
        // duplicate insert anyway, but skipping the round-trip is faster.
        const existing = opts.lists.find(
          (l) => l.name.toLowerCase() === key,
        );
        if (existing) {
          listId = existing.id;
          newListCache.set(key, existing.id);
        } else {
          const created = await useListStore.getState().createList(dest.newName);
          if (created) {
            listId = created.id;
            newListCache.set(key, created.id);
            result.newListsCreated.push(created.name);
            log(`Created list "${created.name}"`);
          } else {
            // Failed to create — fall back to Today so the item isn't
            // silently lost.
            log(`Failed to create list "${dest.newName}", falling back to Today`);
            todayItems.push({
              id: crypto.randomUUID(),
              text: task.text,
              completed: false,
              sort_order: 0,
              category: task.category,
              subgroup: task.subgroup ?? null,
              urgent: false,
              important: false,
            });
            continue;
          }
        }
      }
    }

    if (!listId) continue;

    // due_date precedence: explicit due_date > resolveWhen(when).
    // For tasks routed to a list, we always want a date if there's any
    // hint; resolveWhen returns today as fallback which is fine.
    const due = task.due_date ?? resolveWhen(task.when, opts.selectedDate);
    const remindIso = resolveRemindAt(
      task.remind_at_iso ?? null,
      task.reminder_phrase ?? null,
    );
    taskItems.push({
      text: task.text,
      list_id: listId,
      due_date: due,
      time: task.time ?? null,
      remind_at: remindIso,
      reminder_message: null,
    });
  }

  // ── 2. Write Today items in one batched addItems per date ────────────
  if (todayItems.length > 0) {
    try {
      await usePriorityStore
        .getState()
        .addItems(opts.selectedDate, todayItems);
      result.todayCount = todayItems.length;
      log(`Added ${todayItems.length} task(s) to Today`);
    } catch (err) {
      log(`Today addItems failed: ${(err as Error).message}`);
    }
  }

  // ── 3. Write tasks to the new tasks table ────────────────────────────
  for (const t of taskItems) {
    try {
      const created = await useTaskStore.getState().addTask(t);
      if (created) result.taskCount += 1;
    } catch (err) {
      log(`Task add failed: ${(err as Error).message}`);
    }
  }
  if (taskItems.length > 0) {
    log(`Added ${result.taskCount}/${taskItems.length} task(s) to lists`);
  }

  // ── 4. Groceries — unchanged path ────────────────────────────────────
  if (edited.groceries.length > 0) {
    const newGroups: GroceryGroup[] = edited.groceries.map((g) => ({
      id: crypto.randomUUID(),
      store: g.store || 'General',
      items: g.items.map((name) => ({
        id: crypto.randomUUID(),
        name,
        completed: false,
      })),
    }));
    try {
      await usePriorityStore
        .getState()
        .addGroceryGroups(opts.selectedDate, newGroups);
      result.groceryCount = newGroups.reduce((s, g) => s + g.items.length, 0);
      log(`Added ${result.groceryCount} grocery item(s)`);
    } catch (err) {
      log(`Groceries failed: ${(err as Error).message}`);
    }
  }

  return result;
}
