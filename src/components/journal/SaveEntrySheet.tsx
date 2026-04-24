'use client';

// Save-entry bottom sheet. Opens when the user taps Save on
// /journal. Runs a lightweight Gemini classifier in parallel, shows
// the detected notebook as an overridable chip, and commits via
// journalStore.createEntry with the final notebook_id.

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useJournalStore } from '@/stores/journalStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { useUiStore } from '@/stores/uiStore';
import { classifyNotebook } from '@/lib/classifyNotebook';
import NotebookPickerChip from '@/components/notebooks/NotebookPickerChip';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';

interface Props {
  open: boolean;
  content: string;
  wordCount: number;
  durationSeconds: number;
  onClose: () => void;
  onSaved: () => void;
}

export default function SaveEntrySheet({
  open,
  content,
  wordCount,
  durationSeconds,
  onClose,
  onSaved,
}: Props) {
  const createEntry = useJournalStore((s) => s.createEntry);
  const notebooks = useNotebookStore((s) => s.notebooks);
  const hasFetched = useNotebookStore((s) => s.hasFetched);
  const fetchNotebooks = useNotebookStore((s) => s.fetchNotebooks);
  const showToast = useUiStore((s) => s.showToast);

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Lazy-load notebooks if the user has never opened /notebooks
  // before in this session.
  useEffect(() => {
    if (open && !hasFetched) fetchNotebooks().catch(() => {});
  }, [open, hasFetched, fetchNotebooks]);

  // Kick off classification once the sheet opens. The sheet is
  // immediately usable — user can override while we're still
  // resolving. If Gemini comes back before they pick, it fills in.
  useEffect(() => {
    if (!open) return;
    if (!notebooks || notebooks.length === 0) return;
    setSelectedSlug(null);
    setDetecting(true);
    let cancelled = false;
    (async () => {
      const choices = notebooks.map((n) => ({
        slug: n.slug,
        name: n.name,
        kind: n.kind,
        hint:
          n.system_key === 'journal'
            ? 'default / general thoughts'
            : n.system_key === 'gratitude'
            ? 'thankfulness, appreciation'
            : n.system_key === 'prompts'
            ? 'command blocks for AI, verbatim copy-paste'
            : undefined,
      }));
      const res = await classifyNotebook(content, choices);
      if (cancelled) return;
      setSelectedSlug(res.slug);
      setDetecting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, notebooks, content]);

  const handleSave = async () => {
    if (saving) return;
    const slug =
      selectedSlug ??
      notebooks.find((n) => n.system_key === 'journal')?.slug ??
      'journal';
    const nb = notebooks.find((n) => n.slug === slug);
    setSaving(true);
    try {
      await createEntry({
        entry_type: 'freeform',
        content_text: content.trim(),
        title: null,
        duration_seconds: durationSeconds,
        word_count: wordCount,
        notebook_id: nb?.id ?? null,
      });
      showToast(`Entry saved → ${nb?.name ?? 'Journal'}`, 'success');
      onSaved();
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
            className="fixed inset-x-0 bottom-0 z-[70] bg-bg rounded-t-3xl shadow-warm-xl"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            <div
              className="px-5 pt-2 pb-5 max-w-md mx-auto"
              style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            >
              <h2 className="text-base font-bold text-text-primary mb-3">
                Save to notebook
              </h2>

              {/* Notebook chip — always visible; reflects classifier
                  pick when it resolves, tap to override any time. */}
              <div className="flex items-center gap-2 mb-4">
                {detecting && !selectedSlug ? (
                  <span className="text-xs text-text-tertiary italic">
                    Detecting notebook…
                  </span>
                ) : (
                  <NotebookPickerChip
                    currentSlug={selectedSlug}
                    onChange={(slug) => setSelectedSlug(slug)}
                  />
                )}
                <span className="text-xs text-text-tertiary">
                  ({wordCount} {t('common.words')})
                </span>
              </div>

              {/* Preview of the entry */}
              <div className="max-h-[28vh] overflow-y-auto bg-surface-elevated border border-border rounded-2xl p-3 mb-4">
                <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                  {content.trim()}
                </p>
              </div>

              <div className="flex gap-2">
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
                  disabled={saving}
                  className="flex-1 py-3 rounded-2xl bg-primary text-white font-semibold shadow-warm-md hover:bg-primary-dark transition-colors disabled:opacity-50"
                >
                  {saving ? t('common.saving') : 'Save entry'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
