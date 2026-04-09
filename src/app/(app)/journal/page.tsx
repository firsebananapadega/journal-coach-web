'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useJournalStore, type JournalEntry } from '@/stores/journalStore';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import { t } from '@/lib/translations';
import { getLanguage } from '@/lib/language';

type TabKey = 'journal' | 'ideas' | 'gratitude' | 'plans' | 'priorities';

const TABS: { key: TabKey; labelKey: string }[] = [
  { key: 'journal', labelKey: 'journal.journal' },
  { key: 'ideas', labelKey: 'journal.ideas' },
  { key: 'gratitude', labelKey: 'journal.gratitude' },
  { key: 'plans', labelKey: 'nav.plans' },
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
};

function SimpleListTab({ storageKey, placeholder }: { storageKey: string; placeholder: string }) {
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
        <div className="text-center py-12 space-y-2">
          <p className="text-4xl">{storageKey === 'journal_ideas' ? '💡' : '🙏'}</p>
          <p className="text-text-secondary">
            {storageKey === 'journal_ideas' ? t('journal.noIdeas') : t('journal.noGratitude')}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {sorted.map((item) => (
          <SwipeToDelete key={item.id} onDelete={() => deleteItem(item.id)}>
            <div className="bg-surface rounded-xl border border-border p-4">
              <p className="text-sm text-text-primary">{item.text}</p>
              <p className="text-xs text-text-tertiary mt-1">{relativeDate(item.createdAt)}</p>
            </div>
          </SwipeToDelete>
        ))}
      </div>

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

export default function JournalPage() {
  const router = useRouter();
  const { entries, fetchEntries, deleteEntry, toggleFavorite, loading } = useJournalStore();
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('journal');

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const filtered = filter === 'favorites' ? entries.filter((e) => e.is_favorite) : entries;

  const handleDelete = async (id: string) => {
    await deleteEntry(id);
    setConfirmDelete(null);
  };

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-8 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">{t('journal.title')}</h1>
      </div>

      {/* Sub-tabs — scrollable for 5 tabs */}
      <div className="flex gap-1.5 bg-surface rounded-xl p-1.5 overflow-x-auto scrollbar-hide">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-primary text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Journal tab */}
      {activeTab === 'journal' && (
        <>
          <div className="flex justify-end">
            <div className="flex gap-1 bg-surface rounded-lg p-1">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  filter === 'all' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t('journal.all')}
              </button>
              <button
                onClick={() => setFilter('favorites')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  filter === 'favorites' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t('journal.favorites')}
              </button>
            </div>
          </div>

          {loading && entries.length === 0 && (
            <div className="text-center py-12 text-text-secondary">{t('journal.loadingEntries')}</div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-12 space-y-2">
              <p className="text-4xl">📖</p>
              <p className="text-text-secondary">
                {filter === 'favorites' ? t('journal.noFavorites') : t('journal.noEntries')}
              </p>
            </div>
          )}

          <div className="space-y-2">
            {filtered.map((entry: JournalEntry) => (
              <div
                key={entry.id}
                className="bg-surface rounded-xl border border-border p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => router.push(`/entry/${entry.id}`)}
                    className="flex items-center gap-2 text-left flex-1"
                  >
                    <span className="text-xs text-text-tertiary">
                      {new Date(entry.created_at).toLocaleDateString(getLanguage(), {
                        weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-surface-elevated rounded-md text-text-secondary">
                      {t(ENTRY_TYPE_LABEL[entry.entry_type]) || entry.entry_type}
                    </span>
                    {entry.mood_label && (
                      <span className="text-xs text-text-secondary capitalize">{entry.mood_label}</span>
                    )}
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleFavorite(entry.id)}
                      className="p-1 text-lg hover:scale-110 transition-transform"
                      title="Toggle favorite"
                    >
                      {entry.is_favorite ? '⭐' : '☆'}
                    </button>
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
                        className="p-1 text-text-tertiary hover:text-error transition-colors"
                        title="Delete"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => router.push(`/entry/${entry.id}`)}
                  className="w-full text-left"
                >
                  {entry.title && (
                    <p className="text-sm font-semibold text-text-primary mb-1">{entry.title}</p>
                  )}
                  <p className="text-sm text-text-secondary line-clamp-3">
                    {entry.content_text?.substring(0, 200) || 'No content'}
                  </p>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Ideas tab */}
      {activeTab === 'ideas' && (
        <SimpleListTab storageKey="journal_ideas" placeholder={t('journal.addIdea')} />
      )}

      {/* Gratitude tab */}
      {activeTab === 'gratitude' && (
        <SimpleListTab storageKey="journal_gratitude" placeholder={t('journal.addGratitude')} />
      )}

      {/* Plans tab — raw plan entries */}
      {activeTab === 'plans' && (
        <SimpleListTab storageKey="journal_plans" placeholder={t('plans.placeholder')} />
      )}

      {/* Priorities tab — raw priority entries */}
      {activeTab === 'priorities' && (
        <SimpleListTab storageKey="journal_priorities" placeholder={t('priorities.placeholder')} />
      )}
    </div>
  );
}
