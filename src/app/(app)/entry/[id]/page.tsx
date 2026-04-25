'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useJournalStore, type JournalEntry } from '@/stores/journalStore';
import { useStructureNotesStore } from '@/stores/structureNotesStore';
import { MoodSelector } from '@/components/MoodSelector';
import { t } from '@/lib/translations';
import { getLanguage } from '@/lib/language';
import { getStructured } from '@/lib/structureEntry';

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

  // Structure notes — for the "Add to a note" affordance below the
  // entry meta. Lists user's existing notes; toggle membership in
  // place. New-note creation is handled via the /notes route to
  // keep this picker scoped.
  const structureNotes = useStructureNotesStore((s) => s.notes);
  const fetchStructureNotes = useStructureNotesStore((s) => s.fetchNotes);
  const hasFetchedStructureNotes = useStructureNotesStore((s) => s.hasFetched);
  const toggleNoteEntry = useStructureNotesStore((s) => s.toggleEntry);
  const createStructureNote = useStructureNotesStore((s) => s.createNote);
  useEffect(() => {
    if (!hasFetchedStructureNotes) fetchStructureNotes().catch(() => {});
  }, [hasFetchedStructureNotes, fetchStructureNotes]);
  const [notesPickerOpen, setNotesPickerOpen] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editMoodScore, setEditMoodScore] = useState<number | null>(null);
  const [editMoodLabel, setEditMoodLabel] = useState<string | null>(null);
  const [editExchanges, setEditExchanges] = useState<Exchange[]>([]);
  const [editQAPairs, setEditQAPairs] = useState<{ question: string; answer: string }[]>([]);
  // Pulse entry fields — the three prompt answers live in metadata
  // (intention is morning; wentRight + doneBetter are evening). We
  // edit them directly instead of going through the Raw/Structured
  // markdown toggle so typo fixes don't turn into a full rewrite.
  const [editPulse, setEditPulse] = useState<{ intention: string; wentRight: string; doneBetter: string }>({
    intention: '',
    wentRight: '',
    doneBetter: '',
  });
  const [saving, setSaving] = useState(false);

  // Refs for the various edit-mode textareas. `primaryEditRef` is the
  // freeform/voice/pulse-intention textarea — the most common entry
  // surface, so tap-to-edit focuses this one. The other refs help us
  // focus a specific section's textarea on tap (guided exchange
  // index, template QA index, pulse field).
  const primaryEditRef = useRef<HTMLTextAreaElement | null>(null);

  /** Drop into edit mode and focus the relevant textarea on the next
   *  frame. Used everywhere the rendered body is tappable. */
  const enterEditMode = () => {
    // Force structured→raw before editing. The structured view is
    // auto-generated from the raw text, so the editable source-of-
    // truth is the raw transcript. Keeps "what I tap is what I edit."
    setViewMode('raw');
    startEditing();
    requestAnimationFrame(() => {
      primaryEditRef.current?.focus();
    });
  };

  // Raw / Structured view toggle (freeform/voice entries only).
  // Default is Structured. Structuring normally happens in the
  // background the moment the entry is created (journalStore.createEntry)
  // and lands in `content_structured`. We also lazily backfill here if
  // the column is still null — covers entries that pre-date the
  // feature, or background calls that failed or were cut short by
  // navigation before they could persist.
  const [viewMode, setViewMode] = useState<'raw' | 'structured'>('structured');
  const [structuring, setStructuring] = useState(false);
  const structuredText = (entry?.content_structured ?? '').trim() || null;

  useEffect(() => {
    if (id) {
      fetchEntryById(id).then((e) => {
        setEntry(e);
        setLoading(false);
      });
    }
  }, [id, fetchEntryById]);

  // Lazy backfill: if we have raw text but no structured version yet,
  // generate one now so the Structured tab isn't silently empty.
  useEffect(() => {
    if (!entry) return;
    if (entry.entry_type === 'pulse' || entry.entry_type === 'guided' || entry.entry_type === 'template') return;
    const hasRaw = !!entry.content_text && entry.content_text.trim().length > 5;
    const hasStructured = !!entry.content_structured && entry.content_structured.trim().length > 0;
    if (!hasRaw || hasStructured) return;
    let cancelled = false;
    setStructuring(true);
    (async () => {
      try {
        const res = await getStructured({
          id: entry.id,
          content_text: entry.content_text,
          content_structured: entry.content_structured,
        });
        if (cancelled) return;
        setEntry((prev) =>
          prev ? { ...prev, content_structured: res.text, structured_generated_at: new Date().toISOString() } : prev,
        );
      } catch {
        // Fall through — user can still read raw text.
      } finally {
        if (!cancelled) setStructuring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry]);

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
    } else if (entry.entry_type === 'pulse') {
      const meta = (entry.metadata ?? {}) as Record<string, unknown>;
      setEditPulse({
        intention: typeof meta.intention === 'string' ? meta.intention : '',
        wentRight: typeof meta.wentRight === 'string' ? meta.wentRight : '',
        doneBetter: typeof meta.doneBetter === 'string' ? meta.doneBetter : '',
      });
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
    } else if (entry.entry_type === 'pulse') {
      // Pulse entry — the three prompt answers live in metadata. We
      // merge the edited values in so body/mind scores + pulseMode
      // stay intact. word_count is recomputed from whichever prompts
      // apply to this pulse's mode.
      const prevMeta = (entry.metadata ?? {}) as Record<string, unknown>;
      const trimmed = {
        intention: editPulse.intention.trim(),
        wentRight: editPulse.wentRight.trim(),
        doneBetter: editPulse.doneBetter.trim(),
      };
      updates.metadata = { ...prevMeta, ...trimmed };
      updates.word_count = [trimmed.intention, trimmed.wentRight, trimmed.doneBetter]
        .filter(Boolean)
        .join(' ')
        .split(/\s+/)
        .filter(Boolean).length;
      // Keep content_text null for pulses — the meta fields are the
      // source of truth. If something leaked earlier, don't resurface it.
      updates.content_text = null;
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
  const isPulse = entry.entry_type === 'pulse';
  const pulseMeta = (entry.metadata ?? {}) as Record<string, unknown>;
  const pulseMode: 'morning' | 'evening' | null =
    pulseMeta.pulseMode === 'morning' || pulseMeta.pulseMode === 'evening'
      ? (pulseMeta.pulseMode as 'morning' | 'evening')
      : null;

  return (
    // Parent (app) layout locks `/entry/*` to h-[100dvh] + overflow-hidden
    // (see app/(app)/layout.tsx — prevents iOS from panning the document
    // when an input is focused). We give this page its own scroll
    // container so long entries can still pan up, and leave extra
    // bottom padding so the user can scroll past the last line.
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="max-w-lg w-full mx-auto px-5 pt-8 pb-[100vh] space-y-6">
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

        {/* Structure-note picker — shows which user-defined themes
            this entry is part of and lets the user toggle/Create.
            Compact: just chips for already-linked notes + a small
            "Add to a note" button that expands the full picker.
            New-note creation lives here (tiny inline input) so users
            don't have to bounce to /notes. */}
        {!editing && (
          <div className="space-y-1.5 pt-1" data-no-tap>
            <div className="flex items-center gap-1.5 flex-wrap">
              {structureNotes
                .filter((n) => n.entry_ids.includes(entry.id))
                .map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() =>
                      toggleNoteEntry(n.id, entry.id).catch(() => {})
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary text-[11px] font-medium rounded-full hover:bg-primary/20 transition-colors"
                    title="Tap to remove from this note"
                  >
                    <span aria-hidden>✦</span> {n.title} <span className="text-text-tertiary">×</span>
                  </button>
                ))}
              <button
                type="button"
                onClick={() => setNotesPickerOpen((o) => !o)}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface border border-border text-text-secondary text-[11px] font-medium rounded-full hover:border-primary/60 hover:text-text-primary transition-colors"
              >
                {notesPickerOpen ? 'Done' : '+ Add to a note'}
              </button>
            </div>
            {notesPickerOpen && (
              <div className="mt-2 bg-surface-elevated border border-border rounded-2xl p-3 space-y-2">
                {structureNotes.filter((n) => !n.entry_ids.includes(entry.id)).length === 0 && structureNotes.length > 0 && (
                  <p className="text-xs text-text-tertiary">
                    This entry is in every note you have. Create a new one below.
                  </p>
                )}
                {structureNotes
                  .filter((n) => !n.entry_ids.includes(entry.id))
                  .map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        toggleNoteEntry(n.id, entry.id).catch(() => {});
                      }}
                      className="w-full flex items-center justify-between text-left px-3 py-2 rounded-xl bg-surface border border-border hover:border-primary/60 transition-colors"
                    >
                      <span className="text-sm text-text-primary">✦ {n.title}</span>
                      <span className="text-xs text-text-tertiary">+</span>
                    </button>
                  ))}
                {/* Inline create */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    value={newNoteTitle}
                    onChange={(e) => setNewNoteTitle(e.target.value)}
                    placeholder="New note — e.g. Wrestling with rest"
                    className="flex-1 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-text-primary outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    disabled={!newNoteTitle.trim()}
                    onClick={async () => {
                      const title = newNoteTitle.trim();
                      if (!title) return;
                      try {
                        const created = await createStructureNote({ title });
                        await toggleNoteEntry(created.id, entry.id);
                        setNewNoteTitle('');
                      } catch {
                        /* silent */
                      }
                    }}
                    className="text-xs font-semibold text-white bg-primary rounded-full px-3 py-2 disabled:opacity-40"
                  >
                    Create
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content — view or edit */}
      {editing ? (
        <div className="space-y-4">
          {isPulse ? (
            <PulseEditor
              mode={pulseMode}
              value={editPulse}
              onChange={setEditPulse}
              bodyLabel={typeof pulseMeta.body_label === 'string' ? pulseMeta.body_label : null}
              mindLabel={typeof pulseMeta.mind_label === 'string' ? pulseMeta.mind_label : null}
            />
          ) : isGuided ? (
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
              ref={primaryEditRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-[15px] text-text-primary leading-relaxed resize-none outline-none focus:border-primary min-h-[200px]"
            />
          )}

          {/* Editable mood — pulse has its own body/mind system, so
              the generic mood selector is suppressed there. */}
          {!isPulse && (
            <MoodSelector
              value={editMoodScore}
              onChange={(score, label) => { setEditMoodScore(score); setEditMoodLabel(label); }}
            />
          )}
        </div>
      ) : (
        // View mode — every rendered body is tappable to enter edit
        // mode. Tapping anywhere on the entry body drops the user
        // straight into the textarea with the keyboard up; no need
        // to hunt for the "Edit" button. The Edit button stays in
        // the header as a visible affordance for users who don't
        // realize the body itself is tappable.
        <>
          {isPulse ? (
            <div
              role="button"
              tabIndex={0}
              onClick={enterEditMode}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  enterEditMode();
                }
              }}
              className="text-left cursor-text rounded-2xl"
              aria-label="Tap to edit"
            >
              <PulseView
                mode={pulseMode}
                intention={typeof pulseMeta.intention === 'string' ? pulseMeta.intention : ''}
                wentRight={typeof pulseMeta.wentRight === 'string' ? pulseMeta.wentRight : ''}
                doneBetter={typeof pulseMeta.doneBetter === 'string' ? pulseMeta.doneBetter : ''}
                bodyLabel={typeof pulseMeta.body_label === 'string' ? pulseMeta.body_label : null}
                mindLabel={typeof pulseMeta.mind_label === 'string' ? pulseMeta.mind_label : null}
              />
            </div>
          ) : isGuided ? (
            <div
              role="button"
              tabIndex={0}
              onClick={enterEditMode}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  enterEditMode();
                }
              }}
              className="space-y-4 text-left cursor-text"
              aria-label="Tap to edit"
            >
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

              <div
                role="button"
                tabIndex={0}
                onClick={enterEditMode}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    enterEditMode();
                  }
                }}
                className="max-w-none text-left cursor-text"
                aria-label="Tap to edit"
              >
                {viewMode === 'structured' && structuredText ? (
                  <div className="text-[15px] text-text-primary leading-relaxed space-y-3
                                  [&_p]:leading-relaxed
                                  [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1
                                  [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1
                                  [&_li]:leading-relaxed
                                  [&_strong]:font-semibold [&_strong]:text-text-primary
                                  [&_em]:italic [&_em]:text-text-secondary
                                  [&_hr]:my-5 [&_hr]:border-border
                                  [&_a]:text-primary [&_a]:underline
                                  [&_code]:text-sm [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
                                  [&_blockquote]:pl-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:text-text-secondary [&_blockquote]:italic">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {structuredText}
                    </ReactMarkdown>
                  </div>
                ) : viewMode === 'structured' && structuring ? (
                  <p className="text-[13px] text-text-tertiary italic">Polishing…</p>
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
    </div>
  );
}

// ── Pulse helpers ─────────────────────────────────────────────────
// Inline to keep all the edit-state plumbing in one file. Pulse
// entries carry their content in `metadata` (intention / wentRight /
// doneBetter + body/mind labels) rather than `content_text`, so they
// don't fit the Raw/Structured toggle — they need their own renderer.

const BODY_EMOJI: Record<string, string> = {
  heavy: '😴', tired: '🥱', steady: '🙂', strong: '💪', vibrant: '🔥',
};
const MIND_EMOJI: Record<string, string> = {
  foggy: '🌫️', hazy: '😶‍🌫️', steady: '🧐', clear: '💡', sharp: '✨',
};

function PulseChips({ bodyLabel, mindLabel }: { bodyLabel: string | null; mindLabel: string | null }) {
  if (!bodyLabel && !mindLabel) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {bodyLabel && (
        <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-surface border border-border text-text-secondary">
          <span aria-hidden>{BODY_EMOJI[bodyLabel] ?? '•'}</span>
          <span className="font-medium text-text-primary capitalize">{bodyLabel}</span>
          <span className="text-text-tertiary text-[10px] uppercase tracking-wider">Body</span>
        </span>
      )}
      {mindLabel && (
        <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-surface border border-border text-text-secondary">
          <span aria-hidden>{MIND_EMOJI[mindLabel] ?? '•'}</span>
          <span className="font-medium text-text-primary capitalize">{mindLabel}</span>
          <span className="text-text-tertiary text-[10px] uppercase tracking-wider">Mind</span>
        </span>
      )}
    </div>
  );
}

function PulseView({
  mode,
  intention,
  wentRight,
  doneBetter,
  bodyLabel,
  mindLabel,
}: {
  mode: 'morning' | 'evening' | null;
  intention: string;
  wentRight: string;
  doneBetter: string;
  bodyLabel: string | null;
  mindLabel: string | null;
}) {
  const modeIcon = mode === 'evening' ? '🌙' : mode === 'morning' ? '☀️' : '•';
  const modeLabel = mode === 'evening' ? 'Evening pulse' : mode === 'morning' ? 'Morning pulse' : 'Pulse';
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xl" aria-hidden>{modeIcon}</span>
        <span className="text-[11px] uppercase tracking-widest text-text-tertiary font-semibold">{modeLabel}</span>
      </div>
      <PulseChips bodyLabel={bodyLabel} mindLabel={mindLabel} />
      {mode === 'morning' && intention && (
        <PulseSection label="Intention" accent="text-amber-500">{intention}</PulseSection>
      )}
      {mode === 'evening' && wentRight && (
        <PulseSection label="Went right" accent="text-emerald-500">{wentRight}</PulseSection>
      )}
      {mode === 'evening' && doneBetter && (
        <PulseSection label="Done better" accent="text-rose-400">{doneBetter}</PulseSection>
      )}
      {/* Legacy pulse entries with no pulseMode — show all non-empty
          fields so nothing is lost. */}
      {!mode && (
        <>
          {intention && <PulseSection label="Intention" accent="text-amber-500">{intention}</PulseSection>}
          {wentRight && <PulseSection label="Went right" accent="text-emerald-500">{wentRight}</PulseSection>}
          {doneBetter && <PulseSection label="Done better" accent="text-rose-400">{doneBetter}</PulseSection>}
        </>
      )}
    </div>
  );
}

function PulseSection({ label, accent, children }: { label: string; accent: string; children: React.ReactNode }) {
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-widest font-semibold mb-1 ${accent}`}>{label}</p>
      <p className="text-[15px] leading-relaxed text-text-primary whitespace-pre-wrap">{children}</p>
    </div>
  );
}

function PulseEditor({
  mode,
  value,
  onChange,
  bodyLabel,
  mindLabel,
}: {
  mode: 'morning' | 'evening' | null;
  value: { intention: string; wentRight: string; doneBetter: string };
  onChange: (next: { intention: string; wentRight: string; doneBetter: string }) => void;
  bodyLabel: string | null;
  mindLabel: string | null;
}) {
  const modeIcon = mode === 'evening' ? '🌙' : mode === 'morning' ? '☀️' : '•';
  const modeLabel = mode === 'evening' ? 'Evening pulse' : mode === 'morning' ? 'Morning pulse' : 'Pulse';
  // Which fields to show as editable — matches the prompt the user
  // originally answered. Legacy (no mode) entries show all three so
  // the user can clean up any field.
  const showIntention = mode === 'morning' || mode === null;
  const showWent = mode === 'evening' || mode === null;
  const showDone = mode === 'evening' || mode === null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xl" aria-hidden>{modeIcon}</span>
        <span className="text-[11px] uppercase tracking-widest text-text-tertiary font-semibold">{modeLabel}</span>
      </div>
      <PulseChips bodyLabel={bodyLabel} mindLabel={mindLabel} />
      {showIntention && (
        <PulseField
          label="Intention"
          accent="text-amber-500"
          value={value.intention}
          onChange={(v) => onChange({ ...value, intention: v })}
        />
      )}
      {showWent && (
        <PulseField
          label="Went right"
          accent="text-emerald-500"
          value={value.wentRight}
          onChange={(v) => onChange({ ...value, wentRight: v })}
        />
      )}
      {showDone && (
        <PulseField
          label="Done better"
          accent="text-rose-400"
          value={value.doneBetter}
          onChange={(v) => onChange({ ...value, doneBetter: v })}
        />
      )}
    </div>
  );
}

function PulseField({
  label,
  accent,
  value,
  onChange,
}: {
  label: string;
  accent: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className={`block text-[10px] uppercase tracking-widest font-semibold mb-1 ${accent}`}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-[15px] text-text-primary leading-relaxed resize-none outline-none focus:border-primary min-h-[80px]"
      />
    </div>
  );
}
