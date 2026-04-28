'use client';

// AddGrocerySheet — bottom sheet for manually creating a grocery item.
// Bypasses the AI capture engine (groceries can still go through
// classify/preview when added from /voice or other capture surfaces;
// this is the deliberate "I want to type one in" path on /groceries).
// Quantity / units stay embedded in the name string ("2 lbs apples")
// to match the existing inline-edit shape of the list.

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGroceryStore } from '@/stores/groceryStore';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { useVisualViewport } from '@/hooks/useVisualViewport';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Existing group to pre-select. Pass undefined to default to the
   *  first existing group, or to the new-store path if there are
   *  no groups yet. */
  defaultGroupId?: string | null;
}

// Sentinel value for the dropdown's "+ New store" option.
const NEW_STORE = '__new__';

export function AddGrocerySheet({ open, onClose, defaultGroupId }: Props) {
  const groups = useGroceryStore((s) => s.groups);
  const addItem = useGroceryStore((s) => s.addItem);
  const addGroup = useGroceryStore((s) => s.addGroup);
  // See AddTaskSheet for rationale — pin sheet to the visual viewport
  // when the keyboard is up.
  const vv = useVisualViewport();
  const keyboardOpen = vv?.keyboardOpen ?? false;

  const [text, setText] = useState('');
  // Either an existing group id, or NEW_STORE for the inline-create path.
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [newStoreName, setNewStoreName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setText('');
    setNewStoreName('');
    if (defaultGroupId) {
      setSelectedGroupId(defaultGroupId);
    } else if (groups.length > 0) {
      setSelectedGroupId(groups[0].id);
    } else {
      // No groups yet — surface the new-store path so the user can
      // create one inline without a separate ceremony.
      setSelectedGroupId(NEW_STORE);
    }
  }, [open, defaultGroupId, groups]);

  const isNewStore = selectedGroupId === NEW_STORE;
  const canSubmit =
    text.trim().length > 0 &&
    (isNewStore ? newStoreName.trim().length > 0 : !!selectedGroupId);

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      let groupId = selectedGroupId;
      if (isNewStore) {
        const created = await addGroup(newStoreName.trim());
        if (!created) return;
        groupId = created.id;
      }
      await addItem(groupId, text.trim());
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[60]"
          />

          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 380, damping: 36 }
            }
            className="fixed inset-x-3 z-[70] bg-surface rounded-3xl border border-border shadow-warm-xl flex flex-col overflow-hidden"
            style={
              vv && keyboardOpen
                ? {
                    bottom: `${vv.layoutHeight - vv.offsetTop - vv.height + 12}px`,
                    maxHeight: `${vv.height - 24}px`,
                  }
                : {
                    bottom: 'max(18dvh, env(safe-area-inset-bottom) + 0.75rem)',
                    maxHeight: '70dvh',
                  }
            }
          >
            <div className="shrink-0 pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-border mx-auto" />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto max-w-lg mx-auto w-full px-5 pb-4 space-y-4">
              <div className="flex items-center justify-between -mt-1">
                <h2 className="text-base font-bold text-text-primary">Add item</h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="w-9 h-9 flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary text-lg"
                >
                  ✕
                </button>
              </div>

              <input
                autoFocus
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSubmit) {
                    e.preventDefault();
                    void handleSubmit();
                  }
                }}
                placeholder="e.g. 2 lbs apples"
                className="w-full px-3 py-2.5 bg-bg border border-border focus:border-primary rounded-xl text-base text-text-primary outline-none placeholder:text-text-tertiary"
              />

              <div>
                <label className="block text-[11px] uppercase tracking-widest text-text-tertiary font-semibold mb-1">
                  Store
                </label>
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-text-primary outline-none"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.store}
                    </option>
                  ))}
                  <option value={NEW_STORE}>+ New store…</option>
                </select>
                {isNewStore && (
                  <input
                    type="text"
                    value={newStoreName}
                    onChange={(e) => setNewStoreName(e.target.value)}
                    placeholder="Store name"
                    className="mt-2 w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-text-primary outline-none placeholder:text-text-tertiary"
                  />
                )}
              </div>
            </div>

            <div
              className="shrink-0 border-t border-border bg-surface"
              style={{
                paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
              }}
            >
              <div className="max-w-lg mx-auto w-full px-5 pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl border border-border text-text-primary text-sm font-medium hover:bg-surface-elevated transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit || submitting}
                  className="flex-[2] py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
