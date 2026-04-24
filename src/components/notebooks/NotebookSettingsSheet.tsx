'use client';

// Per-notebook settings bottom sheet. Opens from the gear button
// inside /notebooks/[slug]. Lets the user rename the notebook, pick a
// new accent color, swap the glyph icon, and (for project notebooks)
// archive it. System notebooks can be renamed / recolored but not
// archived — they back app-level surfaces (Journal default, Pulse
// check-ins).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotebookStore, type Notebook } from '@/stores/notebookStore';
import { useUiStore } from '@/stores/uiStore';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';

interface Props {
  open: boolean;
  notebook: Notebook | null;
  onClose: () => void;
}

// Small, curated palette. Matches the warm-gold tones the rest of
// the app uses so any pick looks native. Keep the list short —
// endless color grids turn this into a decision tax.
const COLOR_SWATCHES = [
  '#C4553D', // terracotta (default)
  '#D98E48', // amber
  '#C9A961', // honey
  '#7DA87D', // sage
  '#5FA5A0', // teal
  '#6B8FB8', // slate blue
  '#A67BB8', // lavender
  '#C47BA5', // rose
  '#8A8A8A', // graphite
];

// Inline SVGs keyed off the icon slug. Kept small so the sheet loads
// instantly and they look consistent with the notebook-list glyphs.
const ICON_OPTIONS: { slug: string; label: string; svg: React.ReactNode }[] = [
  {
    slug: 'book',
    label: 'Book',
    svg: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H12v17H6.5A2.5 2.5 0 0 1 4 16.5v-12Z" />
        <path d="M20 4.5A2.5 2.5 0 0 0 17.5 2H12v17h5.5A2.5 2.5 0 0 0 20 16.5v-12Z" />
      </svg>
    ),
  },
  {
    slug: 'heart',
    label: 'Heart',
    svg: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 21s-7-4.5-9-9.3C1.5 7.5 4 3 8 3c2 0 3.5 1 4 2.5C12.5 4 14 3 16 3c4 0 6.5 4.5 5 8.7C19 16.5 12 21 12 21z" />
      </svg>
    ),
  },
  {
    slug: 'zap',
    label: 'Lightning',
    svg: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M13 2L3 14h7l-1 8 11-12h-7l0-8z" />
      </svg>
    ),
  },
  {
    slug: 'star',
    label: 'Star',
    svg: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2l2.92 6.26L22 9.27l-5 5.12L18.18 22 12 18.27 5.82 22 7 14.39l-5-5.12 7.08-1.01L12 2z" />
      </svg>
    ),
  },
  {
    slug: 'leaf',
    label: 'Leaf',
    svg: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 20c8 0 14-6 14-14 0-1 0-2-.2-2.8C19 3 17 3 15 3 8 3 3 8 3 15c0 2.2.5 4.2 1.5 5.5" />
        <path d="M4 20c5-5 10-8 16-12" />
      </svg>
    ),
  },
  {
    slug: 'target',
    label: 'Target',
    svg: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    ),
  },
];

export default function NotebookSettingsSheet({ open, notebook, onClose }: Props) {
  const router = useRouter();
  const updateNotebook = useNotebookStore((s) => s.updateNotebook);
  const archiveNotebook = useNotebookStore((s) => s.archiveNotebook);
  const showToast = useUiStore((s) => s.showToast);

  const [name, setName] = useState('');
  const [color, setColor] = useState(COLOR_SWATCHES[0]);
  const [icon, setIcon] = useState('book');
  const [saving, setSaving] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  // Reset local state whenever the sheet opens for a new notebook.
  useEffect(() => {
    if (!open || !notebook) return;
    setName(notebook.name);
    setColor(notebook.color);
    setIcon(notebook.icon || 'book');
    setConfirmingArchive(false);
  }, [open, notebook]);

  if (!notebook) return null;

  const trimmed = name.trim();
  const canSave =
    !saving &&
    trimmed.length > 0 &&
    (trimmed !== notebook.name ||
      color !== notebook.color ||
      (icon || 'book') !== (notebook.icon || 'book'));

  const isSystem = notebook.kind === 'system';

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await updateNotebook(notebook.id, {
        name: trimmed,
        color,
        icon,
      });
      showToast('Notebook updated', 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('common.error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (saving || isSystem) return;
    setSaving(true);
    try {
      await archiveNotebook(notebook.id);
      showToast('Notebook deleted', 'info');
      onClose();
      router.replace('/notebooks');
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('common.error'), 'error');
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={prefersReducedMotion ? undefined : { opacity: 0 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50"
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            initial={prefersReducedMotion ? undefined : { y: '100%' }}
            animate={prefersReducedMotion ? undefined : { y: 0 }}
            exit={prefersReducedMotion ? undefined : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-[70] bg-bg rounded-t-3xl shadow-warm-xl max-h-[90dvh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-bg pt-3 pb-1">
              <div className="flex justify-center">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>
            </div>

            <div
              className="px-5 pt-2 pb-6 max-w-md mx-auto space-y-5"
              style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-text-primary">Notebook settings</h2>
                {isSystem && (
                  <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-widest border border-border px-1.5 py-0.5 rounded">
                    {t('notebooks.systemTag')}
                  </span>
                )}
              </div>

              {/* Name */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">
                  Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-[15px] text-text-primary outline-none focus:border-primary"
                />
              </div>

              {/* Color */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">
                  Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_SWATCHES.map((c) => {
                    const selected = c === color;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        aria-label={`Use ${c}`}
                        aria-pressed={selected}
                        className={`w-9 h-9 rounded-full border-2 transition-transform ${
                          selected ? 'border-text-primary scale-110' : 'border-transparent'
                        }`}
                        style={{ background: c }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Icon */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">
                  Icon
                </label>
                <div className="flex flex-wrap gap-2">
                  {ICON_OPTIONS.map((opt) => {
                    const selected = opt.slug === icon;
                    return (
                      <button
                        key={opt.slug}
                        type="button"
                        onClick={() => setIcon(opt.slug)}
                        aria-label={opt.label}
                        aria-pressed={selected}
                        className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-colors ${
                          selected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-surface-elevated text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {opt.svg}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="flex-1 py-3 rounded-2xl bg-surface-elevated border border-border text-text-secondary font-semibold disabled:opacity-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave}
                  className="flex-1 py-3 rounded-2xl bg-primary text-white font-semibold shadow-warm-md hover:bg-primary-dark transition-colors disabled:opacity-40"
                >
                  {saving ? t('common.saving') : t('common.save')}
                </button>
              </div>

              {/* Archive — project notebooks only. System notebooks
                  back app surfaces and can't be removed. */}
              {!isSystem && (
                <div className="pt-3 border-t border-border">
                  {!confirmingArchive ? (
                    <button
                      type="button"
                      onClick={() => setConfirmingArchive(true)}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold text-error hover:bg-error/10 transition-colors"
                    >
                      Delete notebook
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-text-secondary text-center">
                        Entries in this notebook will be unfiled, not deleted.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmingArchive(false)}
                          disabled={saving}
                          className="flex-1 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-secondary text-sm font-semibold disabled:opacity-50"
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          onClick={handleArchive}
                          disabled={saving}
                          className="flex-1 py-2.5 rounded-xl bg-error text-white text-sm font-semibold disabled:opacity-50"
                        >
                          {saving ? t('common.saving') : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
