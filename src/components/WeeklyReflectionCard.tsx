'use client';

import { useState } from 'react';
import type { WeeklyReflectionData } from '@/lib/weeklyReflection';

interface Props {
  reflection: WeeklyReflectionData;
  guideName: string;
}

export default function WeeklyReflectionCard({ reflection, guideName }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className="w-full text-left bg-surface rounded-2xl border border-border p-4 transition-colors hover:border-primary/50"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl" role="img" aria-label="letter">
            &#128140;
          </span>
          <span className="font-semibold text-text-primary text-sm">
            {guideName}&apos;s Weekly Reflection
          </span>
        </div>
        <span className="text-xs text-text-tertiary">
          {expanded ? 'tap to collapse' : 'tap to read'}
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
