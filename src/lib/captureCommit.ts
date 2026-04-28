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
import { useGroceryStore } from '@/stores/groceryStore';
import { useListStore, type ListRecord } from '@/stores/listStore';
import { useTaskStore } from '@/stores/taskStore';

export interface CommitCaptureOptions {
  selectedDate: string;        // YYYY-MM-DD — fallback for "today" routing + groceries
  lists: ListRecord[];          // current lists for new-list dedup
  log?: (msg: string) => void;  // optional trace
}

export interface CommitCaptureResult {
  todayCount: number;     // tasks written with due_date = selectedDate
  taskCount: number;      // tasks written with an explicit list (project)
  groceryCount: number;   // grocery items added
  newListsCreated: string[];  // names of lists auto-created from "+ New list…" picks
}

/**
 * Route a reviewed capture's priorities + groceries to the right stores.
 *
 * Every priority becomes a row in the `tasks` table — there is no longer
 * a "loose priority" path that bypasses Lists. Routing decisions just
 * pick the list_id + due_date:
 *
 * - destination='today' → list_id = Inbox, due_date = selectedDate.
 *   Shows on /today AND in /lists → Inbox so unassigned items are
 *   discoverable in the project view.
 * - destination='upcoming' → list_id = Inbox, due_date = explicit
 *   AI-extracted date (falls back to selectedDate if absent).
 * - destination='list' → list_id = chosen list, due_date = explicit
 *   or selectedDate fallback.
 * - destination='new-list' → first createList(newName), then route as
 *   above. New lists are deduped by name within the same commit so two
 *   items routed to "+ New: Trip" share one list.
 * - Groceries → groceryStore.addGroupsFromCapture (shared, real-time).
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

  // Make sure the user has an Inbox before any 'today' / 'upcoming'
  // route resolves — these default to Inbox so they're visible in
  // /lists. ensureInbox is idempotent.
  const inboxId = await useListStore.getState().ensureInbox();

  // ── 1. Bucket priorities by destination ─────────────────────────────
  const taskItems: Array<{
    text: string;
    list_id: string | null;
    due_date: string | null;
    time: string | null;
    remind_at: string | null;
    reminder_message: string | null;
    category: string | null;
    subgroup: string | null;
    routedToToday: boolean; // for the result counter
  }> = [];
  // Map from "+ New: <name>" lower-cased name → list_id once created, so
  // duplicate routes within one commit reuse the same list.
  const newListCache = new Map<string, string>();

  for (let i = 0; i < edited.priorities.length; i++) {
    const task = edited.priorities[i];
    const dest = destinations[i] ?? { kind: 'today' };

    const remindIso = resolveRemindAt(
      task.remind_at_iso ?? null,
      task.reminder_phrase ?? null,
    );

    if (dest.kind === 'today') {
      // Loose priority on the selected day — lands in Inbox so it's
      // discoverable in /lists. Auto-categorization (home/work/etc.)
      // rides on the row as a chip.
      taskItems.push({
        text: task.text,
        list_id: inboxId,
        due_date: opts.selectedDate,
        time: task.time ?? null,
        remind_at: remindIso,
        reminder_message: null,
        category: task.category ?? null,
        subgroup: task.subgroup ?? null,
        routedToToday: true,
      });
      continue;
    }

    if (dest.kind === 'upcoming') {
      // Dated event with no project home — Inbox + explicit date.
      const due = task.due_date ?? resolveWhen(task.when, opts.selectedDate);
      taskItems.push({
        text: task.text,
        list_id: inboxId,
        due_date: due,
        time: task.time ?? null,
        remind_at: remindIso,
        reminder_message: null,
        category: task.category ?? null,
        subgroup: task.subgroup ?? null,
        routedToToday: false,
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
            // Failed to create — fall back to Inbox so the item isn't
            // silently lost.
            log(`Failed to create list "${dest.newName}", falling back to Inbox`);
            listId = inboxId;
          }
        }
      }
    }

    if (!listId) continue;

    const due = task.due_date ?? resolveWhen(task.when, opts.selectedDate);
    taskItems.push({
      text: task.text,
      list_id: listId,
      due_date: due,
      time: task.time ?? null,
      remind_at: remindIso,
      reminder_message: null,
      category: task.category ?? null,
      subgroup: task.subgroup ?? null,
      routedToToday: false,
    });
  }

  // ── 2. Write all tasks ──────────────────────────────────────────────
  for (const t of taskItems) {
    try {
      const created = await useTaskStore.getState().addTask({
        text: t.text,
        list_id: t.list_id,
        due_date: t.due_date,
        time: t.time,
        remind_at: t.remind_at,
        reminder_message: t.reminder_message,
        category: t.category,
        subgroup: t.subgroup,
      });
      if (created) {
        if (t.routedToToday) result.todayCount += 1;
        else result.taskCount += 1;
      }
    } catch (err) {
      log(`Task add failed: ${(err as Error).message}`);
    }
  }
  if (taskItems.length > 0) {
    log(
      `Added ${result.todayCount} to Today (Inbox), ${result.taskCount} to other lists`,
    );
  }

  // ── 4. Groceries — routed to the shared, real-time groceryStore ─────
  // The active list is owned by groceryStore (loaded on grocery-tab
  // mount). Voice/text capture from any surface lands in that same
  // list, so a co-shopper sees the items immediately.
  if (edited.groceries.length > 0) {
    try {
      // Make sure we have an active list before writing — covers the
      // case where capture fires before /groceries was ever opened.
      if (!useGroceryStore.getState().listId) {
        await useGroceryStore.getState().loadActive();
      }
      await useGroceryStore.getState().addGroupsFromCapture(
        edited.groceries.map((g) => ({
          store: g.store || 'General',
          items: g.items,
        })),
      );
      result.groceryCount = edited.groceries.reduce((s, g) => s + g.items.length, 0);
      log(`Added ${result.groceryCount} grocery item(s)`);
    } catch (err) {
      log(`Groceries failed: ${(err as Error).message}`);
    }
  }

  return result;
}
