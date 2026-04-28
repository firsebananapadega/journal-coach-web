'use client';

// PulseEntryCard — beauty pass for entries with `entry_type === 'pulse'`
// inside the Pulse notebook (or anywhere else pulses surface in a feed).
//
// Pulse metadata comes from `DailyPulseCard`:
//   - pulseMode:    'morning' | 'evening'
//   - intention:    string (morning)
//   - wentRight:    string (evening)
//   - doneBetter:   string (evening)
//   - body_score:   1..5
//   - body_label:   'heavy' | 'tired' | 'steady' | 'strong' | 'vibrant'
//   - mind_score:   1..5
//   - mind_label:   'foggy' | 'hazy' | 'steady' | 'clear' | 'sharp'
//
// The generic EntryCard just dumps `content_structured` or the raw
// content_text — that loses the body/mind scores and the semantic
// structure. This card renders them as dedicated labeled blocks +
// chips so the user actually sees what they reflected on.

import { motion } from 'framer-motion';
import type { JournalEntry } from '@/stores/journalStore';
import { t } from '@/lib/translations';
import { getLocale } from '@/lib/language';
import { prefersReducedMotion } from '@/lib/motionVariants';

// Mirrors the scales in DailyPulseCard so emojis + labels line up
// 1:1 with what the user picked.
const BODY_EMOJI: Record<string, string> = {
  heavy: '😴',   // 😴
  tired: '🥱',   // 🥱
  steady: '🙂',  // 🙂
  strong: '💪',  // 💪
  vibrant: '🔥', // 🔥
};
const MIND_EMOJI: Record<string, string> = {
  foggy: '🌫️',                   // 🌫️
  hazy: '😶‍🌫️',  // 😶‍🌫️
  steady: '🧐',                         // 🧐
  clear: '💡',                          // 💡
  sharp: '✨',                                // ✨
};

function formatTime(iso: string): string {
  const locale = getLocale() === 'es' ? 'es-MX' : 'en-US';
  return new Date(iso).toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDate(iso: string): string {
  const locale = getLocale() === 'es' ? 'es-MX' : 'en-US';
  return new Date(iso).toLocaleDateString(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

interface Props {
  entry: JournalEntry;
}

export default function PulseEntryCard({ entry }: Props) {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  const mode =
    meta.pulseMode === 'morning' || meta.pulseMode === 'evening'
      ? (meta.pulseMode as 'morning' | 'evening')
      : null;

  const intention = typeof meta.intention === 'string' ? meta.intention.trim() : '';
  const wentRight = typeof meta.wentRight === 'string' ? meta.wentRight.trim() : '';
  const doneBetter = typeof meta.doneBetter === 'string' ? meta.doneBetter.trim() : '';
  const bodyLabel = typeof meta.body_label === 'string' ? (meta.body_label as string) : '';
  const mindLabel = typeof meta.mind_label === 'string' ? (meta.mind_label as string) : '';

  // Mode drives the color story and the icon. Morning = warm sunrise
  // gradient; evening = cool dusk gradient. Legacy entries without a
  // pulseMode fall back to a neutral treatment so we don't lose them.
  const isEvening = mode === 'evening';
  const headerGradient = isEvening
    ? 'from-indigo-500/25 via-purple-500/15 to-transparent'
    : 'from-amber-500/25 via-orange-400/15 to-transparent';
  const modeIcon = isEvening ? '🌙' : '☀️'; // 🌙 or ☀️
  const modeLabel = isEvening
    ? t('pulse.eveningDone')
    : mode === 'morning'
    ? t('pulse.morningDone')
    : t('journal.today');

  return (
    <motion.article
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: 6 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: 'easeOut' }}
      className="relative overflow-hidden bg-surface-elevated border border-border rounded-2xl shadow-warm-sm"
    >
      {/* Header band — gradient tinted by mode */}
      <div
        className={`relative bg-gradient-to-br ${headerGradient} px-4 pt-4 pb-3`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl leading-none" aria-hidden>
              {modeIcon}
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-widest text-text-tertiary font-semibold">
                {modeLabel}
              </p>
              <p className="text-sm font-semibold text-text-primary leading-tight">
                {formatDate(entry.created_at)}
              </p>
            </div>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-text-tertiary">
            {formatTime(entry.created_at)}
          </span>
        </div>

        {/* Body + Mind chips — only render what was actually picked */}
        {(bodyLabel || mindLabel) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {bodyLabel && (
              <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-surface/90 border border-border text-text-secondary">
                <span aria-hidden>{BODY_EMOJI[bodyLabel] ?? '•'}</span>
                <span className="font-medium text-text-primary">
                  {t(`checkin.body.${bodyLabel}`)}
                </span>
                <span className="text-text-tertiary text-[10px] uppercase tracking-wider">
                  {t('pulse.bodyPrompt') ? 'Body' : 'Body'}
                </span>
              </span>
            )}
            {mindLabel && (
              <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-surface/90 border border-border text-text-secondary">
                <span aria-hidden>{MIND_EMOJI[mindLabel] ?? '•'}</span>
                <span className="font-medium text-text-primary">
                  {t(`checkin.mind.${mindLabel}`)}
                </span>
                <span className="text-text-tertiary text-[10px] uppercase tracking-wider">
                  Mind
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body — the user's written reflection, split by prompt */}
      <div className="px-4 py-4 space-y-3">
        {mode === 'morning' && intention && (
          <Section label={t('pulse.intentionLabel')} accent="text-amber-500">
            {intention}
          </Section>
        )}
        {mode === 'evening' && wentRight && (
          <Section label={t('pulse.wentRightLabel')} accent="text-emerald-500">
            {wentRight}
          </Section>
        )}
        {mode === 'evening' && doneBetter && (
          <Section label={t('pulse.doneBetterLabel')} accent="text-rose-400">
            {doneBetter}
          </Section>
        )}

        {/* Legacy / unstructured fallback — keeps the entry legible
            even if its metadata predates the current schema. */}
        {!mode && (entry.content_text ?? '').trim() && (
          <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
            {entry.content_text}
          </p>
        )}
      </div>
    </motion.article>
  );
}

function Section({
  label,
  accent,
  children,
}: {
  label: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-widest font-semibold mb-1 ${accent}`}>
        {label}
      </p>
      <p className="text-[15px] leading-relaxed text-text-primary whitespace-pre-wrap">
        {children}
      </p>
    </div>
  );
}
