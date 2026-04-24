'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useJournalStore, type JournalEntry } from '@/stores/journalStore';
import { MoodSelector } from '@/components/MoodSelector';
import { getStructured } from '@/lib/structureEntry';
import { t } from '@/lib/translations';
import { getLanguage } from '@/lib/language';

const ENTRY_TYPE_LABEL: Record<string, string> = {
  voice: 'entry.typeVoice',
  guided: 'entry.typeGuided',
  template: 'entry.typeTemplate',
  freeform: 'entry.typeFreeform',
};

interface Exchange {
  question: string;
  answer: string;
  timestamp?: string;
}

function parseQAPairs(text: string): { question: string; answer: string }[] {
  const pairs: { question: string; answer: string }[] = [];
  const blocks = text.split(/\n\nQ: /);
  for (const block of blocks) {
    const cleaned = block.startsWith('Q: ') ? block.slice(3) : block;
    const parts = cleaned.split('\nA: ');
    if (parts.length >= 2) {
      pairs.push({ question: parts[0].trim(), answer: parts.slice(1).join('\nA: ').trim() });
    }
  }
  return pairs;
}

function rebuildContentText(pairs: { question: string; answer: string }[]): string {
  return pairs.map((p) => `Q: ${p.question}\nA: ${p.answer}`).join('\n\n');
}

export default function EntryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { fetchEntryById, toggleFavorite, updateEntry } = useJournalStore();
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editMoodScore, setEditMoodScore] = useState<number | null>(null);
  const [editMoodLabel, setEditMoodLabel] = useState<string | null>(null);
  const [editExchanges, setEditExchanges] = useState<Exchange[]>([]);
  const [editQAPairs, setEditQAPairs] = useState<{ question: string; answer: string }[]>([]);
  const [saving, setSaving] = useState(false);

  // Raw / Structured view toggle (freeform/voice entries only).
  // Default to 'structured' per user preference — they see the
  // polished version first, toggle to raw to edit.
  const [viewMode, setViewMode] = useState<'raw' | 'structured'>('structured');
  const [structuredText, setStructuredText] = useState<string | null>(null);
  const [structuring, setStructuring] = useState(false);

  useEffect(() => {
    if (id) {
      fetchEntryById(id).then((e) => {
        setEntry(e);
        setLoading(false);
      });
    }
  }, [id, fetchEntryById]);

  // Lazy-load structured text on first switch to the Structured tab.
  // Uses the cache column directly if already populated.
  useEffect(() => {
    if (!entry) return;
    if (viewMode !== 'structured') return;
    if (structuredText) return;
    if (entry.content_structured && entry.content_structured.trim()) {
      setStructuredText(entry.content_structured);
      return;
    }
    if (!entry.content_text || !entry.content_text.trim()) return;
    let cancelled = false;
    setStructuring(true);
    (async () => {
      try {
        const res = await getStructured({
          id: entry.id,
          content_text: entry.content_text,
          content_structured: entry.content_structured,
        });
        if (!cancelled) setStructuredText(res.text);
      } catch {
        // Leave structuredText null; UI falls back to raw display.
      } finally {
        if (!cancelled) setStructuring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry, viewMode, structuredText]);

  const startEditing = () => {
    if (!entry) return;
    setEditText(entry.content_text || '');
    setEditTitle(entry.title || '');
    setEditMoodScore(entry.mood_score);
    setEditMoodLabel(entry.mood_label);

    // Parse exchanges for guided entries
    const exchanges = (entry.metadata as Record<string, unknown>)?.exchanges as Exchange[] | undefined;
    if (exchanges && exchanges.length > 0) {
      setEditExchanges(exchanges.map((e) => ({ ...e })));
    } else if (entry.entry_type === 'template' && entry.content_text) {
      // Parse Q&A from content_text for template entries
      setEditQAPairs(parseQAPairs(entry.content_text));
    }

    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    if (!entry) return;
    setSaving(true);

    const updates: Partial<JournalEntry> = {
      title: editTitle || null,
      mood_score: editMoodScore,
      mood_label: editMoodLabel,
    };

    const exchanges = (entry.metadata as Record<string, unknown>)?.exchanges as Exchange[] | undefined;

    if (exchanges && exchanges.length > 0) {
      // Guided entry — update exchanges in metadata AND rebuild content_text
      const contentParts = editExchanges.map((e) => `Q: ${e.question}\nA: ${e.answer}`);
      updates.content_text = contentParts.join('\n\n');
      updates.metadata = {
        ...(entry.metadata as Record<string, unknown>),
        exchanges: editExchanges,
      };
      updates.word_count = editExchanges.map((e) => e.answer).join(' ').split(/\s+/).filter(Boolean).length;
    } else if (entry.entry_type === 'template' && editQAPairs.length > 0) {
      // Template entry — rebuild content_text from edited Q&A pairs
      updates.content_text = rebuildContentText(editQAPairs);
      updates.word_count = editQAPairs.map((p) => p.answer).join(' ').split(/\s+/).filter(Boolean).length;
    } else {
      // Voice / freeform — direct text edit
      updates.content_text = editText;
      updates.word_count = editText.split(/\s+/).filter(Boolean).length;
    }

    try {
      await updateEntry(entry.id, updates);
      const refreshed = await fetchEntryById(entry.id);
      if (refreshed) setEntry(refreshed);
      setEditing(false);
    } catch {
      // Stay in edit mode on error
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-primary">{t('common.loading')}</div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-text-secondary">{t('entry.notFound')}</p>
        <button onClick={() => router.back()} className="text-primary">{t('entry.goBack')}</button>
      </div>
    );
  }

  const exchanges = (entry.metadata as Record<string, unknown>)?.exchanges as Exchange[] | undefined;
  const isGuided = exchanges && exchanges.length > 0;
  const isTemplate = entry.entry_type === 'template' && !isGuided;

  return (
    <div className="max-w-lg mx-auto px-5 pt-8 pb-24 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="text-text-secondary hover:text-text-primary text-sm">
          &larr; {t('common.back')}
        </button>
        <div className="flex items-center gap-3">
          {!editing ? (
            <>
              <button
                onClick={startEditing}
                className="text-sm text-primary font-medium hover:underline"
              >
                {t('common.edit')}
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
            </>
          ) : (
            <>
              <button
                onClick={cancelEditing}
                className="text-sm text-text-secondary hover:text-text-primary"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-sm bg-primary text-white px-4 py-1.5 rounded-lg font-medium disabled:opacity-50"
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Meta info */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-2 py-0.5 bg-surface-elevated rounded-md text-text-secondary">
            {t(ENTRY_TYPE_LABEL[entry.entry_type]) || entry.entry_type}
          </span>
          {!editing && entry.mood_label && (
            <span className="text-xs text-text-secondary capitalize">{entry.mood_label}</span>
          )}
          {entry.word_count && (
            <span className="text-xs text-text-tertiary">{entry.word_count} {t('common.words')}</span>
          )}
        </div>

        {/* Editable title */}
        {editing ? (
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder={t('entry.titlePlaceholder')}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary outline-none focus:border-primary"
          />
        ) : entry.title ? (
          <p className="text-base font-semibold text-text-primary">{entry.title}</p>
        ) : null}

        <p className="text-xs text-text-tertiary">
          {new Date(entry.created_at).toLocaleDateString(getLanguage(), {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
          })}
        </p>
      </div>

      {/* Content — view or edit */}
      {editing ? (
        <div className="space-y-4">
          {isGuided ? (
            // Guided: edit each answer
            <div className="space-y-4">
              {editExchanges.map((ex, i) => (
                <div key={i} className="space-y-2">
                  <div className="bg-[#1A2B22] rounded-2xl p-4">
                    <p className="text-xs text-primary font-bold uppercase tracking-wider mb-1">{t('entry.guide')}</p>
                    <p className="text-[15px] text-[#F0F0F5] leading-relaxed">{ex.question}</p>
                  </div>
                  <textarea
                    value={ex.answer}
                    onChange={(e) => {
                      const updated = [...editExchanges];
                      updated[i] = { ...updated[i], answer: e.target.value };
                      setEditExchanges(updated);
                    }}
                    className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-[15px] text-text-primary leading-relaxed resize-none outline-none focus:border-primary min-h-[80px] ml-4"
                  />
                </div>
              ))}
            </div>
          ) : isTemplate ? (
            // Template: edit each answer
            <div className="space-y-4">
              {editQAPairs.map((pair, i) => (
                <div key={i} className="space-y-1">
                  <p className="text-xs text-text-tertiary font-medium">{pair.question}</p>
                  <textarea
                    value={pair.answer}
                    onChange={(e) => {
                      const updated = [...editQAPairs];
                      updated[i] = { ...updated[i], answer: e.target.value };
                      setEditQAPairs(updated);
                    }}
                    className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-[15px] text-text-primary leading-relaxed resize-none outline-none focus:border-primary min-h-[60px]"
                  />
                </div>
              ))}
            </div>
          ) : (
            // Voice / freeform: edit full text
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-[15px] text-text-primary leading-relaxed resize-none outline-none focus:border-primary min-h-[200px]"
            />
          )}

          {/* Editable mood */}
          <MoodSelector
            value={editMoodScore}
            onChange={(score, label) => { setEditMoodScore(score); setEditMoodLabel(label); }}
          />
        </div>
      ) : (
        // View mode
        <>
          {isGuided ? (
            <div className="space-y-4">
              {exchanges!.map((ex, i) => (
                <div key={i} className="space-y-2">
                  <div className="bg-[#1A2B22] rounded-2xl p-4">
                    <p className="text-xs text-primary font-bold uppercase tracking-wider mb-1">{t('entry.guide')}</p>
                    <p className="text-[15px] text-[#F0F0F5] leading-relaxed">{ex.question}</p>
                  </div>
                  <div className="bg-[#222725] rounded-2xl p-4 ml-4">
                    <p className="text-[15px] text-text-primary leading-relaxed">{ex.answer}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Raw / Structured segmented control. Default land
                  is Structured per user preference — toggle to Raw
                  to see the verbatim transcript or to edit. */}
              <div className="inline-flex text-[11px] font-semibold rounded-full bg-surface border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setViewMode('structured')}
                  className={`px-3 py-1 ${viewMode === 'structured' ? 'bg-primary text-white' : 'text-text-tertiary hover:text-text-secondary'}`}
                >
                  {t('entry.structured')}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('raw')}
                  className={`px-3 py-1 ${viewMode === 'raw' ? 'bg-primary text-white' : 'text-text-tertiary hover:text-text-secondary'}`}
                >
                  {t('entry.raw')}
                </button>
              </div>

              <div className="prose prose-invert max-w-none">
                {viewMode === 'structured' ? (
                  structuring && !structuredText ? (
                    <p className="text-[14px] text-text-tertiary italic">
                      {t('entry.structuring')}
                    </p>
                  ) : (
                    <p className="text-[15px] text-text-primary leading-relaxed whitespace-pre-wrap">
                      {(structuredText || entry.content_text || t('common.noContent'))}
                    </p>
                  )
                ) : (
                  <p className="text-[15px] text-text-primary leading-relaxed whitespace-pre-wrap">
                    {entry.content_text || t('common.noContent')}
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
