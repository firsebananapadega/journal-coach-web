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
import { createPortal } from 'react-dom';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  useGroceryStore,
  isUncategorized,
  type GroceryItem,
  type GroceryGroup,
} from '@/stores/groceryStore';
import { effectivePerishable } from '@/lib/groceryClassify';
import { t } from '@/lib/translations';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import EmptyState from '@/components/ui/EmptyState';
import { prefersReducedMotion } from '@/lib/motionVariants';
import GroceryShareSheet from '@/components/GroceryShareSheet';
import { AddGrocerySheet } from '@/components/AddGrocerySheet';
import CaptureMicButton from '@/components/CaptureMicButton';

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
  const moveItemToGroup = useGroceryStore((s) => s.moveItemToGroup);
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

  // Render order: store groups first (by sort_order), Uncategorized
  // pinned to the bottom regardless of its own sort_order. The
  // Uncategorized group is the only one users can drag items OUT of
  // in this pass.
  const sortedGroups = useMemo<GroceryGroup[]>(() => {
    const stores = groups.filter((g) => !isUncategorized(g));
    const uncategorized = groups.filter((g) => isUncategorized(g));
    return [...stores, ...uncategorized];
  }, [groups]);

  const totalCount = items.length;
  const completedCount = items.filter((i) => i.completed).length;

  // ── Drag-drop: Uncategorized items → store groups ────────────
  // The 250ms press delay + 5px tolerance lets vertical scrolling
  // pass through unless the user genuinely intends to drag (matches
  // the /lists Inbox triage drag pattern). pointerWithin makes the
  // drop resolve from the cursor's screen position, not the
  // overlay's bounding rect — so the store under the user's thumb
  // is the one that activates.
  const [activeDragItemId, setActiveDragItemId] = useState<string | null>(null);
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  });
  const dragSensors = useSensors(pointerSensor, touchSensor);

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragItemId(String(e.active.id));
  };
  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveDragItemId(null);
    const { active, over } = e;
    if (!over) return;
    const itemId = String(active.id);
    const targetGroupId = String(over.id);
    const target = groups.find((g) => g.id === targetGroupId);
    if (!target || isUncategorized(target)) return;
    await moveItemToGroup(itemId, targetGroupId);
  };

  const activeDragItem = activeDragItemId
    ? items.find((i) => i.id === activeDragItemId) ?? null
    : null;

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

      <DndContext
        sensors={dragSensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDragItemId(null)}
      >
        <div className="space-y-3">
          {sortedGroups.map((group) => {
            const groupItems = itemsByGroup.get(group.id) ?? [];
            const collapsed = collapsedStores.has(group.id);
            const isEditingThisStore = editingStoreId === group.id;
            const uncategorized = isUncategorized(group);
            return uncategorized ? (
              <UncategorizedFlatList
                key={group.id}
                items={groupItems}
                onItemToggle={(id) => toggleItem(id)}
                onItemRemove={(id) => removeItem(id)}
                onItemRename={(id, name) => renameItem(id, name)}
              />
            ) : (
              <DroppableStoreGroupCard
                key={group.id}
                group={group}
                items={groupItems}
                collapsed={collapsed}
                isEditing={isEditingThisStore}
                onToggleCollapse={() => toggleCollapsed(group.id)}
                onEditToggle={() => {
                  if (isEditingThisStore) setEditingStoreId(null);
                  else {
                    setEditingStoreId(group.id);
                    if (collapsed) toggleCollapsed(group.id);
                  }
                }}
                onItemToggle={(id) => toggleItem(id)}
                onItemRemove={(id) => removeItem(id)}
                onItemRename={(id, name) => renameItem(id, name)}
                onAddItem={(name) => addItem(group.id, name)}
                onDeleteGroup={() => {
                  const ok = window.confirm(
                    t('common.deleteStoreConfirm', { store: group.store }),
                  );
                  if (!ok) return;
                  removeGroup(group.id);
                  setEditingStoreId(null);
                }}
              />
            );
          })}
        </div>

        {/* Drag overlay portaled to <body> so it isn't clipped by any
            transformed ancestor (matches the /lists triage pattern). */}
        {typeof document !== 'undefined' &&
          createPortal(
            <DragOverlay dropAnimation={null}>
              {activeDragItem ? (
                <div className="px-3 py-2 rounded-xl bg-surface border border-primary shadow-warm-md text-sm text-text-primary leading-snug max-w-[220px] line-clamp-1">
                  {activeDragItem.name}
                </div>
              ) : null}
            </DragOverlay>,
            document.body,
          )}
      </DndContext>

      <GroceryShareSheet open={shareOpen} onClose={() => setShareOpen(false)} />
      <AddGrocerySheet open={addItemOpen} onClose={() => setAddItemOpen(false)} />

      {/* Voice-mic FAB — AI auto-routes grocery items into the active
          list. The existing "+" header button (typed AddGrocerySheet)
          stays for users who'd rather type. */}
      <CaptureMicButton />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Group card components
//
// Two variants:
//   - DroppableStoreGroupCard — wrap in useDroppable so dragged
//     Uncategorized items can land here.
//   - UncategorizedGroupCard — items inside become draggable; the
//     card itself isn't a drop target (can't drag onto yourself).
//
// Both share the visual shell. They diverge on (a) drop highlight,
// (b) draggable rows, (c) subtitle hint on Uncategorized.

interface GroupCardCommonProps {
  group: GroceryGroup;
  items: GroceryItem[];
  collapsed: boolean;
  isEditing: boolean;
  onToggleCollapse: () => void;
  onEditToggle: () => void;
  onItemToggle: (id: string) => void;
  onItemRemove: (id: string) => void;
  onItemRename: (id: string, name: string) => void;
  onAddItem: (name: string) => void;
  onDeleteGroup: () => void;
}

function GroupHeader({
  store,
  count,
  total,
  collapsed,
  isEditing,
  onToggleCollapse,
  onEditToggle,
  subtitle,
}: {
  store: string;
  count: number;
  total: number;
  collapsed: boolean;
  isEditing: boolean;
  onToggleCollapse: () => void;
  onEditToggle: () => void;
  subtitle?: string;
}) {
  return (
    <div className="w-full flex items-center justify-between p-3">
      <button
        onClick={onToggleCollapse}
        className="flex-1 flex items-start gap-2 text-left hover:opacity-90 transition-opacity"
        aria-expanded={!collapsed}
      >
        <motion.svg
          animate={prefersReducedMotion ? undefined : { rotate: collapsed ? -90 : 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-text-tertiary mt-1.5"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </motion.svg>
        <span className="flex-1 min-w-0">
          <span className="block text-base font-bold uppercase tracking-wide text-text-primary">
            {store}
          </span>
          {subtitle && (
            <span className="block text-[11px] text-text-tertiary leading-snug mt-0.5 normal-case font-normal tracking-normal">
              {subtitle}
            </span>
          )}
        </span>
      </button>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-text-tertiary tabular-nums">
          {count}/{total}
        </span>
        <button
          type="button"
          onClick={onEditToggle}
          className="text-xs font-semibold text-primary hover:underline"
        >
          {isEditing ? t('common.done') : t('common.edit')}
        </button>
      </div>
    </div>
  );
}

function GroupBody({
  group,
  items,
  collapsed,
  isEditing,
  draggable,
  onItemToggle,
  onItemRemove,
  onItemRename,
  onAddItem,
  onDeleteGroup,
}: GroupCardCommonProps & { draggable: boolean }) {
  return (
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
        {items.map((item) =>
          draggable ? (
            <DraggableGroceryRow key={item.id} itemId={item.id}>
              <SwipeToDelete onDelete={() => onItemRemove(item.id)}>
                <GroceryItemRow
                  item={item}
                  forceEditing={isEditing}
                  onToggle={() => onItemToggle(item.id)}
                  onRename={(name) => onItemRename(item.id, name)}
                />
              </SwipeToDelete>
            </DraggableGroceryRow>
          ) : (
            <SwipeToDelete key={item.id} onDelete={() => onItemRemove(item.id)}>
              <GroceryItemRow
                item={item}
                forceEditing={isEditing}
                onToggle={() => onItemToggle(item.id)}
                onRename={(name) => onItemRename(item.id, name)}
              />
            </SwipeToDelete>
          ),
        )}
        <AddItemInline
          placeholder={t('groceries.addToStore', { store: group.store })}
          onAdd={onAddItem}
        />
        {isEditing && (
          <button
            type="button"
            onClick={onDeleteGroup}
            className="w-full mt-2 py-2.5 rounded-lg text-sm font-medium text-error hover:bg-error/10 transition-colors"
          >
            {t('common.deleteStore')}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function DroppableStoreGroupCard(props: GroupCardCommonProps) {
  const { setNodeRef, isOver } = useDroppable({ id: props.group.id });
  const completed = props.items.filter((i) => i.completed).length;
  return (
    <div
      ref={setNodeRef}
      className={`bg-surface rounded-xl border overflow-hidden transition-colors ${
        isOver ? 'border-primary ring-2 ring-primary/30' : 'border-border'
      }`}
    >
      <GroupHeader
        store={props.group.store}
        count={completed}
        total={props.items.length}
        collapsed={props.collapsed}
        isEditing={props.isEditing}
        onToggleCollapse={props.onToggleCollapse}
        onEditToggle={props.onEditToggle}
      />
      <GroupBody {...props} draggable={false} />
    </div>
  );
}

/** Flat list of Uncategorized items — NOT a card. The Uncategorized
 *  group is temporary holding space for items the AI couldn't route
 *  to a specific store; the user is expected to drag each row out
 *  into a real store. Heavy chrome (chevron, big header card, count
 *  badge, Edit/Done button) implies permanence — this section is
 *  meant to disappear once the user finishes dragging.
 *
 *  Renders nothing when there are no uncategorized items, so the
 *  /groceries page collapses cleanly back to just the store cards. */
function UncategorizedFlatList({
  items,
  onItemToggle,
  onItemRemove,
  onItemRename,
}: {
  items: GroceryItem[];
  onItemToggle: (id: string) => void;
  onItemRemove: (id: string) => void;
  onItemRename: (id: string, name: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1 pt-2">
      <p className="text-[11px] uppercase tracking-wider text-text-tertiary px-1">
        {t('groceries.uncategorized.dragHint')}
      </p>
      {items.map((item) => (
        <DraggableGroceryRow key={item.id} itemId={item.id}>
          <SwipeToDelete onDelete={() => onItemRemove(item.id)}>
            <GroceryItemRow
              item={item}
              forceEditing={false}
              onToggle={() => onItemToggle(item.id)}
              onRename={(name) => onItemRename(item.id, name)}
            />
          </SwipeToDelete>
        </DraggableGroceryRow>
      ))}
    </div>
  );
}

function DraggableGroceryRow({
  itemId,
  children,
}: {
  itemId: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: itemId,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ touchAction: 'pan-y', opacity: isDragging ? 0 : 1 }}
      {...listeners}
      {...attributes}
    >
      {children}
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
  // Local string state for the qty input (so empty / partial typing
  // works). Persisted via setItemQuantity on commit/blur.
  const [qtyDraft, setQtyDraft] = useState<string>(
    item.quantity != null ? String(item.quantity) : '',
  );
  const setItemQuantity = useGroceryStore((s) => s.setItemQuantity);
  const inputRef = useRef<HTMLInputElement>(null);
  const editing = forceEditing;

  useEffect(() => {
    setDraft(item.name);
    setQtyDraft(item.quantity != null ? String(item.quantity) : '');
  }, [item.name, item.quantity, forceEditing]);

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

  const commitQty = () => {
    const t = qtyDraft.trim();
    if (t === '') {
      if (item.quantity != null) void setItemQuantity(item.id, null);
      return;
    }
    const n = Number.parseInt(t, 10);
    if (Number.isInteger(n) && n >= 1) {
      if (item.quantity !== n) void setItemQuantity(item.id, n);
    } else {
      // Non-numeric input: revert.
      setQtyDraft(item.quantity != null ? String(item.quantity) : '');
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
        <>
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
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={qtyDraft}
            onChange={(e) => setQtyDraft(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={commitQty}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitQty();
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="–"
            aria-label={t('groceries.qtyLabel')}
            className="w-12 text-center bg-transparent text-sm text-text-secondary outline-none border-b border-border focus:border-primary py-0.5 tabular-nums"
          />
          <PerishableChip item={item} />
        </>
      ) : (
        <>
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
          {item.quantity != null && (
            <span
              className={`shrink-0 text-sm tabular-nums ${
                item.completed
                  ? 'text-text-tertiary line-through'
                  : 'text-text-tertiary'
              }`}
              aria-label={`${item.quantity} ${t('groceries.qtyLabel')}`}
            >
              × {item.quantity}
            </span>
          )}
        </>
      )}
    </div>
  );
}

/** Two-state chip shown only in per-store Edit mode. Displays the
 *  effective perishable status (override → dictionary → null
 *  treated as non-perishable for display). Tap flips the override
 *  to the opposite state. The auto-classify path is reached only
 *  when the user has never explicitly set this item — once they
 *  tap, the override locks. */
function PerishableChip({ item }: { item: GroceryItem }) {
  const setItemPerishable = useGroceryStore((s) => s.setItemPerishable);
  const effective = effectivePerishable(item);
  // Display: true → Perishable, anything else → Non-perishable.
  const isPerishable = effective === true;
  const label = isPerishable
    ? t('groceries.perishable')
    : t('groceries.nonPerishable');
  const handleTap = () => {
    // Flip the override. If currently effective true (whether via
    // override or dictionary), set explicit false; otherwise set
    // explicit true. Either way the column ends up with a boolean,
    // never null — taps are deliberate.
    void setItemPerishable(item.id, !isPerishable);
  };
  return (
    <button
      type="button"
      onClick={handleTap}
      className={`shrink-0 text-[10px] px-2 py-1 rounded-full font-medium border transition-colors ${
        isPerishable
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
          : 'bg-surface-elevated text-text-secondary border-border'
      } hover:border-primary`}
      aria-label={label}
    >
      {label}
    </button>
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
