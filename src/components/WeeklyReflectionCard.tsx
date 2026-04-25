'use client';

// Expandable card that renders either a legacy client-generated
// reflection (from localStorage) OR a server-delivered `weekly_letters`
// row. Both shapes carry the same essentials — a letter body and
// theme chips — so the card unifies them via a narrow interface.
//
// When the underlying row is a DB letter with `id` + onSeen callback,
// expanding the card also marks it seen so the unread badge clears.

import { useState } from 'react';
import { t } from '@/lib/translations';

export interface ReflectionCardData {
  letter: string;
  themes: string[];
  /** DB row id — present only for server-delivered letters. */
  id?: string;
  /** null = unread (only applies to DB rows). */
  seen_at?: string | null;
}

interface Props {
  reflection: ReflectionCardData;
  guideName: string;
  /** Called once when an unread DB letter is opened for the first time. */
  onSeen?: (id: string) => void;
}

export default function WeeklyReflectionCard({ reflection, guideName, onSeen }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isUnread = !!reflection.id && !reflection.seen_at;

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    // Fire onSeen the moment the user opens an unread letter. Parent
    // handles the DB write via lettersStore.markSeen().
    if (next && isUnread && reflection.id && onSeen) {
      onSeen(reflection.id);
    }
  };

  return (
    <button
      onClick={toggle}
      className="w-full text-left bg-surface rounded-2xl border border-border p-4 transition-colors hover:border-primary/50 relative"
    >
      {isUnread && (
        <span
          aria-label="Unread"
          className="absolute top-3 right-3 inline-block w-2.5 h-2.5 rounded-full bg-primary"
        />
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl" role="img" aria-label="letter">
            &#128140;
          </span>
          <span className="font-semibold text-text-primary text-sm">
            {t('reflection.title', { name: guideName })}
          </span>
        </div>
        <span className="text-xs text-text-tertiary pr-4">
          {expanded ? t('reflection.tapToCollapse') : t('reflection.tapToRead')}
        </span>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-text-primary leading-relaxed whitespace-pre-line">
            {reflection.letter}
          </p>

          {reflection.themes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {reflection.themes.map((theme, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full"
                >
                  {theme}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </button>
  );
}
