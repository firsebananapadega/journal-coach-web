'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  CaptureResult,
  CompletionIntent,
  PriorityTask,
  Destination,
} from '@/lib/captureEngine';
import { resolveDestination } from '@/lib/captureEngine';
import {
  PRIORITY_CATEGORY_ORDER,
  type PriorityCategory,
  type PriorityItem,
} from '@/stores/priorityStore';

// Groceries used to live inside priorityStore as a JSONB blob with
// embedded items. The new groceryStore uses flat rows keyed by group_id
// for realtime sync. CapturePreviewSheet still needs the nested shape
// for fuzzy matching of completion intents ("I bought milk"), so each
// caller adapts the flat store state into the shape defined here.
export interface GroceryItem {
  id: string;
  name: string;
  completed: boolean;
  // Optional ISO timestamp of the last check-off. Required for the
  // pantry-sync "uncheck if not mentioned" 14-day scope guard so old
  // long-since-checked items don't get false-unchecked. Callers that
  // don't surface this field (legacy paths) skip the uncheck branch
  // entirely — safe default.
  completed_at?: string | null;
  // Per-item perishable override, optional. When undefined or null,
  // the have-flow filter falls back to the auto-classify dictionary
  // (src/lib/groceryClassify.ts). Only items whose effective state
  // resolves to `true` are eligible for the auto-uncheck bucket.
  perishable?: boolean | null;
}
export interface GroceryGroup {
  id: string;
  store: string;
  items: GroceryItem[];
}

// ── Pantry-sync resolution ────────────────────────────────────
// The shape returned to onConfirm describing the user's per-row
// decisions on the have-flow. The commit handler in voice/page.tsx
// applies these as: markItemDone(checkIds), markItemUndone(uncheckIds),
// addCompletedItems(UNCATEGORIZED, addToUncategorized). Empty arrays
// for any bucket = nothing to do.
export interface HaveSyncResolution {
  checkIds: string[];
  uncheckIds: string[];
  // Names to add to Uncategorized as CHECKED (in-pantry add).
  addToUncategorized: string[];
  // NEW (running-low path): item IDs to flip from checked → unchecked
  // because the user signaled they're running out.
  lowStockUncheckIds: string[];
  // NEW (running-low path): names to add to Uncategorized as UNCHECKED
  // (= "still need to buy" — distinct from addToUncategorized which is
  // "I have it, just no store assigned yet").
  lowStockAddNames: string[];
}
import type { ListRecord } from '@/stores/listStore';
import { useNotebookStore } from '@/stores/notebookStore';
import NotebookPickerChip from '@/components/notebooks/NotebookPickerChip';
import TaskReminderChip from '@/components/tasks/TaskReminderChip';
import { bestMatch } from '@/lib/fuzzyMatch';
import { effectivePerishable } from '@/lib/groceryClassify';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';

// A completion paired with the item it's likely about. `target` is null
// when the fuzzy matcher couldn't find anything plausible — we keep the
// row in the preview so the user knows we heard them but it'll be a no-op.
export interface CompletionMatch {
  intent: CompletionIntent;
  target:
    | { kind: 'priority'; item: PriorityItem }
    | { kind: 'grocery'; group: GroceryGroup; item: GroceryItem }
    | null;
}

// Per-priority destination override resolved at preview time. Index-
// aligned with edited.priorities. Lives in the sheet (UI concern), not
// in CaptureResult (AI's structured output).
export type PriorityDestinations = Destination[];

interface Props {
  open: boolean;
  result: CaptureResult | null;
  // Current state of the user's lists, used for completion fuzzy matching.
  existingPriorities: PriorityItem[];
  existingGroceries: GroceryGroup[];
  // User's project lists. Drives the destination dropdown + the default
  // routing (resolveDestination matches list_hint against this set).
  lists: ListRecord[];
  onConfirm: (
    edited: CaptureResult,
    completionMatches: CompletionMatch[],
    destinations: PriorityDestinations,
    haveSync?: HaveSyncResolution,
  ) => Promise<void>;
  onCancel: () => void;
  busy?: boolean;
  // Set by the caller when the preview is showing a regex-only
  // fallback (Gemini threw or returned empty). Triggers a banner at
  // the top of the sheet so the user knows the AI step didn't
  // succeed, and exposes a Retry button via onRetryClassify.
  fellBack?: boolean;
  classifyError?: string | null;
  onRetryClassify?: () => void | Promise<void>;
}

const CATEGORY_LABEL_KEY: Record<PriorityCategory, string> = {
  medications: 'category.medications',
  errands: 'category.errands',
  work: 'category.work',
  home: 'category.home',
  bills: 'category.bills',
  other: 'category.other',
};

function CategoryChip({
  value,
  onChange,
}: {
  value: PriorityCategory;
  onChange: (next: PriorityCategory) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary hover:bg-primary/25"
      >
        {t(CATEGORY_LABEL_KEY[value])} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-full mt-1 left-0 bg-surface-elevated border border-border rounded-lg shadow-warm-md py-1 min-w-[140px]">
            {PRIORITY_CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs ${
                  c === value ? 'text-primary font-semibold' : 'text-text-secondary hover:bg-surface'
                }`}
              >
                {t(CATEGORY_LABEL_KEY[c])}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function destinationLabel(dest: Destination, lists: ListRecord[]): string {
  if (dest.kind === 'today') return 'Today';
  if (dest.kind === 'upcoming') return 'Upcoming';
  if (dest.kind === 'new-list') return `+ New: ${dest.newName}`;
  const list = lists.find((l) => l.id === dest.listId);
  if (!list) return 'List';
  return list.is_inbox ? 'Inbox' : list.name;
}

function destinationChipStyle(dest: Destination): string {
  if (dest.kind === 'today') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
  if (dest.kind === 'upcoming')
    return 'bg-purple-500/15 text-purple-700 dark:text-purple-400';
  if (dest.kind === 'new-list') return 'bg-success/15 text-success';
  return 'bg-blue-500/15 text-blue-700 dark:text-blue-400';
}

function DestinationChip({
  value,
  lists,
  onChange,
}: {
  value: Destination;
  lists: ListRecord[];
  onChange: (next: Destination) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');

  const inbox = lists.find((l) => l.is_inbox);
  const userLists = lists.filter((l) => !l.is_inbox);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full hover:opacity-80 ${destinationChipStyle(value)}`}
      >
        {destinationLabel(value, lists)} ▾
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpen(false);
              setCreatingNew(false);
              setNewName('');
            }}
          />
          <div className="absolute z-50 top-full mt-1 left-0 bg-surface-elevated border border-border rounded-lg shadow-warm-md py-1 min-w-[180px] max-h-[260px] overflow-y-auto">
            <button
              onClick={() => {
                onChange({ kind: 'today' });
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs ${
                value.kind === 'today'
                  ? 'text-primary font-semibold'
                  : 'text-text-secondary hover:bg-surface'
              }`}
            >
              📅 Today
            </button>
            <button
              onClick={() => {
                onChange({ kind: 'upcoming' });
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs ${
                value.kind === 'upcoming'
                  ? 'text-primary font-semibold'
                  : 'text-text-secondary hover:bg-surface'
              }`}
            >
              🗓 Upcoming
            </button>
            {inbox && (
              <button
                onClick={() => {
                  onChange({ kind: 'list', listId: inbox.id });
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs ${
                  value.kind === 'list' && value.listId === inbox.id
                    ? 'text-primary font-semibold'
                    : 'text-text-secondary hover:bg-surface'
                }`}
              >
                📥 Inbox
              </button>
            )}
            {userLists.length > 0 && (
              <div className="h-px bg-border my-1" />
            )}
            {userLists.map((l) => (
              <button
                key={l.id}
                onClick={() => {
                  onChange({ kind: 'list', listId: l.id });
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs ${
                  value.kind === 'list' && value.listId === l.id
                    ? 'text-primary font-semibold'
                    : 'text-text-secondary hover:bg-surface'
                }`}
              >
                {l.icon ?? '📁'} {l.name}
              </button>
            ))}
            <div className="h-px bg-border my-1" />
            {creatingNew ? (
              <div className="px-2 py-1.5 flex gap-1">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newName.trim()) {
                      onChange({ kind: 'new-list', newName: newName.trim() });
                      setOpen(false);
                      setCreatingNew(false);
                      setNewName('');
                    }
                  }}
                  placeholder="New list name"
                  autoFocus
                  className="flex-1 px-2 py-1 bg-bg border border-border rounded text-xs text-text-primary outline-none"
                />
                <button
                  onClick={() => {
                    if (!newName.trim()) return;
                    onChange({ kind: 'new-list', newName: newName.trim() });
                    setOpen(false);
                    setCreatingNew(false);
                    setNewName('');
                  }}
                  className="px-2 py-1 bg-primary text-white text-xs font-semibold rounded"
                >
                  +
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreatingNew(true)}
                className="w-full text-left px-3 py-1.5 text-xs text-primary font-medium hover:bg-surface"
              >
                + New list…
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DateChip({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (next: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const display = value
    ? new Date(value + 'T00:00:00').toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : null;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full hover:opacity-80 ${
          value ? 'bg-primary/15 text-primary' : 'bg-surface-elevated text-text-tertiary'
        }`}
      >
        {value ? display : '+ Date'} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-full mt-1 left-0 bg-surface-elevated border border-border rounded-lg shadow-warm-md p-2 flex flex-col gap-1">
            <input
              type="date"
              value={value ?? ''}
              onChange={(e) => onChange(e.target.value || null)}
              className="text-xs px-2 py-1 bg-bg border border-border rounded text-text-primary outline-none"
            />
            {value && (
              <button
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="text-[10px] text-text-tertiary hover:text-error px-2 py-1"
              >
                Clear date
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const TIME_PRESETS = ['morning', 'afternoon', 'evening', 'night'] as const;

function TimeChip({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (next: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const isPreset = !!value && (TIME_PRESETS as readonly string[]).includes(value);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full hover:opacity-80 ${
          value ? 'bg-primary/15 text-primary' : 'bg-surface-elevated text-text-tertiary'
        }`}
      >
        {value ? value : '+ Time'} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-full mt-1 left-0 bg-surface-elevated border border-border rounded-lg shadow-warm-md p-2 flex flex-col gap-1 min-w-[140px]">
            {TIME_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                }}
                className={`text-left px-2 py-1 text-xs rounded ${
                  value === p ? 'bg-primary/10 text-primary font-semibold' : 'text-text-secondary hover:bg-surface'
                }`}
              >
                {p}
              </button>
            ))}
            <div className="h-px bg-border my-1" />
            <input
              type="time"
              value={isPreset ? '' : value ?? ''}
              onChange={(e) => onChange(e.target.value || null)}
              className="text-xs px-2 py-1 bg-bg border border-border rounded text-text-primary outline-none"
            />
            {value && (
              <button
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="text-[10px] text-text-tertiary hover:text-error px-2 py-1"
              >
                Clear time
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Notebook picker chip — shows the capture classifier's detected
// notebook with a dropdown of all user notebooks. Used at the top of
// the preview so the user can confirm or redirect before saving.
// NotebookPicker moved to src/components/notebooks/NotebookPickerChip.tsx
// so it can be reused by the /journal SaveEntrySheet.

// ReminderChip + formatLabel have been lifted to
// src/components/tasks/TaskReminderChip.tsx so TaskCard +
// TaskEditSheet can share the exact same picker/popover. Import
// path: `import TaskReminderChip from '@/components/tasks/TaskReminderChip';`.

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
      <span className="text-[11px] text-text-tertiary">{count}</span>
    </div>
  );
}

function EditableRow({
  text,
  onChange,
  onDelete,
  prefix,
  hint,
  size = 'sm',
}: {
  text: string;
  onChange: (next: string) => void;
  onDelete: () => void;
  prefix?: React.ReactNode;
  hint?: string;
  // 'sm' (14px) is the default for ideas/habits/gratitude/etc.
  // 'md' (16px) is used by the groceries section so the items are
  // readable at a glance — the user explicitly asked for bigger text
  // in the grocery preview specifically.
  size?: 'sm' | 'md';
}) {
  const textClass = size === 'md' ? 'text-[16px]' : 'text-[14px]';
  return (
    <div className="flex items-start gap-2 py-1.5">
      {prefix}
      <div className="flex-1 min-w-0">
        <input
          value={text}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full bg-transparent ${textClass} text-text-primary outline-none border-b border-transparent focus:border-primary py-0.5`}
        />
        {hint && <p className="text-[11px] text-text-tertiary mt-0.5">{hint}</p>}
      </div>
      <button
        onClick={onDelete}
        className="text-text-tertiary hover:text-error px-1 py-0.5 text-sm"
        aria-label="Remove"
      >
        ×
      </button>
    </div>
  );
}

// Inline "+ add item" input used in the groceries section so the user
// can top up items they forgot to say. Stays collapsed until tapped to
// avoid visual clutter; commits on Enter or blur. Empty blur cancels.
function AddItemInline({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const commit = () => {
    const trimmed = value.trim();
    if (trimmed) onAdd(trimmed);
    setValue('');
    setOpen(false);
  };
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 py-2 px-1 text-[13px] text-text-tertiary hover:text-text-secondary"
      >
        <span className="text-base leading-none">+</span>
        <span>{placeholder}</span>
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="text-text-tertiary text-base leading-none">+</span>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            setValue('');
            setOpen(false);
          }
        }}
        onBlur={commit}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-[16px] text-text-primary outline-none border-b border-primary py-0.5"
      />
    </div>
  );
}

// Collapsible per-item destination summary. Lets the user verify
// where each captured item will land BEFORE tapping Save. Tasks show
// their resolved destination (Today / Upcoming / List / New list);
// groceries show their store name; intentions / habits / ideas /
// gratitude / journal show their fixed destination. Keeps the sheet
// honest — if the classifier ever misroutes again, the user will see
// it here and re-route before committing.
function RoutingSummary({
  edited,
  destinations,
  lists,
}: {
  edited: CaptureResult;
  destinations: PriorityDestinations;
  lists: ListRecord[];
}) {
  const [open, setOpen] = useState(false);
  const rows: Array<{ label: string; dest: string }> = [];
  edited.priorities.forEach((p, i) => {
    const dest = destinations[i] ?? { kind: 'today' };
    rows.push({ label: p.text || '(untitled task)', dest: destinationLabel(dest, lists) });
  });
  edited.groceries.forEach((g) => {
    g.items.forEach((item) => {
      rows.push({ label: item, dest: `Groceries · ${g.store || 'General'}` });
    });
  });
  edited.intentions.forEach((i) => rows.push({ label: i, dest: 'Intentions' }));
  edited.habits.forEach((h) => rows.push({ label: h, dest: 'Habits' }));
  edited.ideas.forEach((i) => rows.push({ label: i, dest: 'Ideas' }));
  edited.gratitude.forEach((g) => rows.push({ label: g, dest: 'Gratitude' }));
  if (edited.journal) {
    rows.push({
      label: edited.journal.slice(0, 80) + (edited.journal.length > 80 ? '…' : ''),
      dest: 'Journal entry',
    });
  }
  if (rows.length === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-surface/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="text-[11px] uppercase tracking-wider font-semibold text-text-secondary">
          {t('preview.routingSummary')} · {rows.length}
        </span>
        <span className="text-text-tertiary text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 text-[12px]">
              <span className="text-text-primary truncate flex-1 min-w-0">{r.label}</span>
              <span className="text-text-tertiary flex-shrink-0">→ {r.dest}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Pantry-sync bucket types (in-component only) ────────────
// Each "I have …" phrase resolves to one of three buckets:
//   - check: matched against an existing UNCHECKED grocery item
//             that we'd flip to checked.
//   - add: didn't match any existing item; will land in
//             Uncategorized as pre-checked.
// Plus a separate uncheck bucket: items currently CHECKED that
// the user did NOT mention this round (and were checked off
// recently — see HAVE_UNCHECK_WINDOW_MS for the scope guard).
interface HaveCheckMatch {
  phrase: string;
  itemId: string;
  itemName: string;
  store: string;
  qty_count: number | null;
}
interface HaveUncheckMatch {
  itemId: string;
  itemName: string;
  store: string;
}
interface HaveLowStockMatch {
  // What to render in the row.
  displayName: string;
  qty_count: number | null;
  store: string | null;
  // The two action arrays the apply layer needs:
  //   matched + currently checked → uncheckId
  //   no match → addAsUnchecked = phrase
  // Exactly one is set per row.
  uncheckItemId?: string;
  addAsUnchecked?: string;
}
interface HaveAddMatch {
  phrase: string;
  qty_count: number | null;
}
const HAVE_UNCHECK_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** Format an integer count for inline display next to an item name.
 *  Locale-aware via t(); EN: "3 left" / ES: "3 restantes" with a
 *  singular form for count === 1. The translation key is single-form,
 *  so we branch in JS for the singular vs. plural inflection. */
function formatQtyLeft(count: number): string {
  // Inlined to avoid a third t() call site for plural inflection.
  // Spanish "restante" (sing) vs "restantes" (pl) is the only case.
  // English uses "left" for both.
  if (typeof window === 'undefined') return `${count} left`;
  // Best-effort locale detection — checks <html lang>. Stays in sync
  // with the rest of the app's t() infrastructure.
  const lang = (document?.documentElement?.lang ?? 'en').toLowerCase();
  if (lang.startsWith('es')) {
    return count === 1 ? `${count} restante` : `${count} restantes`;
  }
  return `${count} left`;
}

interface HaveItemInput {
  name: string;
  qty_hint?: 'low' | 'sufficient' | 'plenty' | null;
  qty_count?: number | null;
}

function computeHaveBuckets(
  haveItems: HaveItemInput[],
  groceries: GroceryGroup[],
): {
  check: HaveCheckMatch[];
  uncheck: HaveUncheckMatch[];
  add: HaveAddMatch[];
  lowStock: HaveLowStockMatch[];
} {
  const allPairs = groceries.flatMap((g) =>
    g.items.map((it) => ({ group: g, item: it })),
  );
  const matchedItemIds = new Set<string>();
  const check: HaveCheckMatch[] = [];
  const add: HaveAddMatch[] = [];
  const lowStock: HaveLowStockMatch[] = [];

  for (const entry of haveItems) {
    const phrase = entry.name;
    const isLow = entry.qty_hint === 'low';
    const qty = entry.qty_count ?? null;

    const m = bestMatch(phrase, allPairs.map((p) => p.item));
    if (m) {
      const pair = allPairs.find((p) => p.item.id === m.item.id);
      if (pair) {
        matchedItemIds.add(pair.item.id);
        if (isLow) {
          // User said they're running low on this. If currently
          // checked, flip back to unchecked (signals "out of stock").
          // If unchecked, no action needed — already on shopping list.
          // Either way, surface in the lowStock bucket so the user
          // sees the deliberate "kept on list" decision.
          lowStock.push({
            displayName: pair.item.name,
            qty_count: qty,
            store: pair.group.store,
            uncheckItemId: pair.item.completed ? pair.item.id : undefined,
          });
        } else if (!pair.item.completed) {
          // Standard check-off path. Already-checked items are
          // skipped to keep the preview honest (apply is idempotent
          // either way).
          check.push({
            phrase,
            itemId: pair.item.id,
            itemName: pair.item.name,
            store: pair.group.store,
            qty_count: qty,
          });
        }
        continue;
      }
    }
    // No match against the existing list.
    if (isLow) {
      // Add to Uncategorized as UNCHECKED so it lands on the
      // shopping list (user wants to buy more).
      lowStock.push({
        displayName: phrase,
        qty_count: qty,
        store: null,
        addAsUnchecked: phrase,
      });
    } else {
      // Add to Uncategorized as CHECKED (existing behavior).
      add.push({ phrase, qty_count: qty });
    }
  }

  // Uncheck candidates: currently-checked items the user did NOT
  // mention this round, scoped to:
  //   1. recent check-offs only (last 14 days) — persistent inventory
  //      the user has implicitly trusted shouldn't be touched.
  //   2. perishables only — pantry/household items (paper towels,
  //      shampoo, canned goods) get bought infrequently; a fridge-
  //      enumeration pass shouldn't false-uncheck them. Resolves
  //      via the per-item override → built-in dictionary →
  //      null (treated as non-perishable for filter safety).
  const cutoff = Date.now() - HAVE_UNCHECK_WINDOW_MS;
  const uncheck: HaveUncheckMatch[] = [];
  for (const pair of allPairs) {
    if (!pair.item.completed) continue;
    if (matchedItemIds.has(pair.item.id)) continue;
    const completedAt = pair.item.completed_at;
    if (!completedAt) continue; // missing timestamp → skip (safe default)
    const t = Date.parse(completedAt);
    if (!Number.isFinite(t) || t < cutoff) continue;
    if (effectivePerishable(pair.item) !== true) continue;
    uncheck.push({
      itemId: pair.item.id,
      itemName: pair.item.name,
      store: pair.group.store,
    });
  }

  return { check, uncheck, add, lowStock };
}

function computeMatches(
  completions: CompletionIntent[],
  priorities: PriorityItem[],
  groceries: GroceryGroup[],
): CompletionMatch[] {
  const allGroceryItems = groceries.flatMap((g) =>
    g.items.map((it) => ({ group: g, item: it })),
  );
  return completions.map((intent) => {
    // For "taken" we bias toward priorities (likely a medication item),
    // and for "bought" we bias toward groceries. For "done" / "skip" we
    // try priorities first, then groceries.
    const tryPriorities = () => {
      const m = bestMatch(intent.phrase, priorities);
      return m
        ? ({ kind: 'priority' as const, item: m.item, score: m.score })
        : null;
    };
    const tryGroceries = () => {
      const m = bestMatch(intent.phrase, allGroceryItems.map((p) => p.item));
      if (!m) return null;
      const pair = allGroceryItems.find((p) => p.item.id === m.item.id);
      if (!pair) return null;
      return { kind: 'grocery' as const, group: pair.group, item: pair.item, score: m.score };
    };
    const order =
      intent.type === 'bought'
        ? [tryGroceries, tryPriorities]
        : [tryPriorities, tryGroceries];
    for (const fn of order) {
      const r = fn();
      if (r) {
        if (r.kind === 'priority') {
          return { intent, target: { kind: 'priority', item: r.item } };
        }
        return { intent, target: { kind: 'grocery', group: r.group, item: r.item } };
      }
    }
    return { intent, target: null };
  });
}

export function CapturePreviewSheet({
  open,
  result,
  existingPriorities,
  existingGroceries,
  lists,
  onConfirm,
  onCancel,
  busy = false,
  fellBack = false,
  classifyError = null,
  onRetryClassify,
}: Props) {
  // Local edit state — initialized from `result` each time the sheet opens.
  const [edited, setEdited] = useState<CaptureResult | null>(result);
  const [matches, setMatches] = useState<CompletionMatch[]>([]);
  // Per-priority destination override, index-aligned with edited.priorities.
  const [destinations, setDestinations] = useState<PriorityDestinations>([]);
  // Pantry-sync buckets (the "I have …" voice flow). Initialized when
  // the sheet opens; per-row × toggles remove rows from the bucket.
  // Empty buckets = no pantry-sync section rendered.
  const [haveBuckets, setHaveBuckets] = useState<{
    check: HaveCheckMatch[];
    uncheck: HaveUncheckMatch[];
    add: HaveAddMatch[];
    lowStock: HaveLowStockMatch[];
  }>({ check: [], uncheck: [], add: [], lowStock: [] });

  // Ensure notebooks are loaded so the NotebookPicker can render its
  // options.
  const hasFetchedNotebooks = useNotebookStore((s) => s.hasFetched);
  const fetchNotebooks = useNotebookStore((s) => s.fetchNotebooks);
  useEffect(() => {
    if (open && !hasFetchedNotebooks) {
      fetchNotebooks().catch(() => {});
    }
  }, [open, hasFetchedNotebooks, fetchNotebooks]);

  useEffect(() => {
    if (open && result) {
      const cloned = structuredClone(result);
      setEdited(cloned);
      setDestinations(cloned.priorities.map((p) => resolveDestination(p, lists)));
      setMatches(
        computeMatches(result.completions, existingPriorities, existingGroceries),
      );
      setHaveBuckets(
        result.have_items && result.have_items.length > 0
          ? computeHaveBuckets(result.have_items, existingGroceries)
          : { check: [], uncheck: [], add: [], lowStock: [] },
      );
    }
  }, [open, result, existingPriorities, existingGroceries, lists]);

  const totalChanges = useMemo(() => {
    if (!edited) return 0;
    // Count both matched completions (will check off the existing item)
    // AND unmatched "bought" completions (commitEverything falls these
    // back to a new General grocery so the spoken item lands somewhere).
    const matchedCompletions = matches.filter((m) => m.target !== null).length;
    const unmatchedBoughtFallback = matches.filter(
      (m) => m.target === null && m.intent.type === 'bought',
    ).length;
    return (
      edited.priorities.length +
      edited.plans.length +
      edited.groceries.reduce((s, g) => s + g.items.length, 0) +
      edited.intentions.length +
      edited.habits.length +
      edited.ideas.length +
      edited.gratitude.length +
      (edited.journal ? 1 : 0) +
      matchedCompletions +
      unmatchedBoughtFallback +
      haveBuckets.check.length +
      haveBuckets.uncheck.length +
      haveBuckets.add.length +
      haveBuckets.lowStock.length
    );
  }, [edited, matches, haveBuckets]);

  if (!open || !edited) return null;

  // ── mutators ──
  const updatePriority = (i: number, patch: Partial<PriorityTask>) =>
    setEdited((cur) => {
      if (!cur) return cur;
      const next = [...cur.priorities];
      next[i] = { ...next[i], ...patch };
      return { ...cur, priorities: next };
    });
  const removePriority = (i: number) => {
    setEdited(
      (cur) =>
        cur && { ...cur, priorities: cur.priorities.filter((_, idx) => idx !== i) },
    );
    setDestinations((cur) => cur.filter((_, idx) => idx !== i));
  };
  const updateDestination = (i: number, dest: Destination) =>
    setDestinations((cur) => {
      const next = [...cur];
      next[i] = dest;
      return next;
    });

  const updateGroceryStore = (gi: number, store: string) =>
    setEdited((cur) => {
      if (!cur) return cur;
      const next = [...cur.groceries];
      next[gi] = { ...next[gi], store };
      return { ...cur, groceries: next };
    });
  const updateGroceryItem = (gi: number, ii: number, name: string) =>
    setEdited((cur) => {
      if (!cur) return cur;
      const next = [...cur.groceries];
      const items = [...next[gi].items];
      items[ii] = name;
      next[gi] = { ...next[gi], items };
      return { ...cur, groceries: next };
    });
  const removeGroceryItem = (gi: number, ii: number) =>
    setEdited((cur) => {
      if (!cur) return cur;
      const next = [...cur.groceries];
      next[gi] = { ...next[gi], items: next[gi].items.filter((_, idx) => idx !== ii) };
      return { ...cur, groceries: next.filter((g) => g.items.length > 0) };
    });
  // Per-store manual add — used by the inline "+ add item" input under
  // each grocery group so users can top up items they forgot to say.
  // De-dupes case-insensitively to avoid "Kale" / "kale" showing twice.
  const addGroceryItemToGroup = (gi: number, name: string) =>
    setEdited((cur) => {
      if (!cur) return cur;
      const next = [...cur.groceries];
      const group = next[gi];
      if (!group) return cur;
      if (group.items.some((i) => i.toLowerCase() === name.toLowerCase())) {
        return cur;
      }
      next[gi] = { ...group, items: [...group.items, name] };
      return { ...cur, groceries: next };
    });

  const updateSimple = (
    field: 'intentions' | 'habits' | 'ideas' | 'gratitude',
    i: number,
    text: string,
  ) =>
    setEdited((cur) => {
      if (!cur) return cur;
      const next = [...cur[field]];
      next[i] = text;
      return { ...cur, [field]: next };
    });
  const removeSimple = (
    field: 'intentions' | 'habits' | 'ideas' | 'gratitude',
    i: number,
  ) =>
    setEdited(
      (cur) => cur && { ...cur, [field]: cur[field].filter((_, idx) => idx !== i) },
    );

  const removeMatch = (i: number) =>
    setMatches((cur) => cur.filter((_, idx) => idx !== i));

  // Per-row × in the pantry-sync section — drops the row from the
  // affected bucket so it won't be applied on Confirm.
  const removeHaveCheck = (idx: number) =>
    setHaveBuckets((cur) => ({
      ...cur,
      check: cur.check.filter((_, i) => i !== idx),
    }));
  const removeHaveUncheck = (idx: number) =>
    setHaveBuckets((cur) => ({
      ...cur,
      uncheck: cur.uncheck.filter((_, i) => i !== idx),
    }));
  const removeHaveAdd = (idx: number) =>
    setHaveBuckets((cur) => ({
      ...cur,
      add: cur.add.filter((_, i) => i !== idx),
    }));
  const removeHaveLowStock = (idx: number) =>
    setHaveBuckets((cur) => ({
      ...cur,
      lowStock: cur.lowStock.filter((_, i) => i !== idx),
    }));

  // ── grouped tasks for rendering ──
  const tasksByCategory: Record<PriorityCategory, Array<{ task: PriorityTask; i: number }>> = {
    medications: [],
    errands: [],
    work: [],
    home: [],
    bills: [],
    other: [],
  };
  edited.priorities.forEach((task, i) => {
    tasksByCategory[task.category].push({ task, i });
  });

  const handleSave = async () => {
    if (busy) return;
    const hasAnything =
      haveBuckets.check.length > 0 ||
      haveBuckets.uncheck.length > 0 ||
      haveBuckets.add.length > 0 ||
      haveBuckets.lowStock.length > 0;
    const haveSync: HaveSyncResolution | undefined = hasAnything
      ? {
          checkIds: haveBuckets.check.map((c) => c.itemId),
          uncheckIds: haveBuckets.uncheck.map((u) => u.itemId),
          addToUncategorized: haveBuckets.add.map((a) => a.phrase),
          lowStockUncheckIds: haveBuckets.lowStock
            .filter((l) => l.uncheckItemId != null)
            .map((l) => l.uncheckItemId as string),
          lowStockAddNames: haveBuckets.lowStock
            .filter((l) => l.addAsUnchecked != null)
            .map((l) => l.addAsUnchecked as string),
        }
      : undefined;
    await onConfirm(edited, matches, destinations, haveSync);
  };

  const isEmpty = totalChanges === 0;

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={prefersReducedMotion ? undefined : { opacity: 0 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1 }}
        exit={prefersReducedMotion ? undefined : { opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/50"
        onClick={onCancel}
      />
      <motion.div
        key="sheet"
        data-tour="capture-preview"
        initial={prefersReducedMotion ? undefined : { y: '100%' }}
        animate={prefersReducedMotion ? undefined : { y: 0 }}
        exit={prefersReducedMotion ? undefined : { y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="fixed inset-x-0 bottom-0 z-[70] bg-bg rounded-t-3xl shadow-warm-xl flex flex-col"
        style={{ maxHeight: '90dvh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="px-5 pb-3 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-text-primary">{t('preview.title')}</h2>
            {/* Notebook picker — only meaningful when there is journal
                content to route. Lets the user override the classifier
                pick in one tap before saving. */}
            {edited.journal && edited.journal.trim().length > 0 && (
              <NotebookPickerChip
                currentSlug={edited.notebook_slug}
                onChange={(slug) =>
                  setEdited((cur) => (cur ? { ...cur, notebook_slug: slug } : cur))
                }
              />
            )}
          </div>
          <button onClick={onCancel} className="text-text-secondary text-lg" aria-label="Close">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Fallback banner — shown when the caller flagged that this
              preview is a regex guess rather than a real Gemini
              classification. Lets the user see that the AI step
              didn't succeed AND gives a one-tap Retry. The preview
              items are still editable/saveable in the meantime; the
              banner is warning-colored, not blocking. */}
          {fellBack && (
            <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 space-y-2">
              <p className="text-xs text-warning leading-snug">
                {classifyError ?? t('preview.fallbackBanner')}
              </p>
              <p className="text-[11px] text-text-tertiary leading-snug">
                {t('preview.fallbackHint')}
              </p>
              {onRetryClassify && (
                <button
                  onClick={() => {
                    void onRetryClassify();
                  }}
                  disabled={busy}
                  className="text-xs font-semibold text-primary hover:underline disabled:opacity-40"
                >
                  {t('preview.retryClassify')}
                </button>
              )}
            </div>
          )}

          {isEmpty && <p className="text-sm text-text-tertiary text-center py-8">{t('preview.empty')}</p>}

          {/* Completions */}
          {matches.length > 0 && (
            <section>
              <SectionHeader label={`✓ ${t('preview.markDone')}`} count={matches.length} />
              <div className="space-y-1">
                {matches.map((m, i) => {
                  const targetLabel =
                    m.target?.kind === 'priority'
                      ? m.target.item.text
                      : m.target?.kind === 'grocery'
                      ? `${m.target.item.name} (${m.target.group.store})`
                      : null;
                  const willSkip = m.intent.type === 'skip';
                  // Unmatched "bought" completions get a fallback path:
                  // commitEverything appends them to a "General" group
                  // so the spoken item isn't silently lost.
                  const willFallbackToNew = !m.target && m.intent.type === 'bought';
                  const rowTint = willSkip
                    ? 'bg-error/5'
                    : willFallbackToNew
                      ? 'bg-amber-500/5'
                      : 'bg-success/5';
                  const iconColor = willSkip
                    ? 'text-error'
                    : willFallbackToNew
                      ? 'text-amber-500'
                      : 'text-success';
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-2 py-1.5 px-2 rounded-lg ${rowTint}`}
                    >
                      <span className={`text-sm ${iconColor}`}>
                        {willSkip ? '✕' : willFallbackToNew ? '+' : '✓'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] text-text-primary">"{m.intent.phrase}"</p>
                        {targetLabel ? (
                          <p className="text-[11px] text-text-tertiary mt-0.5">
                            → {willSkip ? t('preview.willSkip') : t('preview.matched')}: {targetLabel}
                          </p>
                        ) : willFallbackToNew ? (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                            → not on your list — will add to Groceries (General)
                          </p>
                        ) : (
                          <p className="text-[11px] text-text-tertiary mt-0.5 italic">
                            {t('preview.noMatch')}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => removeMatch(i)}
                        className="text-text-tertiary hover:text-error px-1 text-sm"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Pantry sync — the "I have …" voice flow. Only renders
              when at least one bucket has rows. Per-row × removes the
              row from its bucket; on Confirm the resolved buckets get
              passed back to the commit handler. Quantity counts (when
              the user volunteered specific numbers like "three onions
              left") render inline as "(N left)". */}
          {(haveBuckets.check.length > 0 ||
            haveBuckets.uncheck.length > 0 ||
            haveBuckets.add.length > 0 ||
            haveBuckets.lowStock.length > 0) && (
            <section className="space-y-3">
              <SectionHeader
                label={t('preview.haveSync.title')}
                count={
                  haveBuckets.check.length +
                  haveBuckets.uncheck.length +
                  haveBuckets.add.length +
                  haveBuckets.lowStock.length
                }
              />

              {haveBuckets.check.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wider text-success font-semibold">
                    {t('preview.haveSync.willCheck')}
                  </p>
                  {haveBuckets.check.map((c, idx) => (
                    <div
                      key={c.itemId}
                      className="flex items-start gap-2 py-1.5 px-2 rounded-lg bg-success/5"
                    >
                      <span className="text-sm text-success">✓</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] text-text-primary">
                          {c.itemName}
                          {c.qty_count != null && (
                            <span className="text-text-tertiary ml-1">({formatQtyLeft(c.qty_count)})</span>
                          )}
                        </p>
                        <p className="text-[11px] text-text-tertiary mt-0.5">
                          {c.store}
                        </p>
                      </div>
                      <button
                        onClick={() => removeHaveCheck(idx)}
                        className="text-text-tertiary hover:text-error px-1 text-sm"
                        aria-label="Skip this row"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {haveBuckets.lowStock.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold">
                    {t('preview.haveSync.willKeepLow')}
                  </p>
                  <p className="text-[11px] text-text-tertiary leading-snug">
                    {t('preview.haveSync.lowHint')}
                  </p>
                  {haveBuckets.lowStock.map((l, idx) => (
                    <div
                      key={`low-${idx}`}
                      className="flex items-start gap-2 py-1.5 px-2 rounded-lg bg-amber-500/5"
                    >
                      <span className="text-sm text-amber-600 dark:text-amber-400">⏵</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] text-text-primary">
                          {l.displayName}
                          {l.qty_count != null && (
                            <span className="text-text-tertiary ml-1">({formatQtyLeft(l.qty_count)})</span>
                          )}
                        </p>
                        {l.store && (
                          <p className="text-[11px] text-text-tertiary mt-0.5">
                            {l.store}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => removeHaveLowStock(idx)}
                        className="text-text-tertiary hover:text-error px-1 text-sm"
                        aria-label="Skip this row"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {haveBuckets.uncheck.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold">
                    {t('preview.haveSync.willUncheck')}
                  </p>
                  <p className="text-[11px] text-text-tertiary leading-snug">
                    {t('preview.haveSync.uncheckHint')}
                  </p>
                  {haveBuckets.uncheck.map((u, idx) => (
                    <div
                      key={u.itemId}
                      className="flex items-start gap-2 py-1.5 px-2 rounded-lg bg-amber-500/5"
                    >
                      <span className="text-sm text-amber-600 dark:text-amber-400">⏵</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] text-text-primary">{u.itemName}</p>
                        <p className="text-[11px] text-text-tertiary mt-0.5">
                          {u.store}
                        </p>
                      </div>
                      <button
                        onClick={() => removeHaveUncheck(idx)}
                        className="text-text-tertiary hover:text-error px-1 text-sm"
                        aria-label="Keep checked"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {haveBuckets.add.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wider text-primary font-semibold">
                    {t('preview.haveSync.willAdd')}
                  </p>
                  {haveBuckets.add.map((entry, idx) => (
                    <div
                      key={`${entry.phrase}-${idx}`}
                      className="flex items-start gap-2 py-1.5 px-2 rounded-lg bg-primary/5"
                    >
                      <span className="text-sm text-primary">+</span>
                      <p className="flex-1 text-[14px] text-text-primary min-w-0">
                        {entry.phrase}
                        {entry.qty_count != null && (
                          <span className="text-text-tertiary ml-1">({formatQtyLeft(entry.qty_count)})</span>
                        )}
                      </p>
                      <button
                        onClick={() => removeHaveAdd(idx)}
                        className="text-text-tertiary hover:text-error px-1 text-sm"
                        aria-label="Skip this row"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Tasks (grouped by category) */}
          {edited.priorities.length > 0 && (
            <section>
              <SectionHeader label={t('preview.tasks')} count={edited.priorities.length} />
              <div className="space-y-3">
                {PRIORITY_CATEGORY_ORDER.map((cat) => {
                  const list = tasksByCategory[cat];
                  if (list.length === 0) return null;
                  return (
                    <div key={cat} className="space-y-0.5">
                      <p className="text-[11px] uppercase tracking-wider text-text-tertiary">
                        {t(CATEGORY_LABEL_KEY[cat])}
                      </p>
                      {list.map(({ task, i }) => (
                        <div key={i} className="space-y-1">
                          <EditableRow
                            text={task.text}
                            onChange={(text) => updatePriority(i, { text })}
                            onDelete={() => removePriority(i)}
                            prefix={
                              <CategoryChip
                                value={task.category}
                                onChange={(c) => updatePriority(i, { category: c })}
                              />
                            }
                            hint={task.subgroup ?? undefined}
                          />
                          <div className="flex flex-wrap gap-1.5 pl-1 pb-1">
                            <DestinationChip
                              value={destinations[i] ?? { kind: 'today' }}
                              lists={lists}
                              onChange={(d) => updateDestination(i, d)}
                            />
                            <DateChip
                              value={task.due_date}
                              onChange={(d) => updatePriority(i, { due_date: d })}
                            />
                            <TimeChip
                              value={task.time}
                              onChange={(tm) => updatePriority(i, { time: tm })}
                            />
                            <TaskReminderChip
                              value={task.remind_at_iso}
                              onChange={(r) => updatePriority(i, { remind_at_iso: r })}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Plans channel is deprecated — events with time now flow as
              priorities with a `time` field set. The dedicated section
              has been removed. */}

          {/* Groceries (grouped by store) */}
          {edited.groceries.length > 0 && (
            <section>
              <SectionHeader
                label={t('category.groceries')}
                count={edited.groceries.reduce((s, g) => s + g.items.length, 0)}
              />
              <div className="space-y-3">
                {edited.groceries.map((g, gi) => (
                  <div key={gi} className="space-y-0.5">
                    <input
                      value={g.store}
                      onChange={(e) => updateGroceryStore(gi, e.target.value)}
                      className="text-[12px] uppercase tracking-wider text-text-tertiary bg-transparent outline-none border-b border-transparent focus:border-primary font-semibold"
                    />
                    {g.items.map((item, ii) => (
                      <EditableRow
                        key={ii}
                        text={item}
                        size="md"
                        onChange={(name) => updateGroceryItem(gi, ii, name)}
                        onDelete={() => removeGroceryItem(gi, ii)}
                      />
                    ))}
                    <AddItemInline
                      placeholder={t('preview.addItemToStore', { store: g.store || 'General' })}
                      onAdd={(name) => addGroceryItemToGroup(gi, name)}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Intentions */}
          {edited.intentions.length > 0 && (
            <section>
              <SectionHeader label={t('preview.intentions')} count={edited.intentions.length} />
              {edited.intentions.map((text, i) => (
                <EditableRow
                  key={i}
                  text={text}
                  onChange={(v) => updateSimple('intentions', i, v)}
                  onDelete={() => removeSimple('intentions', i)}
                />
              ))}
            </section>
          )}

          {/* Habits */}
          {edited.habits.length > 0 && (
            <section>
              <SectionHeader label={t('preview.habits')} count={edited.habits.length} />
              {edited.habits.map((text, i) => (
                <EditableRow
                  key={i}
                  text={text}
                  onChange={(v) => updateSimple('habits', i, v)}
                  onDelete={() => removeSimple('habits', i)}
                />
              ))}
            </section>
          )}

          {/* Ideas */}
          {edited.ideas.length > 0 && (
            <section>
              <SectionHeader label={t('preview.ideas')} count={edited.ideas.length} />
              {edited.ideas.map((text, i) => (
                <EditableRow
                  key={i}
                  text={text}
                  onChange={(v) => updateSimple('ideas', i, v)}
                  onDelete={() => removeSimple('ideas', i)}
                />
              ))}
            </section>
          )}

          {/* Gratitude */}
          {edited.gratitude.length > 0 && (
            <section>
              <SectionHeader label={t('preview.gratitude')} count={edited.gratitude.length} />
              {edited.gratitude.map((text, i) => (
                <EditableRow
                  key={i}
                  text={text}
                  onChange={(v) => updateSimple('gratitude', i, v)}
                  onDelete={() => removeSimple('gratitude', i)}
                />
              ))}
            </section>
          )}

          {/* Journal */}
          {edited.journal && (
            <section>
              <SectionHeader label={t('preview.journal')} count={1} />
              <textarea
                value={edited.journal}
                onChange={(e) => setEdited((cur) => cur && { ...cur, journal: e.target.value })}
                rows={4}
                className="w-full text-[14px] text-text-primary bg-surface rounded-xl border border-border p-3 outline-none focus:border-primary resize-y"
              />
              <button
                onClick={() => setEdited((cur) => cur && { ...cur, journal: null })}
                className="text-[11px] text-text-tertiary hover:text-error mt-1"
              >
                Remove journal entry
              </button>
            </section>
          )}

          {/* Routing audit trail — one line per item showing where it
              will land when the user taps Save. Critical trust UI:
              the previous silent-grocery-fallback bug would have been
              immediately obvious here. Collapsed by default so it's
              out of the way unless the user wants to inspect. */}
          {edited && totalChanges > 0 && (
            <RoutingSummary edited={edited} destinations={destinations} lists={lists} />
          )}
        </div>

        {/* Footer */}
        <div
          className="border-t border-border px-5 pt-3 flex gap-2"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-3 bg-surface border border-border text-text-primary font-semibold rounded-2xl"
          >
            {t('preview.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={busy || isEmpty}
            className="flex-[2] py-3 bg-primary text-white font-semibold rounded-2xl disabled:opacity-40"
          >
            {busy ? t('preview.saving') : t('preview.confirm')}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
