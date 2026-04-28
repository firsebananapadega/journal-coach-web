'use client';

// Intentions tab — your selected intentions with Play buttons.
// Lifted out of the Patterns page so each surface has one job:
//   - Intentions = practice (do)
//   - Patterns = insights (reflect)
//
// Two modes (mirrors the previous Patterns intentions section):
//
//   View mode (default):
//     - Each card shows icon + title + description + a Play button.
//     - Play button is BLUE with a play triangle when count = 0.
//     - Play button is GREEN with the count number when count ≥ 1.
//     - Top-right action: "Edit" (enters edit mode).
//
//   Edit mode:
//     - Each card shows icon + title + description + a × remove button.
//     - "+ Add intentions" link below the list goes to /intentions/gallery.
//     - Top-right action: "Done" (exits edit mode).

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { useJournalStore } from '@/stores/journalStore';
import { PRESET_INTENTIONS, type IntentionCategory } from '@/lib/presetIntentions';
import { getPracticeFor } from '@/lib/intentionPractices';
import { toLocalDateStr } from '@/lib/dateUtils';
import { t } from '@/lib/translations';

const CATEGORY_COLORS: Record<IntentionCategory, string> = {
  presence: 'bg-emerald-500/20',
  body: 'bg-orange-500/20',
  mind: 'bg-blue-500/20',
  connection: 'bg-pink-500/20',
  growth: 'bg-amber-500/20',
  purpose: 'bg-purple-500/20',
};

function findPreset(title: string) {
  return PRESET_INTENTIONS.find((p) => p.title === title);
}

export default function IntentionsPage() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const showToast = useUiStore((s) => s.showToast);
  const entries = useJournalStore((s) => s.entries);
  const fetchEntries = useJournalStore((s) => s.fetchEntries);
  const intentions = profile?.intentions ?? [];
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Per-intention completion count for TODAY only. The card's
  // primary→green flip is a "done today" signal that resets at
  // midnight; the all-time total lives in the Patterns tab's
  // intentions breakdown instead. Keyed by intention title.
  const completionCounts = useMemo(() => {
    const todayStr = toLocalDateStr(new Date());
    const map = new Map<string, number>();
    for (const e of entries) {
      if (e.entry_type !== 'practice') continue;
      if (!e.created_at) continue;
      if (toLocalDateStr(new Date(e.created_at)) !== todayStr) continue;
      const meta = e.metadata as Record<string, unknown> | null;
      const title =
        typeof meta?.intention_title === 'string' ? meta.intention_title : null;
      if (!title) continue;
      map.set(title, (map.get(title) ?? 0) + 1);
    }
    return map;
  }, [entries]);

  const tryPlay = (title: string) => {
    const practice = getPracticeFor(title);
    if (practice) {
      router.push(`/practice/${practice.slug}`);
    } else {
      showToast(t('practice.comingSoon'));
    }
  };

  const removeIntention = async (title: string) => {
    setRemoving(title);
    try {
      await updateProfile({
        intentions: intentions.filter((i) => i !== title),
      });
    } finally {
      setRemoving(null);
    }
  };

  if (intentions.length === 0) {
    // Empty-state hero — centered illustration + bold prompt + big
    // primary CTA. The page-level title is intentionally dropped here
    // so the hero owns the whole canvas; the bottom nav still tells
    // the user where they are.
    return (
      <div className="max-w-lg mx-auto px-6 pt-20 pb-32 flex flex-col items-center text-center min-h-[calc(100dvh-180px)] justify-center">
        {/* Compass-in-glow medallion */}
        <div className="relative mb-7">
          <div className="absolute inset-0 rounded-full bg-primary/15 blur-2xl scale-110" aria-hidden />
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-primary/25 to-primary/5 border border-primary/30 flex items-center justify-center text-primary shadow-warm-md">
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="3" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="21" />
              <line x1="3" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="21" y2="12" />
            </svg>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-text-primary leading-tight tracking-tight mb-3">
          How do you want to <span className="italic">be?</span>
        </h1>
        <p className="text-base text-text-secondary leading-relaxed max-w-sm mb-10">
          Intentions are qualities to embody — like{' '}
          <span className="text-primary font-medium">be present</span> or{' '}
          <span className="text-primary font-medium">listen first</span>. Not
          goals to achieve. Ways of showing up.
        </p>

        <Link
          href="/intentions/gallery"
          className="w-full max-w-xs py-4 bg-primary text-white rounded-2xl font-semibold text-base shadow-warm-md hover:bg-primary-dark active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            aria-hidden
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add your first intention
        </Link>

        <p className="text-xs text-text-tertiary mt-3">
          Browse 30+ science-backed presets, or write your own
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-24 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">
          {t('tab.intentions')}
        </h1>
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-sm text-primary font-medium"
        >
          {editing ? t('common.done') : t('common.edit')}
        </button>
      </div>

      <div className="space-y-2">
        {intentions.map((it, i) => {
            const preset = findPreset(it);
            const colorClass = preset
              ? CATEGORY_COLORS[preset.category]
              : 'bg-surface-elevated';
            const icon = preset?.icon ?? '✨';
            const description = preset?.description;
            const hasPractice = !!getPracticeFor(it);
            const count = completionCounts.get(it) ?? 0;
            const completed = count > 0;
            const isRemoving = removing === it;
            return (
              <div
                key={`${i}-${it}`}
                className="bg-surface rounded-2xl border border-border p-4 flex items-center gap-3"
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0 ${colorClass}`}
                >
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-text-primary leading-snug">
                    {it}
                  </p>
                  {description && (
                    <p className="text-sm text-text-tertiary mt-0.5 leading-snug">
                      {description}
                    </p>
                  )}
                </div>

                {editing ? (
                  <button
                    onClick={() => removeIntention(it)}
                    disabled={isRemoving}
                    className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-lg bg-surface-elevated text-text-tertiary hover:text-text-primary hover:bg-error/10 hover:text-error transition-all disabled:opacity-40"
                    aria-label={`Remove ${it}`}
                  >
                    ×
                  </button>
                ) : (
                  <button
                    onClick={() => tryPlay(it)}
                    className={`relative flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-white shadow-warm-sm transition-colors ${
                      completed
                        ? 'bg-success hover:bg-success/85'
                        : `bg-primary hover:bg-primary-dark ${hasPractice ? '' : 'opacity-50'}`
                    }`}
                    aria-label={
                      completed
                        ? `Play ${it} (done ${count} time${count === 1 ? '' : 's'} today)`
                        : `Play ${it}`
                    }
                  >
                    {count === 0 ? (
                      // Never done today — primary-themed play triangle.
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden
                      >
                        <polygon points="6 4 20 12 6 20" />
                      </svg>
                    ) : count === 1 ? (
                      // Done once today — green check-mark (no "1").
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      // Done 2+ times today — show the count.
                      <span className="text-[15px] font-bold tabular-nums">
                        {count}
                      </span>
                    )}
                  </button>
                )}
              </div>
            );
          })}

        {editing && (
          <Link
            href="/intentions/gallery"
            className="block text-center py-3 text-sm text-primary font-medium hover:underline"
          >
            + Add intentions
          </Link>
        )}
      </div>
    </div>
  );
}
