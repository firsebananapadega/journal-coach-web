'use client';

// /notes — list of structure notes (Zettelkasten-style themes that
// group multiple journal entries). Tapping a note opens its detail
// view. The "+" button at the top creates a new one inline.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useStructureNotesStore } from '@/stores/structureNotesStore';
import { useUiStore } from '@/stores/uiStore';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';

export default function StructureNotesIndexPage() {
  const router = useRouter();
  const notes = useStructureNotesStore((s) => s.notes);
  const fetchNotes = useStructureNotesStore((s) => s.fetchNotes);
  const hasFetched = useStructureNotesStore((s) => s.hasFetched);
  const loading = useStructureNotesStore((s) => s.loading);
  const createNote = useStructureNotesStore((s) => s.createNote);
  const showToast = useUiStore((s) => s.showToast);

  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasFetched) fetchNotes().catch(() => {});
  }, [hasFetched, fetchNotes]);

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      const created = await createNote({ title });
      setNewTitle('');
      setCreating(false);
      router.push(`/notes/${created.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create note', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-24 space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-text-tertiary hover:text-text-secondary"
          aria-label={t('common.back')}
        >
          ←
        </button>
        <h1 className="text-2xl font-bold text-text-primary">Structure notes</h1>
      </div>
      <p className="text-sm text-text-secondary leading-relaxed">
        Group entries by a theme you&apos;re tracking. Add the same entry to multiple notes — they&apos;re a way to draw lines across your journal without changing the entries themselves.
      </p>

      {loading && notes.length === 0 && (
        <p className="text-sm text-text-tertiary animate-pulse">{t('common.loading')}</p>
      )}

      <ul className="space-y-2">
        {notes.map((n) => (
          <motion.li
            key={n.id}
            initial={prefersReducedMotion ? undefined : { opacity: 0, y: 4 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          >
            <Link
              href={`/notes/${n.id}`}
              className="block bg-surface-elevated border border-border rounded-2xl p-4 hover:border-primary/60 transition-colors"
            >
              <p className="text-sm font-semibold text-text-primary">✦ {n.title}</p>
              {n.description && (
                <p className="text-[13px] text-text-secondary mt-1 leading-snug line-clamp-2">
                  {n.description}
                </p>
              )}
              <p className="text-[11px] text-text-tertiary mt-1.5">
                {n.entry_ids.length} {n.entry_ids.length === 1 ? 'entry' : 'entries'}
              </p>
            </Link>
          </motion.li>
        ))}
      </ul>

      {!creating ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-2 w-full py-3 rounded-2xl border border-dashed border-border text-sm text-text-tertiary hover:text-text-secondary hover:border-primary/50 transition-colors"
        >
          + Start a structure note
        </button>
      ) : (
        <div className="mt-2 bg-surface-elevated border border-border rounded-2xl p-3 space-y-2">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') {
                setCreating(false);
                setNewTitle('');
              }
            }}
            placeholder="Theme — e.g. Wrestling with rest"
            className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-text-primary outline-none focus:border-primary"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setNewTitle('');
              }}
              className="text-xs text-text-tertiary px-3 py-1.5"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newTitle.trim() || busy}
              className="text-xs font-semibold text-white bg-primary rounded-full px-3 py-1.5 disabled:opacity-40"
            >
              {busy ? t('common.saving') : 'Create'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
