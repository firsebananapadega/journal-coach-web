'use client';

// Groceries — its own tab on the Tasks Wall. Reads from the new
// shared groceryStore (normalized + realtime via Supabase). Each
// user has one active list; tapping Share opens a sheet that issues
// a multi-use invite link. Both members see all changes — adds,
// check-offs, renames, deletes — within ~1s via postgres_changes.
//
// Voice capture lives in the Tasks-wall center button; speaking
// "milk and eggs from Costco" routes through classifyCapture and
// commits to this same store via captureCommit, which is why we
// don't need a per-page mic button here.

import { Suspense, useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useGroceryStore, type GroceryGroup, type GroceryItem } from '@/stores/groceryStore';
import { usePriorityStore } from '@/stores/priorityStore';
import { useListStore } from '@/stores/listStore';
import { useTaskStore } from '@/stores/taskStore';
import { toLocalDateStr } from '@/lib/dateUtils';
import { t } from '@/lib/translations';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import EmptyState from '@/components/ui/EmptyState';
import { prefersReducedMotion } from '@/lib/motionVariants';
import GroceryShareSheet from '@/components/GroceryShareSheet';
import {
  classifyCapture,
  type CaptureResult,
} from '@/lib/captureEngine';
import { commitCapture } from '@/lib/captureCommit';
import {
  CapturePreviewSheet,
  type CompletionMatch,
  type PriorityDestinations,
} from '@/components/CapturePreviewSheet';

export default function GroceriesPage() {
  return (
    <Suspense fallback={null}>
      <GroceriesInner />
    </Suspense>
  );
}

function GroceriesInner() {
  const todayStr = useMemo(() => toLocalDateStr(new Date()), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const justJoined = searchParams.get('joined') === '1';

  const listId = useGroceryStore((s) => s.listId);
  const groups = useGroceryStore((s) => s.groups);
  const items = useGroceryStore((s) => s.items);
  const loadActive = useGroceryStore((s) => s.loadActive);
  const subscribe = useGroceryStore((s) => s.subscribe);
  const unsubscribe = useGroceryStore((s) => s.unsubscribe);
  const toggleItem = useGroceryStore((s) => s.toggleItem);
  const removeItem = useGroceryStore((s) => s.removeItem);
  const removeGroup = useGroceryStore((s) => s.removeGroup);
  const renameItem = useGroceryStore((s) => s.renameItem);
  const addItem = useGroceryStore((s) => s.addItem);
  const addGroupsFromCapture = useGroceryStore((s) => s.addGroupsFromCapture);
  const pendingInvites = useGroceryStore((s) => s.pendingInvitesForMe);
  const acceptPendingInvite = useGroceryStore((s) => s.acceptPendingInvite);
  const declinePendingInvite = useGroceryStore((s) => s.declinePendingInvite);

  // Priorities-side capture preview still uses the old store for
  // priority items (we only normalized groceries).
  const priorityItems = usePriorityStore((s) => s.items);
  const fetchPriorities = usePriorityStore((s) => s.fetchPriorities);

  const [newItem, setNewItem] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<CaptureResult | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [showJoinedPrompt, setShowJoinedPrompt] = useState(justJoined);

  const lists = useListStore((s) => s.lists);
  const fetchLists = useListStore((s) => s.fetchLists);
  const fetchTasks = useTaskStore((s) => s.fetchAll);

  useEffect(() => {
    void loadActive();
    fetchLists();
    fetchTasks();
    fetchPriorities(todayStr);
  }, [loadActive, fetchLists, fetchTasks, fetchPriorities, todayStr]);

  useEffect(() => {
    if (!listId) return;
    subscribe();
    return () => unsubscribe();
  }, [listId, subscribe, unsubscribe]);

  // Group items by group_id once for the per-store rendering below.
  const itemsByGroup = useMemo(() => {
    const map = new Map<string, GroceryItem[]>();
    for (const it of items) {
      const arr = map.get(it.group_id) ?? [];
      arr.push(it);
      map.set(it.group_id, arr);
    }
    return map;
  }, [items]);

  const totalCount = items.length;
  const completedCount = items.filter((i) => i.completed).length;

  // Per-store collapse state — persisted so the user's choice survives
  // a refresh. Default is "all expanded" (empty Set).
  const [collapsedStores, setCollapsedStores] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem('groceries.collapsed');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggleCollapsed = (id: string) => {
    setCollapsedStores((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem('groceries.collapsed', JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  const handleAdd = async () => {
    const text = newItem.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const result = await classifyCapture(text, {
        existingGroceries: items.map((i) => i.name),
        existingPriorities: priorityItems.map((p) => p.text),
      });
      // If Gemini didn't detect any grocery items, fall back to one
      // grocery item under "General" so the user's input isn't lost.
      if (
        result.groceries.length === 0 &&
        result.priorities.length === 0
      ) {
        result.groceries.push({ store: 'General', items: [text] });
      }
      setPending(result);
    } catch {
      // Fallback path — write the raw text as a single item under General.
      await addGroupsFromCapture([{ store: 'General', items: [text] }]);
      setNewItem('');
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async (
    edited: CaptureResult,
    matches: CompletionMatch[],
    destinations: PriorityDestinations,
  ) => {
    await commitCapture(edited, destinations, {
      selectedDate: todayStr,
      lists,
    });
    for (const m of matches) {
      if (!m.target) continue;
      try {
        if (m.intent.type === 'skip') {
          if (m.target.kind === 'grocery') {
            await removeItem(m.target.item.id);
          }
        } else if (m.target.kind === 'grocery') {
          await toggleItem(m.target.item.id);
        }
      } catch {}
    }
    setNewItem('');
  };

  const dismissJoinedPrompt = () => {
    setShowJoinedPrompt(false);
    // Strip the query param so reloads don't re-prompt.
    router.replace('/groceries');
  };

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-8 space-y-5">
      {/* Pending-invite banners — one per row in pendingInvitesForMe.
          Tap Accept → membership added + active list switches to the
          shared one. Tap Decline → row deleted. Realtime keeps this
          live: a fresh invite from another user appears within ~1s. */}
      {pendingInvites.map((inv) => (
        <div
          key={inv.id}
          className="rounded-2xl border border-primary/40 bg-primary/5 p-4 space-y-3"
        >
          <p className="text-sm text-text-primary">
            {inv.inviter_name_snapshot
              ? t('pendingInvite.title', { name: inv.inviter_name_snapshot })
              : t('pendingInvite.titleFallback')}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => acceptPendingInvite(inv.id)}
              className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark"
            >
              {t('pendingInvite.accept')}
            </button>
            <button
              type="button"
              onClick={() => declinePendingInvite(inv.id)}
              className="flex-1 py-2.5 rounded-xl border border-border text-text-primary text-sm font-medium hover:bg-surface-elevated"
            >
              {t('pendingInvite.decline')}
            </button>
          </div>
        </div>
      ))}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            {t('priorities.groceries')}
          </h1>
          {totalCount > 0 && (
            <p className="text-sm text-text-secondary mt-1">
              {completedCount}/{totalCount}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          aria-label={t('groceries.shareAria')}
          className="w-9 h-9 rounded-full bg-surface border border-border flex items-center justify-center text-text-secondary hover:text-text-primary"
        >
          <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        </button>
      </div>

      {showJoinedPrompt && (
        <div className="rounded-2xl border border-primary bg-surface p-4 text-sm">
          <p className="font-semibold text-text-primary mb-1">
            {t('groceries.joinedTitle')}
          </p>
          <p className="text-text-secondary mb-3">
            {t('groceries.joinedBody')}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={dismissJoinedPrompt}
              className="flex-1 py-2 rounded-xl border border-border text-text-primary text-sm hover:bg-surface-elevated"
            >
              {t('groceries.joinedNo')}
            </button>
            {/* MVP: we don't auto-merge personal items in. The user can
                manually re-add anything they want from memory; the
                privacy default is "no surprise data leaks." A future
                phase can add an explicit migration helper here. */}
          </div>
        </div>
      )}

      {groups.length === 0 && (
        <EmptyState pose="peek" title={t('groceries.empty')} />
      )}

      <div className="space-y-3">
        {groups.map((group) => {
          const groupItems = itemsByGroup.get(group.id) ?? [];
          const collapsed = collapsedStores.has(group.id);
          return (
            <SwipeToDelete
              key={group.id}
              onDelete={() => removeGroup(group.id)}
            >
              <div className="bg-surface rounded-xl border border-border overflow-hidden">
                <button
                  onClick={() => toggleCollapsed(group.id)}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-surface-elevated transition-colors"
                  aria-expanded={!collapsed}
                  aria-controls={`grocery-group-${group.id}`}
                >
                  <div className="flex items-center gap-2">
                    <motion.svg
                      animate={
                        prefersReducedMotion
                          ? undefined
                          : { rotate: collapsed ? -90 : 0 }
                      }
                      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-text-tertiary"
                      aria-hidden
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </motion.svg>
                    <p className="text-base font-bold uppercase tracking-wide text-text-primary">
                      {group.store}
                    </p>
                  </div>
                  <span className="text-xs text-text-tertiary">
                    {groupItems.filter((i) => i.completed).length}/
                    {groupItems.length}
                  </span>
                </button>

                <motion.div
                  id={`grocery-group-${group.id}`}
                  initial={false}
                  animate={{
                    height: collapsed ? 0 : 'auto',
                    opacity: collapsed ? 0 : 1,
                  }}
                  transition={{
                    duration: prefersReducedMotion ? 0 : 0.22,
                    ease: [0.4, 0, 0.2, 1],
                  }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="px-3 pb-3 space-y-1">
                    {groupItems.map((item) => (
                      <SwipeToDelete
                        key={item.id}
                        onDelete={() => removeItem(item.id)}
                      >
                        <GroceryItemRow
                          item={item}
                          onToggle={() => toggleItem(item.id)}
                          onRename={(name) => renameItem(item.id, name)}
                        />
                      </SwipeToDelete>
                    ))}
                    <AddItemInline
                      placeholder={t('groceries.addToStore', { store: group.store })}
                      onAdd={(name) => addItem(group.id, name)}
                    />
                  </div>
                </motion.div>
              </div>
            </SwipeToDelete>
          );
        })}
      </div>

      <div className="flex gap-2 sticky bottom-0 bg-bg pt-2 pb-1">
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={t('groceries.placeholder')}
          className="flex-1 px-3 py-2.5 bg-surface border border-border rounded-xl text-sm text-text-primary outline-none focus:border-primary"
        />
        <button
          onClick={handleAdd}
          disabled={!newItem.trim() || busy}
          className="px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium disabled:opacity-40"
        >
          {busy ? t('preview.saving') : t('common.add')}
        </button>
      </div>

      <CapturePreviewSheet
        open={pending !== null}
        result={pending}
        existingPriorities={priorityItems}
        existingGroceries={groupsForCapturePreview(groups, items)}
        lists={lists}
        onCancel={() => setPending(null)}
        onConfirm={async (edited, matches, destinations) => {
          await onConfirm(edited, matches, destinations);
          setPending(null);
        }}
      />

      <GroceryShareSheet open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}

// CapturePreviewSheet still expects the legacy GroceryGroup shape
// (with embedded items). Adapt our flat state into the shape it needs.
function groupsForCapturePreview(
  groups: GroceryGroup[],
  items: GroceryItem[],
): { id: string; store: string; items: { id: string; name: string; completed: boolean }[] }[] {
  return groups.map((g) => ({
    id: g.id,
    store: g.store,
    items: items
      .filter((i) => i.group_id === g.id)
      .map((i) => ({ id: i.id, name: i.name, completed: i.completed })),
  }));
}

function GroceryItemRow({
  item,
  onToggle,
  onRename,
}: {
  item: GroceryItem;
  onToggle: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(item.name);
  }, [item.name, editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== item.name) {
      onRename(trimmed);
    } else {
      setDraft(item.name);
    }
    setEditing(false);
  };

  return (
    <div className="w-full flex items-center gap-3 py-2 px-1 bg-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.completed ? 'Uncheck' : 'Check off'}
        className="flex-shrink-0"
      >
        <motion.div
          animate={
            prefersReducedMotion
              ? undefined
              : item.completed
              ? { scale: [1, 1.25, 1] }
              : { scale: 1 }
          }
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className={`w-7 h-7 rounded border-2 flex items-center justify-center transition-colors ${
            item.completed ? 'bg-success border-success' : 'border-border'
          }`}
        >
          {item.completed && (
            <span className="text-white text-sm font-bold">✓</span>
          )}
        </motion.div>
      </button>
      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              setDraft(item.name);
              setEditing(false);
            }
          }}
          onBlur={commit}
          className="flex-1 bg-transparent text-base text-text-primary outline-none border-b border-primary py-0.5"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`flex-1 text-left text-base py-0.5 ${
            item.completed
              ? 'text-text-tertiary line-through'
              : 'text-text-primary'
          }`}
        >
          {item.name}
        </button>
      )}
    </div>
  );
}

function AddItemInline({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commitAndContinue = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const commitAndClose = () => {
    const trimmed = value.trim();
    if (trimmed) onAdd(trimmed);
    setValue('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 py-2 px-1 text-[13px] text-text-tertiary hover:text-text-secondary"
      >
        <span className="text-base leading-none">+</span>
        <span>{placeholder}</span>
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 py-1.5 px-1">
      <span className="text-text-tertiary text-base leading-none">+</span>
      <input
        ref={inputRef}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitAndContinue();
          } else if (e.key === 'Escape') {
            setValue('');
            setOpen(false);
          }
        }}
        onBlur={commitAndClose}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-base text-text-primary outline-none border-b border-primary py-0.5"
      />
    </div>
  );
}
