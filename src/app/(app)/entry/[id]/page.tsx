'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useJournalStore, type JournalEntry } from '@/stores/journalStore';

const ENTRY_TYPE_LABEL: Record<string, string> = {
  voice: '🎙️ Voice Entry',
  guided: '💬 Guided Session',
  template: '📋 Template',
  freeform: '✏️ Free Write',
};

export default function EntryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { fetchEntryById, toggleFavorite } = useJournalStore();
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchEntryById(id).then((e) => {
        setEntry(e);
        setLoading(false);
      });
    }
  }, [id, fetchEntryById]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-primary">Loading...</div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-text-secondary">Entry not found.</p>
        <button onClick={() => router.back()} className="text-primary">Go back</button>
      </div>
    );
  }

  // Parse guided session exchanges from metadata
  const exchanges = (entry.metadata as Record<string, unknown>)?.exchanges as Array<{ question: string; answer: string }> | undefined;

  return (
    <div className="max-w-lg mx-auto px-5 pt-8 pb-24 space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="text-text-secondary hover:text-text-primary text-sm">
          &larr; Back
        </button>
        <button
          onClick={async () => {
            await toggleFavorite(entry.id);
            const updated = await fetchEntryById(entry.id);
            if (updated) setEntry(updated);
          }}
          className="text-xl hover:scale-110 transition-transform"
        >
          {entry.is_favorite ? '⭐' : '☆'}
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-2 py-0.5 bg-surface-elevated rounded-md text-text-secondary">
            {ENTRY_TYPE_LABEL[entry.entry_type] || entry.entry_type}
          </span>
          {entry.mood_label && (
            <span className="text-xs text-text-secondary capitalize">{entry.mood_label}</span>
          )}
          {entry.word_count && (
            <span className="text-xs text-text-tertiary">{entry.word_count} words</span>
          )}
        </div>
        <p className="text-xs text-text-tertiary">
          {new Date(entry.created_at).toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
          })}
        </p>
      </div>

      {/* Guided session: show Q&A format */}
      {exchanges && exchanges.length > 0 ? (
        <div className="space-y-4">
          {exchanges.map((ex, i) => (
            <div key={i} className="space-y-2">
              <div className="bg-[#1A2B22] rounded-2xl p-4">
                <p className="text-xs text-primary font-bold uppercase tracking-wider mb-1">Guide</p>
                <p className="text-[15px] text-[#F0F0F5] leading-relaxed">{ex.question}</p>
              </div>
              <div className="bg-[#222725] rounded-2xl p-4 ml-4">
                <p className="text-[15px] text-text-primary leading-relaxed">{ex.answer}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="prose prose-invert max-w-none">
          <p className="text-[15px] text-text-primary leading-relaxed whitespace-pre-wrap">
            {entry.content_text || 'No content'}
          </p>
        </div>
      )}
    </div>
  );
}
