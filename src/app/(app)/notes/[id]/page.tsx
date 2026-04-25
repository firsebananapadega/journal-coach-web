'use client';

// /notes/[id] — view a structure note with its linked journal entries.
// Edit title/description inline. Tap an entry chip to open it. Remove
// an entry from the note via the small (×) on each chip. Delete the
// whole note from the gear menu (just a button — no menu yet).

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useStructureNotesStore } from '@/stores/structureNotesStore';
import { useJournalStore } from '@/stores/journalStore';
import { useUiStore } from '@/stores/uiStore';
import { getLocale } from '@/lib/language';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';

function formatEntryDate(iso: string): string {
  const locale = getLocale() === 'es' ? 'es-MX' : 'en-US';
  return new Date(iso).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function StructureNoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const notes = useStructureNotesStore((s) => s.notes);
  const fetchNotes = useStructureNotesStore((s) => s.fetchNotes);
  const hasFetched = useStructureNotesStore((s) => s.hasFetched);
  const updateNote = useStructureNotesStore((s) => s.updateNote);
  const deleteNote = useStructureNotesStore((s) => s.deleteNote);
  const toggleEntry = useStructureNotesStore((s) => s.toggleEntry);

  const entries = useJournalStore((s) => s.entries);
  const fetchEntries = useJournalStore((s) => s.fetchEntries);
  const hasFetchedEntries = useJournalStore((s) => s.hasFetched);

  const showToast = useUiStore((s) => s.showToast);

  useEffect(() => {
    if (!hasFetched) fetchNotes().catch(() => {});
    if (!hasFetchedEntries) fetchEntries().catch(() => {});
  }, [hasFetched, hasFetchedEntries, fetchNotes, fetchEntries]);

  const note = notes.find((n) => n.id === id) ?? null;

  const [editingMeta, setEditingMeta] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Pre-fill drafts when entering edit mode.
  useEffect(() => {
    if (editingMeta && note) {
      setTitleDraft(note.title);
      setDescDraft(note.description ?? '');
    }
  }, [editingMeta, note]);

  // Linked entries — preserve the order in entry_ids (so the user
  // can curate sequence later) but enrich each with the entry data.
  const linkedEntries = useMemo(() => {
    if (!note) return [];
    return note.entry_ids
      .map((eid) => entries.find((e) => e.id === eid))
      .filter((e): e is NonNullable<typeof e> => !!e);
  }, [note, entries]);

  const handleSaveMeta = async () => {
    if (!note) return;
    const t0 = titleDraft.trim();
    if (!t0) return;
    setSavingMeta(true);
    try {
      await updateNote(note.id, {
        title: t0,
        description: descDraft.trim() || null,
      });
      setEditingMeta(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSavingMeta(false);
    }
  };

  const handleDelete = async () => {
    if (!note) return;
    try {
      await deleteNote(note.id);
      router.replace('/notes');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  if (!hasFetched) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-text-tertiary animate-pulse">{t('common.loading')}</p>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-16 pb-24 space-y-4">
        <button onClick={() => router.push('/notes')} className="text-sm text-primary">
          ← Notes
        </button>
        <p className="text-sm text-text-secondary">This note couldn&apos;t be found.</p>
      </div>
    );
  }

  return (
    <motion.article
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: 6 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      className="max-w-lg mx-auto px-5 pt-16 pb-24 space-y-5"
    >
      <Link
        href="/notes"
        className="text-sm text-text-tertiary hover:text-text-secondary inline-block"
      >
        ← Notes
      </Link>

      {editingMeta ? (
        <div className="space-y-3 bg-surface-elevated border border-border rounded-2xl p-4">
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            placeholder="Theme title"
            className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-base font-semibold text-text-primary outline-none focus:border-primary"
          />
          <textarea
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            rows={3}
            placeholder="What this note is about (optional)"
            className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-text-primary outline-none focus:border-primary resize-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingMeta(false)}
              className="text-xs text-text-tertiary px-3 py-1.5"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSaveMeta}
              disabled={!titleDraft.trim() || savingMeta}
              className="text-xs font-semibold text-white bg-primary rounded-full px-3 py-1.5 disabled:opacity-40"
            >
              {savingMeta ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      ) : (
        <header className="space-y-2">
          <button
            onClick={() => setEditingMeta(true)}
            className="text-left w-full"
          >
            <h1 className="text-2xl font-bold text-text-primary">✦ {note.title}</h1>
            {note.description && (
              <p className="text-sm text-text-secondary mt-1 leading-relaxed">
                {note.description}
              </p>
            )}
            <p className="text-[11px] text-text-tertiary mt-1.5">Tap to edit</p>
          </button>
        </header>
      )}

      <section className="space-y-2">
        <p className="text-[11px] uppercase tracking-widest text-text-tertiary font-semibold">
          {linkedEntries.length} {linkedEntries.length === 1 ? 'entry' : 'entries'}
        </p>
        {linkedEntries.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-border p-6 text-center space-y-2">
            <p className="text-sm text-text-primary font-semibold">No entries yet.</p>
            <p className="text-xs text-text-tertiary">
              From any entry, tap &quot;Add to a note&quot; to link it here.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {linkedEntries.map((e) => {
              const preview =
                (e.content_structured ?? '').trim() ||
                (e.content_text ?? '').trim() ||
                '(no content)';
              return (
                <li key={e.id} className="relative">
                  <Link
                    href={`/entry/${e.id}`}
                    className="block bg-surface-elevated border border-border rounded-2xl p-4 pr-12 hover:border-primary/60 transition-colors"
                  >
                    <p className="text-[10px] uppercase tracking-widest text-text-tertiary font-semibold">
                      {formatEntryDate(e.created_at)}
                    </p>
                    <p className="text-sm text-text-primary mt-1 line-clamp-2 leading-snug">
                      {preview.slice(0, 200)}
                    </p>
                  </Link>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      toggleEntry(note.id, e.id).catch((err) =>
                        showToast(
                          err instanceof Error ? err.message : 'Could not unlink',
                          'error',
                        ),
                      );
                    }}
                    aria-label="Remove from this note"
                    className="absolute top-3 right-3 w-7 h-7 rounded-full bg-surface border border-border flex items-center justify-center text-text-tertiary hover:text-error hover:border-error transition-colors"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="pt-4 border-t border-border">
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-error hover:bg-error/10 transition-colors"
          >
            Delete this note
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-text-secondary text-center">
              The note is removed; the entries themselves are not deleted.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-secondary text-sm font-semibold"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex-1 py-2.5 rounded-xl bg-error text-white text-sm font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </section>
    </motion.article>
  );
}
