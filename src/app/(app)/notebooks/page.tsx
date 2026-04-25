'use client';

// /notebooks — the list view of all the user's notebooks. Each card
// shows the name, color indicator, entry count, and last-updated.
// Tapping a card routes to /notebooks/[slug] which shows the same
// book-page experience scoped to that notebook.

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useJournalStore } from '@/stores/journalStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { useUiStore } from '@/stores/uiStore';
import { t } from '@/lib/translations';
import { getLocale } from '@/lib/language';
import { prefersReducedMotion } from '@/lib/motionVariants';

function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const locale = getLocale() === 'es' ? 'es-MX' : 'en-US';
  const d = new Date(iso);
  const today = new Date();
  const diffDays = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return t('journal.today');
  if (diffDays === 1) return t('journal.yesterday');
  if (diffDays < 7) return `${diffDays} ${t('journal.daysAgo')}`;
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export default function NotebooksIndexPage() {
  const notebooks = useNotebookStore((s) => s.notebooks);
  const fetchNotebooks = useNotebookStore((s) => s.fetchNotebooks);
  const hasFetchedNotebooks = useNotebookStore((s) => s.hasFetched);
  const createNotebook = useNotebookStore((s) => s.createNotebook);

  const entries = useJournalStore((s) => s.entries);
  const fetchEntries = useJournalStore((s) => s.fetchEntries);
  const hasFetchedEntries = useJournalStore((s) => s.hasFetched);

  const showToast = useUiStore((s) => s.showToast);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasFetchedNotebooks) fetchNotebooks().catch(() => {});
    if (!hasFetchedEntries) fetchEntries().catch(() => {});
  }, [hasFetchedNotebooks, hasFetchedEntries, fetchNotebooks, fetchEntries]);

  // Compute per-notebook stats once per change.
  const stats = useMemo(() => {
    const m = new Map<string, { count: number; last: string | null }>();
    for (const e of entries) {
      if (!e.notebook_id) continue;
      const cur = m.get(e.notebook_id) ?? { count: 0, last: null };
      cur.count += 1;
      if (!cur.last || e.created_at > cur.last) cur.last = e.created_at;
      m.set(e.notebook_id, cur);
    }
    return m;
  }, [entries]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await createNotebook({ name });
      setNewName('');
      setCreating(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('common.error'), 'error');
    } finally {
      setBusy(false);
    }
  }, [newName, busy, createNotebook, showToast]);

  return (
    <div className="relative bg-bg">
      <div
        aria-hidden
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[80vmin] h-[80vmin] rounded-full blur-3xl pointer-events-none opacity-40"
        style={{ background: 'var(--theme-primary-glow)' }}
      />

      <div className="relative z-10 max-w-md mx-auto px-5 pt-16 pb-24 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            {t('notebooks.title')}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {t('notebooks.subtitle')}
          </p>
        </div>

        <ul className="space-y-2">
          {notebooks.map((n) => {
            const s = stats.get(n.id);
            const count = s?.count ?? 0;
            const last = formatRelative(s?.last ?? null);
            return (
              <motion.li
                key={n.id}
                initial={prefersReducedMotion ? undefined : { opacity: 0, y: 4 }}
                animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
              >
                <Link
                  href={`/notebooks/${n.slug}`}
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-surface-elevated border border-border hover:border-primary/60 transition-colors"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${n.color}22`, color: n.color }}
                    aria-hidden
                  >
                    <NotebookGlyph icon={n.icon} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-text-primary truncate">
                        {n.name}
                      </p>
                      {n.kind === 'system' && (
                        <span className="text-[9px] font-semibold text-text-tertiary uppercase tracking-wider border border-border px-1 rounded">
                          {t('notebooks.systemTag')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-tertiary mt-0.5">
                      {count} {count === 1 ? t('notebooks.entry') : t('notebooks.entries')}
                      {last && ` · ${last}`}
                    </p>
                  </div>
                  <span className="text-text-tertiary text-sm">›</span>
                </Link>
              </motion.li>
            );
          })}
        </ul>

        {/* Cross-link to structure notes — they're a different
            organizational lens than notebooks (notebooks = where an
            entry lives; structure notes = themes that span multiple
            entries) so the discovery point belongs here. */}
        <Link
          href="/notes"
          className="mt-2 flex items-center justify-between rounded-2xl bg-surface-elevated border border-border px-4 py-3 hover:border-primary/60 transition-colors"
        >
          <div>
            <p className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
              <span aria-hidden>✦</span> Structure notes
            </p>
            <p className="text-xs text-text-tertiary mt-0.5 leading-snug">
              Themes that link entries across notebooks.
            </p>
          </div>
          <span className="text-text-tertiary text-sm">›</span>
        </Link>

        {/* + New notebook */}
        {!creating ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 w-full py-3 rounded-2xl border border-dashed border-border text-sm text-text-tertiary hover:text-text-secondary hover:border-primary/50 transition-colors"
          >
            + {t('notebooks.addNew')}
          </button>
        ) : (
          <div className="mt-4 bg-surface-elevated border border-border rounded-2xl p-3 space-y-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') {
                  setCreating(false);
                  setNewName('');
                }
              }}
              placeholder={t('notebooks.namePlaceholder')}
              className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-text-primary outline-none focus:border-primary"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setNewName('');
                }}
                className="text-xs text-text-tertiary px-3 py-1.5"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newName.trim() || busy}
                className="text-xs font-semibold text-white bg-primary rounded-full px-3 py-1.5 disabled:opacity-40"
              >
                {busy ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NotebookGlyph({ icon }: { icon: string }) {
  // Inline icons keyed off the notebook's icon slug. Kept simple;
  // "book" covers the default + unknown slugs.
  if (icon === 'heart') {
    return (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 21s-7-4.5-9-9.3C1.5 7.5 4 3 8 3c2 0 3.5 1 4 2.5C12.5 4 14 3 16 3c4 0 6.5 4.5 5 8.7C19 16.5 12 21 12 21z" />
      </svg>
    );
  }
  if (icon === 'zap') {
    return (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M13 2L3 14h7l-1 8 11-12h-7l0-8z" />
      </svg>
    );
  }
  // Default: book
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H12v17H6.5A2.5 2.5 0 0 1 4 16.5v-12Z" />
      <path d="M20 4.5A2.5 2.5 0 0 0 17.5 2H12v17h5.5A2.5 2.5 0 0 0 20 16.5v-12Z" />
    </svg>
  );
}
