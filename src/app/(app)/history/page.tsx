'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useJournalStore, type JournalEntry } from '@/stores/journalStore';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import { t } from '@/lib/translations';
import { getLanguage } from '@/lib/language';
import { AnimatePresence, motion } from 'framer-motion';
import EmptyState from '@/components/ui/EmptyState';
import { staggerContainer, staggerItem, prefersReducedMotion } from '@/lib/motionVariants';
import Mascot from '@/components/mascot/Mascot';
import { getGuideOrDefault, type GuideId } from '@/lib/guideConfigs';
import {
  usePriorityStore,
  PRIORITY_CATEGORY_ORDER,
  type PriorityCategory,
} from '@/stores/priorityStore';
import { toLocalDateStr } from '@/lib/dateUtils';
import { classifyCapture, type CaptureResult } from '@/lib/captureEngine';
import { commitCapture as commitCaptureShared } from '@/lib/captureCommit';
import { useListStore } from '@/stores/listStore';
import { useTaskStore } from '@/stores/taskStore';
import { CapturePreviewSheet, type CompletionMatch, type PriorityDestinations } from '@/components/CapturePreviewSheet';

// Plans tab removed — scheduled events now live in /upcoming as
// regular tasks with a time field.
type TabKey = 'journal' | 'ideas' | 'gratitude' | 'priorities';

const TABS: { key: TabKey; labelKey: string }[] = [
  { key: 'journal', labelKey: 'journal.journal' },
  { key: 'ideas', labelKey: 'journal.ideas' },
  { key: 'gratitude', labelKey: 'journal.gratitude' },
  { key: 'priorities', labelKey: 'nav.tasks' },
];

interface SimpleItem {
  id: string;
  text: string;
  createdAt: string;
}

function getLocalItems(key: string): SimpleItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalItems(key: string, items: SimpleItem[]) {
  localStorage.setItem(key, JSON.stringify(items));
}

function relativeDate(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return t('journal.justNow');
  if (diffMin < 60) return t('journal.mAgo', { n: String(diffMin) });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t('journal.hAgo', { n: String(diffHr) });
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return t('journal.yesterday');
  if (diffDays < 7) return t('journal.dAgo', { n: String(diffDays) });
  return date.toLocaleDateString(getLanguage(), { month: 'short', day: 'numeric' });
}

const ENTRY_TYPE_LABEL: Record<string, string> = {
  voice: 'journal.typeVoice',
  guided: 'journal.typeGuided',
  template: 'journal.typeTemplate',
  freeform: 'journal.typeFreeform',
  pulse: 'journal.typePulse',
};

function SimpleListTab({
  storageKey,
  placeholder,
  emptyPose = 'peek',
  emptyTitle,
}: {
  storageKey: string;
  placeholder: string;
  emptyPose?: import('@/components/mascot/Bodhi').BodhiPose;
  emptyTitle: string;
}) {
  const [items, setItems] = useState<SimpleItem[]>([]);
  const [newText, setNewText] = useState('');

  const reload = useCallback(() => {
    setItems(getLocalItems(storageKey));
  }, [storageKey]);

  useEffect(() => { reload(); }, [reload]);

  const addItem = () => {
    if (!newText.trim()) return;
    const item: SimpleItem = {
      id: crypto.randomUUID(),
      text: newText.trim(),
      createdAt: new Date().toISOString(),
    };
    const updated = [item, ...items];
    setLocalItems(storageKey, updated);
    setItems(updated);
    setNewText('');
  };

  const deleteItem = (id: string) => {
    const updated = items.filter((i) => i.id !== id);
    setLocalItems(storageKey, updated);
    setItems(updated);
  };

  // Sort reverse chronological
  const sorted = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-3">
      {sorted.length === 0 && (
        <EmptyState pose={emptyPose} title={emptyTitle} />
      )}

      <motion.div
        variants={staggerContainer}
        initial={prefersReducedMotion ? undefined : 'initial'}
        animate={prefersReducedMotion ? undefined : 'animate'}
        className="space-y-2"
      >
        <AnimatePresence initial={false}>
          {sorted.map((item) => (
            <motion.div
              key={item.id}
              variants={staggerItem}
              layout
              exit={prefersReducedMotion ? undefined : { opacity: 0, x: -40 }}
            >
              <SwipeToDelete onDelete={() => deleteItem(item.id)}>
                <div className="bg-surface rounded-xl border border-border p-4 shadow-warm-sm">
                  <p className="text-sm text-text-primary">{item.text}</p>
                  <p className="text-xs text-text-tertiary mt-1">{relativeDate(item.createdAt)}</p>
                </div>
              </SwipeToDelete>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Add input */}
      <div className="flex gap-2 sticky bottom-0 bg-bg pt-2 pb-1">
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
          placeholder={placeholder}
          className="flex-1 px-3 py-2.5 bg-surface border border-border rounded-xl text-sm text-text-primary outline-none focus:border-primary"
        />
        <button
          onClick={addItem}
          disabled={!newText.trim()}
          className="px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium disabled:opacity-40"
        >
          {t('common.add')}
        </button>
      </div>
    </div>
  );
}

// ── Shared capture-preview commit helpers ────────────────────────────
//
// Both the journal Tasks and Plans tabs use the SAME capture engine /
// CapturePreviewSheet pipeline as /voice and /priorities. Defining the
// commit logic here keeps the two new tab components small and ensures
// the behavior is consistent across all four input surfaces.

async function commitCaptureForToday(
  edited: CaptureResult,
  matches: CompletionMatch[],
  destinations: PriorityDestinations,
) {
  const todayStr = toLocalDateStr(new Date());
  const lists = useListStore.getState().lists;

  // Priorities + groceries → shared router. Today / Inbox / List /
  // new-list are all handled inside commitCaptureShared.
  await commitCaptureShared(edited, destinations, {
    selectedDate: todayStr,
    lists,
  });

  // Completion matches — apply or skip.
  for (const m of matches) {
    if (!m.target) continue;
    try {
      if (m.intent.type === 'skip') {
        if (m.target.kind === 'priority') {
          await usePriorityStore.getState().removeItem(m.target.item.id);
        } else {
          await usePriorityStore.getState().removeGroceryItem(m.target.group.id, m.target.item.id);
        }
      } else {
        if (m.target.kind === 'priority') {
          await usePriorityStore.getState().markItemDone(m.target.item.id);
        } else {
          await usePriorityStore.getState().markGroceryDone(m.target.group.id, m.target.item.id);
        }
      }
    } catch (e) {
      console.warn('completion application failed', m.intent, e);
    }
  }

  // Lightweight categories (ideas/gratitude → localStorage; intentions →
  // user profile). The journal tab usage path is for quickly capturing
  // tasks; we DON'T forward ideas/gratitude/intentions here to keep the
  // surface focused. Those still flow through /voice. Same for journal
  // text — the journal tab isn't a journal-entry surface.
}

const CATEGORY_LABEL_KEY: Record<PriorityCategory, string> = {
  medications: 'category.medications',
  errands: 'category.errands',
  work: 'category.work',
  home: 'category.home',
  bills: 'category.bills',
  other: 'category.other',
};

// Tasks tab (priorities + groceries) — read-only view of today's items
// from the SAME priorityStore that /priorities and /voice write to.
// Tap any row to deep-link into /priorities for full edit/reorder.
function JournalPrioritiesTab() {
  const router = useRouter();
  const todayStr = useMemo(() => toLocalDateStr(new Date()), []);
  const items = usePriorityStore((s) => s.items);
  const groceries = usePriorityStore((s) => s.groceries);
  const fetchPriorities = usePriorityStore((s) => s.fetchPriorities);
  const toggleItem = usePriorityStore((s) => s.toggleItem);
  const toggleGroceryItem = usePriorityStore((s) => s.toggleGroceryItem);
  const [newText, setNewText] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<CaptureResult | null>(null);
  const lists = useListStore((s) => s.lists);
  const fetchLists = useListStore((s) => s.fetchLists);
  const fetchTasks = useTaskStore((s) => s.fetchAll);
  useEffect(() => {
    fetchLists();
    fetchTasks();
  }, [fetchLists, fetchTasks]);

  // One-time migration: pull any legacy `journal_priorities` localStorage
  // entries into today's priorities as 'other' category, then remove the
  // key so we never run again. Quietly absorbs the old flat list.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem('journal_priorities');
    if (!raw) return;
    try {
      const legacy = JSON.parse(raw) as Array<{ id: string; text: string }>;
      if (Array.isArray(legacy) && legacy.length > 0) {
        const items = legacy.map((it) => ({
          id: crypto.randomUUID(),
          text: it.text,
          completed: false,
          sort_order: 0,
          category: 'other' as PriorityCategory,
          subgroup: null,
        }));
        usePriorityStore.getState().addItems(todayStr, items)
          .then(() => localStorage.removeItem('journal_priorities'))
          .catch(() => { /* keep the key so we retry next mount */ });
      } else {
        localStorage.removeItem('journal_priorities');
      }
    } catch {
      localStorage.removeItem('journal_priorities');
    }
  }, [todayStr]);

  useEffect(() => { fetchPriorities(todayStr); }, [fetchPriorities, todayStr]);

  const handleAdd = async () => {
    const text = newText.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const result = await classifyCapture(text, {
        existingGroceries: groceries.flatMap((g) => g.items.map((i) => i.name)),
        existingPriorities: items.map((p) => p.text),
      });
      // Make sure the user's text isn't lost if Gemini returned nothing.
      if (
        result.priorities.length === 0 &&
        result.groceries.length === 0 &&
        result.plans.length === 0
      ) {
        result.priorities.push({ text, when: 'today', category: 'other', subgroup: null });
      }
      setPending(result);
    } catch {
      // Fallback — write text directly as 'other' so input isn't lost.
      await usePriorityStore.getState().addItems(todayStr, [{
        id: crypto.randomUUID(),
        text,
        completed: false,
        sort_order: 0,
        category: 'other',
        subgroup: null,
      }]);
      setNewText('');
    } finally {
      setBusy(false);
    }
  };

  const totalCount = items.length + groceries.reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="space-y-4">
      {totalCount === 0 && (
        <EmptyState pose="listen" title={t('priorities.empty')} />
      )}

      {/* Categories */}
      {PRIORITY_CATEGORY_ORDER.map((cat) => {
        const list = items.filter((i) => (i.category ?? 'other') === cat);
        if (list.length === 0) return null;
        return (
          <div key={cat} className="space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-text-tertiary">
              {t(CATEGORY_LABEL_KEY[cat])}
            </p>
            {list.map((item) => (
              <button
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-surface text-left"
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  item.completed ? 'bg-success border-success' : 'border-border'
                }`}>
                  {item.completed && <span className="text-white text-[10px] font-bold">✓</span>}
                </div>
                <span className={`text-sm flex-1 ${item.completed ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
                  {item.text}
                </span>
              </button>
            ))}
          </div>
        );
      })}

      {/* Groceries */}
      {groceries.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-text-tertiary">
            {t('category.groceries')}
          </p>
          {groceries.map((group) => (
            <div key={group.id} className="bg-surface rounded-xl border border-border p-3 space-y-1">
              <p className="text-[11px] uppercase font-semibold text-text-secondary">{group.store}</p>
              {group.items.map((it) => (
                <button
                  key={it.id}
                  onClick={() => toggleGroceryItem(group.id, it.id)}
                  className="w-full flex items-center gap-3 py-1.5 text-left"
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                    it.completed ? 'bg-success border-success' : 'border-border'
                  }`}>
                    {it.completed && <span className="text-white text-[10px] font-bold">✓</span>}
                  </div>
                  <span className={`text-sm flex-1 ${it.completed ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
                    {it.name}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Tap-through to full /priorities page */}
      <button
        onClick={() => router.push('/priorities')}
        className="w-full text-sm text-primary font-medium py-2"
      >
        {t('priorities.title')} →
      </button>

      {/* Add input */}
      <div className="flex gap-2 sticky bottom-0 bg-bg pt-2 pb-1">
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={t('priorities.placeholder')}
          className="flex-1 px-3 py-2.5 bg-surface border border-border rounded-xl text-sm text-text-primary outline-none focus:border-primary"
        />
        <button
          onClick={handleAdd}
          disabled={!newText.trim() || busy}
          className="px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium disabled:opacity-40"
        >
          {busy ? t('preview.saving') : t('common.add')}
        </button>
      </div>

      <CapturePreviewSheet
        open={pending !== null}
        result={pending}
        existingPriorities={items}
        existingGroceries={groceries}
        lists={lists}
        onCancel={() => setPending(null)}
        onConfirm={async (edited, matches, destinations) => {
          await commitCaptureForToday(edited, matches, destinations);
          setPending(null);
          setNewText('');
          await fetchPriorities(todayStr);
        }}
      />
    </div>
  );
}

// Plans tab removed — events now live in /upcoming as tasks with a
// time field. JournalPlansTab function deleted along with the
// internal 'plans' TabKey.

export default function JournalPage() {
  const router = useRouter();
  const { entries, fetchEntries, deleteEntry, toggleFavorite, loading, error } = useJournalStore();
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('journal');

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Hide daily Body & Mind check-ins AND completed-practice entries
  // from the History feed — they're metrics, not reflections, and
  // surface elsewhere (Pulse tab + Patterns play-button counter).
  const visibleEntries = entries.filter(
    (e) => e.entry_type !== 'check_in' && e.entry_type !== 'practice',
  );
  const baseFiltered = filter === 'favorites' ? visibleEntries.filter((e) => e.is_favorite) : visibleEntries;
  // No more draft-vs-finished split — the user's mental model is "every
  // guided entry is a conversation I can resume." Reverse-chronological
  // is the only sort.
  const filtered = baseFiltered;

  const handleDelete = async (id: string) => {
    await deleteEntry(id);
    setConfirmDelete(null);
  };

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-8 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">{t('journal.title')}</h1>
      </div>

      {/* Sub-tabs — scrollable for 5 tabs, with sliding pill */}
      <div className="flex gap-1.5 bg-surface rounded-xl p-1.5 overflow-x-auto scrollbar-hide">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                isActive ? 'text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="journalTabPill"
                  className="absolute inset-0 rounded-lg bg-primary"
                  transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10">{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>

      {/* Journal tab */}
      {activeTab === 'journal' && (
        <>
          <div className="flex justify-end">
            <div className="flex gap-1 bg-surface rounded-lg p-1">
              {(['all', 'favorites'] as const).map((f) => {
                const isActive = filter === f;
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`relative px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      isActive ? 'text-white' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="journalFilterPill"
                        className="absolute inset-0 rounded-md bg-primary"
                        transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">
                      {f === 'all' ? t('journal.all') : t('journal.favorites')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {loading && entries.length === 0 && !error && (
            <div className="text-center py-12 text-text-secondary">{t('journal.loadingEntries')}</div>
          )}

          {error && !loading && (
            <div className="text-center py-12 space-y-3">
              <p className="text-text-secondary text-sm">{error}</p>
              <button
                onClick={() => fetchEntries()}
                className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <EmptyState
              pose="peek"
              title={filter === 'favorites' ? t('journal.noFavorites') : t('journal.noEntries')}
            />
          )}

          <motion.div
            variants={staggerContainer}
            initial={prefersReducedMotion ? undefined : 'initial'}
            animate={prefersReducedMotion ? undefined : 'animate'}
            className="space-y-2"
          >
            {filtered.map((entry: JournalEntry) => {
              // Guided entries always route to /guided?resume so the
              // user can pick the conversation back up regardless of
              // whether it was marked draft or finished — there's no
              // distinction in the user's mental model. Other types
              // open in the entry detail view as before.
              const targetHref =
                entry.entry_type === 'guided'
                  ? `/guided?resume=${entry.id}`
                  : `/entry/${entry.id}`;
              return (
              <motion.div
                key={entry.id}
                variants={staggerItem}
                className="bg-surface rounded-xl border border-border p-4 space-y-2 shadow-warm-sm"
              >
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => router.push(targetHref)}
                    className="flex items-center gap-2 text-left flex-1"
                  >
                    <span className="text-xs text-text-tertiary">
                      {new Date(entry.created_at).toLocaleDateString(getLanguage(), {
                        weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                    </span>
                    {(() => {
                      // Guided entries → small avatar + guide name pill
                      // (the entry title already says "Guided session"
                      // so a redundant 💬 pill was confusing). Other
                      // types fall through to the generic label pill.
                      const meta = entry.metadata as Record<string, unknown> | null;
                      const guideId = meta?.guide_id as GuideId | undefined;
                      if (entry.entry_type === 'guided' && guideId) {
                        const guide = getGuideOrDefault(guideId);
                        return (
                          <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 bg-surface-elevated rounded-md text-text-secondary">
                            <Mascot guide={guideId} pose="idle" size="xs" animate />
                            <span>{guide.name}</span>
                          </span>
                        );
                      }
                      return (
                        <span className="text-xs px-2 py-0.5 bg-surface-elevated rounded-md text-text-secondary">
                          {t(ENTRY_TYPE_LABEL[entry.entry_type]) || entry.entry_type}
                        </span>
                      );
                    })()}
                    {entry.mood_label && (
                      <span className="text-xs text-text-secondary capitalize">{entry.mood_label}</span>
                    )}
                  </button>
                  <div className="flex items-center gap-1">
                    <motion.button
                      whileTap={prefersReducedMotion ? undefined : { scale: 1.4 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 14 }}
                      onClick={() => toggleFavorite(entry.id)}
                      className="p-1 text-lg"
                      title="Toggle favorite"
                    >
                      <motion.span
                        key={entry.is_favorite ? 'on' : 'off'}
                        initial={prefersReducedMotion ? undefined : { scale: entry.is_favorite ? 0.6 : 1 }}
                        animate={prefersReducedMotion ? undefined : { scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 16 }}
                        className="inline-block"
                      >
                        {entry.is_favorite ? '⭐' : '☆'}
                      </motion.span>
                    </motion.button>
                    {confirmDelete === entry.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="px-2 py-1 text-xs bg-error text-white rounded-md"
                        >
                          {t('common.delete')}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-2 py-1 text-xs text-text-secondary"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(entry.id)}
                        className="p-1.5 text-text-tertiary hover:text-error transition-colors"
                        title="Delete"
                        aria-label="Delete entry"
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.75}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                          <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => router.push(targetHref)}
                  className="w-full text-left"
                >
                  {entry.title && (
                    <p className="text-sm font-semibold text-text-primary mb-1">{entry.title}</p>
                  )}
                  <p className="text-sm text-text-secondary line-clamp-3">
                    {entry.content_text?.substring(0, 200) || 'No content'}
                  </p>
                </button>
              </motion.div>
              );
            })}
          </motion.div>
        </>
      )}

      {/* Ideas tab */}
      {activeTab === 'ideas' && (
        <SimpleListTab
          storageKey="journal_ideas"
          placeholder={t('journal.addIdea')}
          emptyPose="think"
          emptyTitle={t('journal.noIdeas')}
        />
      )}

      {/* Gratitude tab */}
      {activeTab === 'gratitude' && (
        <SimpleListTab
          storageKey="journal_gratitude"
          placeholder={t('journal.addGratitude')}
          emptyPose="celebrate"
          emptyTitle={t('journal.noGratitude')}
        />
      )}

      {/* Plans tab — unified with planStore */}

      {/* Tasks tab — unified with priorityStore */}
      {activeTab === 'priorities' && <JournalPrioritiesTab />}
    </div>
  );
}
