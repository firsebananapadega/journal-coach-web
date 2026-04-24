'use client';

// Shared notebook-picker chip. Used by both the capture-preview
// sheet (for voice classifier routing) and the save-entry sheet
// (for /journal notebook confirmation). Reads directly from
// notebookStore so callers don't pass the list in.

import { useState } from 'react';
import { useNotebookStore } from '@/stores/notebookStore';
import { t } from '@/lib/translations';

interface Props {
  currentSlug: string | null;
  onChange: (slug: string) => void;
}

export default function NotebookPickerChip({ currentSlug, onChange }: Props) {
  const notebooks = useNotebookStore((s) => s.notebooks);
  const [open, setOpen] = useState(false);
  const current =
    notebooks.find((n) => n.slug === currentSlug) ??
    notebooks.find((n) => n.system_key === 'journal') ??
    null;

  if (notebooks.length === 0 || !current) return null;

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border border-border bg-surface-elevated hover:bg-surface text-text-primary"
        aria-label={t('preview.notebookLabel')}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: current.color }}
          aria-hidden
        />
        <span className="text-text-primary">{current.name}</span>
        <span className="text-text-tertiary">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-full mt-1 left-0 bg-surface-elevated border border-border rounded-lg shadow-warm-md py-1 min-w-[180px] max-h-[260px] overflow-y-auto">
            {notebooks.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  onChange(n.slug);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs ${
                  n.slug === currentSlug
                    ? 'text-primary font-semibold'
                    : 'text-text-secondary hover:bg-surface'
                }`}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ background: n.color }}
                  aria-hidden
                />
                {n.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
