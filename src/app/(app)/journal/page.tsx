'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useJournalStore, type JournalEntry } from '@/stores/journalStore';

const ENTRY_TYPE_LABEL: Record<string, string> = {
  voice: '🎙️ Voice',
  guided: '💬 Guided',
  template: '📋 Template',
  freeform: '✏️ Free Write',
};

export default function JournalPage() {
  const router = useRouter();
  const { entries, fetchEntries, deleteEntry, toggleFavorite, loading } = useJournalStore();
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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
        <h1 className="text-2xl font-bold text-text-primary">Journal</h1>
        <div className="flex gap-1 bg-surface rounded-lg p-1">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              filter === 'all' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('favorites')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              filter === 'favorites' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Favorites
          </button>
        </div>
      </div>

      {loading && entries.length === 0 && (
        <div className="text-center py-12 text-text-secondary">Loading entries...</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <p className="text-4xl">📖</p>
          <p className="text-text-secondary">
            {filter === 'favorites' ? 'No favorites yet.' : 'No entries yet. Start journaling!'}
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
                  {new Date(entry.created_at).toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </span>
                <span className="text-xs px-2 py-0.5 bg-surface-elevated rounded-md text-text-secondary">
                  {ENTRY_TYPE_LABEL[entry.entry_type] || entry.entry_type}
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
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="px-2 py-1 text-xs text-text-secondary"
                    >
                      Cancel
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
    </div>
  );
}
