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
import { useGroceryStore, type GroceryItem } from '@/stores/groceryStore';
import { t } from '@/lib/translations';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import EmptyState from '@/components/ui/EmptyState';
import { prefersReducedMotion } from '@/lib/motionVariants';
import GroceryShareSheet from '@/components/GroceryShareSheet';
import { AddGrocerySheet } from '@/components/AddGrocerySheet';

export default function GroceriesPage() {
  return (
    <Suspense fallback={null}>
      <GroceriesInner />
    </Suspense>
  );
}

function GroceriesInner() {
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
  const pendingInvites = useGroceryStore((s) => s.pendingInvitesForMe);
  const acceptPendingInvite = useGroceryStore((s) => s.acceptPendingInvite);
  const declinePendingInvite = useGroceryStore((s) => s.declinePendingInvite);

  const [shareOpen, setShareOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [showJoinedPrompt, setShowJoinedPrompt] = useState(justJoined);
  // Per-store edit mode. Tapping the Edit button on a store header
  // flips this to that store's id; rows in that store render inline
  // edit inputs instead of the tap-to-toggle behavior. Only one
  // store can be in edit mode at a time. Tapping Done flips it back.
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);

  useEffect(() => {
    void loadActive();
  }, [loadActive]);

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
        <div className="flex items-center gap-2">
          {/* Primary add — tapping opens the manual-entry sheet. The
              previous always-visible textbox routed through the AI
              capture engine; this button is the deliberate "type in
              one item, no AI" path. */}
          <button
            type="button"
            onClick={() => setAddItemOpen(true)}
            aria-label={t('common.add')}
            className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-dark transition-colors"
          >
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              aria-hidden
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
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
          const isEditingThisStore = editingStoreId === group.id;
          return (
            // Store group is NO LONGER swipe-deletable. Per-store
            // delete now lives inside Edit mode (with confirmation),
            // matching the user's "I shouldn't have the option to
            // delete the entire store list by swiping" feedback.
            <div
              key={group.id}
              className="bg-surface rounded-xl border border-border overflow-hidden"
            >
                <div className="w-full flex items-center justify-between p-3">
                  <button
                    onClick={() => toggleCollapsed(group.id)}
                    className="flex-1 flex items-center gap-2 text-left hover:opacity-90 transition-opacity"
                    aria-expanded={!collapsed}
                    aria-controls={`grocery-group-${group.id}`}
                  >
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
                  </button>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-text-tertiary tabular-nums">
                      {groupItems.filter((i) => i.completed).length}/
                      {groupItems.length}
                    </span>
                    {/* Edit / Done toggle. Only one store can be in
                        edit mode at a time. Tapping Edit ALSO expands
                        the store if it was collapsed, so the user
                        immediately sees the items they're editing. */}
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditingThisStore) {
                          setEditingStoreId(null);
                        } else {
                          setEditingStoreId(group.id);
                          if (collapsed) toggleCollapsed(group.id);
                        }
                      }}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      {isEditingThisStore ? t('common.done') : t('common.edit')}
                    </button>
                  </div>
                </div>

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
                          forceEditing={isEditingThisStore}
                          onToggle={() => toggleItem(item.id)}
                          onRename={(name) => renameItem(item.id, name)}
                        />
                      </SwipeToDelete>
                    ))}
                    <AddItemInline
                      placeholder={t('groceries.addToStore', { store: group.store })}
                      onAdd={(name) => addItem(group.id, name)}
                    />
                    {/* Delete-this-store action — only visible inside
                        Edit mode. Confirmation required (per user
                        request) so a stray tap can't wipe the store. */}
                    {isEditingThisStore && (
                      <button
                        type="button"
                        onClick={() => {
                          const ok = window.confirm(
                            t('common.deleteStoreConfirm', { store: group.store }),
                          );
                          if (!ok) return;
                          removeGroup(group.id);
                          setEditingStoreId(null);
                        }}
                        className="w-full mt-2 py-2.5 rounded-lg text-sm font-medium text-error hover:bg-error/10 transition-colors"
                      >
                        {t('common.deleteStore')}
                      </button>
                    )}
                  </div>
                </motion.div>
              </div>
          );
        })}
      </div>

      <GroceryShareSheet open={shareOpen} onClose={() => setShareOpen(false)} />
      <AddGrocerySheet open={addItemOpen} onClose={() => setAddItemOpen(false)} />
    </div>
  );
}

function GroceryItemRow({
  item,
  forceEditing = false,
  onToggle,
  onRename,
}: {
  item: GroceryItem;
  /** When true (driven by per-store Edit mode in the parent), this
   *  row renders the inline rename input instead of the read-only
   *  text. Replaces the previous double-tap-to-edit pattern. */
  forceEditing?: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
}) {
  const [draft, setDraft] = useState(item.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const editing = forceEditing;

  useEffect(() => {
    setDraft(item.name);
  }, [item.name, forceEditing]);

  const handleTextTap = () => {
    onToggle();
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== item.name) {
      onRename(trimmed);
    } else {
      setDraft(item.name);
    }
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
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'Escape') {
              setDraft(item.name);
              (e.target as HTMLInputElement).blur();
            }
          }}
          onBlur={commit}
          className="flex-1 bg-transparent text-base text-text-primary outline-none border-b border-primary py-0.5"
        />
      ) : (
        <button
          type="button"
          onClick={handleTextTap}
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
