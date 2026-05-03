'use client';

// PulseEntryCard — beauty pass for entries with `entry_type === 'pulse'`.
// Renders inside the Pulse system notebook feed (and anywhere else
// pulses surface in a chronological list).
//
// Pulse metadata, written by DailyPulseCard / PresenceCapture:
//   - pulseMode:    'morning' | 'evening' | 'presence'
//   - intention:    string                  (morning)
//   - wentRight:    string                  (evening)
//   - doneBetter:   string                  (evening)
//   - prior_intention_items: Array<{ text, outcome, note? }>  (evening)
//   - attention:    string                  (presence)
//   - one_word:     string                  (presence)
//   - body_score:   1..5
//   - body_label:   'heavy' | 'tired' | 'steady' | 'strong' | 'vibrant'
//   - mind_score:   1..5
//   - mind_label:   'foggy' | 'hazy' | 'steady' | 'clear' | 'sharp'
//
// PR 1 polish (per user feedback "looks better"):
//   • Stronger mode-tinted header gradient.
//   • Body / Mind become readable pills (no awkward "Body"/"Mind"
//     suffix tag — the emoji + label already carry the meaning).
//   • Prior-intention items now render with per-item outcome glyphs
//     (✓ fully / ◐ partially / ◌ not / ✗ distracted) so evening
//     pulse entries finally show the morning recap legibly.
//   • Date + time on one line with a middle-dot separator.

import { motion } from 'framer-motion';
import type { JournalEntry } from '@/stores/journalStore';
import { t } from '@/lib/translations';
import { getLocale } from '@/lib/language';
import { prefersReducedMotion } from '@/lib/motionVariants';

const BODY_EMOJI: Record<string, string> = {
  heavy: '😴',
  tired: '🥱',
  steady: '🙂',
  strong: '💪',
  vibrant: '🔥',
};
const MIND_EMOJI: Record<string, string> = {
  foggy: '🌫️',
  hazy: '😶‍🌫️',
  steady: '🧐',
  clear: '💡',
  sharp: '✨',
};

const OUTCOME_GLYPH: Record<string, string> = {
  fully: '✓',
  partially: '◐',
  not: '◌',
  distracted: '✗',
};

const OUTCOME_TONE: Record<string, string> = {
  fully: 'text-emerald-500',
  partially: 'text-amber-500',
  not: 'text-text-tertiary',
  distracted: 'text-rose-400',
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

interface PriorItem {
  text: string;
  outcome?: string;
  note?: string;
}

export default function PulseEntryCard({ entry }: Props) {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  const rawMode = meta.pulseMode;
  const mode: 'morning' | 'evening' | 'presence' | null =
    rawMode === 'morning' || rawMode === 'evening' || rawMode === 'presence'
      ? rawMode
      : null;

  const intention = typeof meta.intention === 'string' ? meta.intention.trim() : '';
  const wentRight = typeof meta.wentRight === 'string' ? meta.wentRight.trim() : '';
  const doneBetter = typeof meta.doneBetter === 'string' ? meta.doneBetter.trim() : '';
  const attention = typeof meta.attention === 'string' ? meta.attention.trim() : '';
  const oneWord = typeof meta.one_word === 'string' ? meta.one_word.trim() : '';
  const bodyLabel = typeof meta.body_label === 'string' ? (meta.body_label as string) : '';
  const mindLabel = typeof meta.mind_label === 'string' ? (meta.mind_label as string) : '';

  const priorItems: PriorItem[] = Array.isArray(meta.prior_intention_items)
    ? (meta.prior_intention_items as unknown[]).map((it) => {
        const o = (it ?? {}) as Record<string, unknown>;
        return {
          text: typeof o.text === 'string' ? o.text : '',
          outcome: typeof o.outcome === 'string' ? o.outcome : undefined,
          note: typeof o.note === 'string' ? o.note : undefined,
        };
      }).filter((it) => it.text.length > 0)
    : [];

  // Mode drives the color story + glyph. Stronger gradient than the
  // previous pass — more presence in the feed without overwhelming it.
  const headerGradient =
    mode === 'evening'
      ? 'from-indigo-500/40 via-purple-500/20 to-transparent'
      : mode === 'morning'
      ? 'from-amber-500/40 via-orange-400/20 to-transparent'
      : mode === 'presence'
      ? 'from-emerald-500/30 via-teal-400/15 to-transparent'
      : 'from-text-tertiary/15 via-text-tertiary/5 to-transparent';
  const modeIcon =
    mode === 'evening' ? '🌙' : mode === 'morning' ? '☀️' : mode === 'presence' ? '🧘' : '✦';
  const modeLabel =
    mode === 'evening'
      ? t('pulse.eveningDone')
      : mode === 'morning'
      ? t('pulse.morningDone')
      : mode === 'presence'
      ? t('presence.label')
      : t('journal.today');

  return (
    <motion.article
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: 6 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: 'easeOut' }}
      className="relative overflow-hidden bg-surface-elevated border border-border rounded-2xl shadow-warm-sm"
    >
      {/* Header band — gradient tinted by mode */}
      <div className={`relative bg-gradient-to-br ${headerGradient} px-4 pt-4 pb-3`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl leading-none shrink-0" aria-hidden>
            {modeIcon}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-text-tertiary font-semibold">
              {modeLabel}
            </p>
            <p className="text-sm font-semibold text-text-primary leading-tight tabular-nums">
              {formatDate(entry.created_at)}
              <span className="mx-1.5 text-text-tertiary" aria-hidden>·</span>
              <span className="font-normal text-text-secondary">
                {formatTime(entry.created_at)}
              </span>
            </p>
          </div>
        </div>

        {(bodyLabel || mindLabel) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {bodyLabel && (
              <span className="inline-flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-full bg-surface/95 border border-border">
                <span className="text-base leading-none" aria-hidden>
                  {BODY_EMOJI[bodyLabel] ?? '•'}
                </span>
                <span className="font-semibold text-text-primary">
                  {t(`checkin.body.${bodyLabel}`)}
                </span>
              </span>
            )}
            {mindLabel && (
              <span className="inline-flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-full bg-surface/95 border border-border">
                <span className="text-base leading-none" aria-hidden>
                  {MIND_EMOJI[mindLabel] ?? '•'}
                </span>
                <span className="font-semibold text-text-primary">
                  {t(`checkin.mind.${mindLabel}`)}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body — the user's written reflection */}
      <div className="px-4 py-4 space-y-3">
        {mode === 'morning' && intention && (
          <Section label={t('pulse.intentionLabel')} accent="text-amber-500">
            {intention}
          </Section>
        )}

        {mode === 'evening' && priorItems.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold mb-1.5 text-indigo-400">
              {t('pulse.priorIntentionLabel')}
            </p>
            <ul className="space-y-1.5">
              {priorItems.map((it, i) => {
                const tone = it.outcome ? OUTCOME_TONE[it.outcome] ?? 'text-text-tertiary' : 'text-text-tertiary';
                const glyph = it.outcome ? OUTCOME_GLYPH[it.outcome] ?? '·' : '·';
                return (
                  <li key={i} className="flex items-start gap-2 text-[14px] leading-relaxed">
                    <span className={`shrink-0 mt-0.5 w-4 text-center font-semibold ${tone}`} aria-hidden>
                      {glyph}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="text-text-primary">{it.text}</span>
                      {it.note && (
                        <span className="text-text-tertiary"> — {it.note}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
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

        {mode === 'presence' && (attention || oneWord) && (
          <div className="space-y-2">
            {attention && (
              <Section label={t('presence.attentionLabel')} accent="text-emerald-500">
                {attention}
              </Section>
            )}
            {oneWord && (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-semibold mb-1 text-teal-500">
                  {t('presence.oneWordLabel')}
                </p>
                <p className="text-[15px] font-semibold text-text-primary tracking-wide">
                  {oneWord}
                </p>
              </div>
            )}
          </div>
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
