'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useJournalStore, type JournalEntry } from '@/stores/journalStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { useUiStore } from '@/stores/uiStore';
import GuideMascot from '@/components/mascot/GuideMascot';
import { toLocalDateStr } from '@/lib/dateUtils';
import { t } from '@/lib/translations';
import { isSpeechRecognitionSupported } from '@/lib/speechRecognition';
import { useSelectionAwareMic } from '@/hooks/useSelectionAwareMic';
import { prefersReducedMotion } from '@/lib/motionVariants';

interface Props {
  entries: JournalEntry[];
}

type PulseMode = 'morning' | 'evening';

// Pulse mode by clock hour:
//   - 04:00–17:59 → morning
//   - 18:00–03:59 → evening  (late-night hours stay in "evening" so
//                              someone up past midnight still gets
//                              the end-of-day reflection, not a
//                              morning prompt)
// The 4 AM cutoff is the "subjective morning" threshold — the app
// shouldn't flip to the morning pulse the moment the clock crosses
// midnight, since that isn't morning for anyone.
function getCurrentMode(): PulseMode {
  const h = new Date().getHours();
  if (h >= 4 && h < 18) return 'morning';
  return 'evening';
}

// Subjective "pulse day" for a timestamp. A pulse day runs from 04:00
// to 03:59 the next calendar day — so an evening pulse completed at
// 00:30 Tuesday still belongs to MONDAY's pulse day, not Tuesday's.
// Without this, the Monday-evening entry would show up as Tuesday's
// evening-done card and block Tuesday's actual evening prompt. This
// mirrors the 4am threshold in getCurrentMode().
function pulseDayOf(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : new Date(iso);
  if (d.getHours() < 4) {
    const rolled = new Date(d);
    rolled.setDate(rolled.getDate() - 1);
    return toLocalDateStr(rolled);
  }
  return toLocalDateStr(d);
}

function currentPulseDay(): string {
  return pulseDayOf(new Date());
}

function pulseModeOf(e: JournalEntry): PulseMode | null {
  const m = (e.metadata as Record<string, unknown> | null)?.pulseMode;
  return m === 'morning' || m === 'evening' ? m : null;
}

// Morning: 1 question. Evening: 2 questions.
const MORNING_QUESTIONS = [{ translationKey: 'pulse.morning.q1' }];
const EVENING_QUESTIONS = [
  { translationKey: 'pulse.evening.q1' },
  { translationKey: 'pulse.evening.q2' },
];

// Body & Mind check-in scales — appended as the last two steps of every
// pulse session (morning AND evening). One emoji-tap per step. Skippable
// by tapping Next/Save without picking. Score 1 = lowest energy/clarity.
interface ScaleOption { score: number; emoji: string; labelKey: string }
const BODY_SCALE: ScaleOption[] = [
  { score: 1, emoji: '\uD83D\uDE34', labelKey: 'heavy' },   // 😴
  { score: 2, emoji: '\uD83E\uDD71', labelKey: 'tired' },   // 🥱
  { score: 3, emoji: '\uD83D\uDE42', labelKey: 'steady' },  // 🙂
  { score: 4, emoji: '\uD83D\uDCAA', labelKey: 'strong' },  // 💪
  { score: 5, emoji: '\uD83D\uDD25', labelKey: 'vibrant' }, // 🔥
];
const MIND_SCALE: ScaleOption[] = [
  { score: 1, emoji: '\uD83C\uDF2B\uFE0F', labelKey: 'foggy' },                    // 🌫️
  { score: 2, emoji: '\uD83D\uDE36\u200D\uD83C\uDF2B\uFE0F', labelKey: 'hazy' },   // 😶‍🌫️
  { score: 3, emoji: '\uD83E\uDDD0', labelKey: 'steady' },                          // 🧐
  { score: 4, emoji: '\uD83D\uDCA1', labelKey: 'clear' },                           // 💡
  { score: 5, emoji: '\u2728', labelKey: 'sharp' },                                 // ✨
];

export default function DailyPulseCard({ entries }: Props) {
  const { createEntry, updateEntry } = useJournalStore();
  const hasFetched = useJournalStore((s) => s.hasFetched);
  const celebrate = useUiStore((s) => s.celebrate);
  const showToast = useUiStore((s) => s.showToast);
  // Resolve the Pulse system notebook so every pulse entry lands there
  // (rather than defaulting to the user's Journal notebook). If the
  // notebook hasn't been fetched yet we fall back to null, which makes
  // createEntry auto-resolve to Journal — acceptable while we wait for
  // the first notebook fetch.
  const pulseNotebookId = useNotebookStore((s) => s.pulseId());
  const fetchNotebooks = useNotebookStore((s) => s.fetchNotebooks);
  const hasFetchedNotebooks = useNotebookStore((s) => s.hasFetched);

  useEffect(() => {
    if (!hasFetchedNotebooks) fetchNotebooks().catch(() => {});
  }, [hasFetchedNotebooks, fetchNotebooks]);

  const [mode] = useState<PulseMode>(getCurrentMode);
  const [step, setStep] = useState(0);
  const [answer1, setAnswer1] = useState('');
  const [answer2, setAnswer2] = useState('');
  // Body & Mind check-in scores — picked on the new sequential steps
  // appended after the existing text questions. Null = not picked yet
  // (user can skip by tapping Next without selecting an emoji).
  const [bodyScore, setBodyScore] = useState<number | null>(null);
  const [mindScore, setMindScore] = useState<number | null>(null);

  // Intention-outcome reflection (evening only — closes the loop on
  // the morning intention). Persisted on the evening pulse metadata
  // as prior_intention / prior_intention_outcome / prior_intention_
  // obstacle. Backed by Gollwitzer + Sheeran research on if-then plans
  // and self-monitoring of goal completion.
  type IntentionOutcome = 'fully' | 'partially' | 'distracted' | 'not';
  const [intentionOutcome, setIntentionOutcome] = useState<IntentionOutcome | null>(null);
  const [intentionObstacle, setIntentionObstacle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [speechSupported] = useState(
    () => typeof window !== 'undefined' && isSpeechRecognitionSupported()
  );

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const answer1Ref = useRef(answer1);
  const answer2Ref = useRef(answer2);

  useEffect(() => { answer1Ref.current = answer1; }, [answer1]);
  useEffect(() => { answer2Ref.current = answer2; }, [answer2]);

  // Use the SUBJECTIVE pulse day (4am boundary), not the calendar
  // date. Otherwise an evening pulse saved at 00:30 on Tuesday would
  // be bucketed as Tuesday's evening-done and hide Tuesday's real
  // evening prompt later that day.
  const today = currentPulseDay();
  const questions = mode === 'morning' ? MORNING_QUESTIONS : EVENING_QUESTIONS;

  // All of today's pulses, sorted oldest-first (morning before evening).
  // Bucketed by pulseDayOf — see the function's docstring for why a
  // calendar-date comparison wouldn't work across the 4am boundary.
  const todayPulses = useMemo(() => {
    return entries
      .filter(
        (e) =>
          e.entry_type === 'pulse' &&
          pulseDayOf(e.created_at) === today &&
          pulseModeOf(e),
      )
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [entries, today]);

  const currentModePulse = todayPulses.find((p) => pulseModeOf(p) === mode);

  // Today's morning intention (if logged). Drives the optional
  // recall step at the start of the evening pulse: "this morning
  // your intention was X — how did that go?" When no morning pulse
  // exists or its intention field is empty, the recall step is
  // skipped entirely and the flow falls back to the original
  // wentRight → doneBetter → body → mind sequence.
  const morningIntention = useMemo(() => {
    if (mode !== 'evening') return '';
    const morning = todayPulses.find((p) => pulseModeOf(p) === 'morning');
    if (!morning) return '';
    const intention = (morning.metadata as Record<string, unknown> | null)?.intention;
    return typeof intention === 'string' ? intention.trim() : '';
  }, [mode, todayPulses]);
  const hasIntentionRecall = morningIntention.length > 0;

  // Step layout:
  //   * morning  — [text Qs] + body + mind                         (3 steps)
  //   * evening (no morning intention) — [text Qs] + body + mind   (4 steps)
  //   * evening (has morning intention) — recall + [text Qs] + body + mind (5 steps)
  const recallSteps = hasIntentionRecall ? 1 : 0;
  const totalSteps = recallSteps + questions.length + 2;
  const intentionStepIndex = hasIntentionRecall ? 0 : -1;
  const textStepStart = recallSteps;
  const bodyStepIndex = recallSteps + questions.length;
  const mindStepIndex = recallSteps + questions.length + 1;
  const isIntentionStep = step === intentionStepIndex;
  const isTextStep = step >= textStepStart && step < textStepStart + questions.length;
  const textQuestionIndex = step - textStepStart; // 0 or 1
  const isBodyStep = step === bodyStepIndex;
  const isMindStep = step === mindStepIndex;

  // Text-step accessors only — recall/body/mind steps don't have a textarea.
  const currentValue = textQuestionIndex === 0 ? answer1 : answer2;
  const setCurrentValue = textQuestionIndex === 0 ? setAnswer1 : setAnswer2;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [answer1, answer2, step]);

  // No auto-focus on the textarea: this app is voice-first. Auto-
  // focusing pops the on-screen keyboard on mobile and competes with
  // the mic button, which is the primary input. The user can tap the
  // textarea explicitly when they want to type.

  // Selection-aware mic — identical behavior to /guided: speech
  // inserts at the cursor (or replaces selected text), tapping
  // elsewhere mid-recording re-anchors future speech at the new
  // position. The hook owns all the ref bookkeeping.
  const {
    isListening,
    toggle: toggleMic,
    stop: stopMic,
    micButtonProps,
  } = useSelectionAwareMic({
    textareaRef,
    value: currentValue,
    onChange: setCurrentValue,
  });

  const goNext = () => {
    stopMic();
    setStep((s) => Math.min(s + 1, totalSteps - 1));
  };

  const goBack = () => {
    stopMic();
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = async () => {
    stopMic();
    const a1 = answer1Ref.current.trim();
    const a2 = answer2Ref.current.trim();
    if (!a1 && !a2) return;
    setSaveError('');
    setSubmitting(true);
    try {
      let contentText: string;
      let metadata: Record<string, unknown>;

      if (mode === 'morning') {
        contentText = `Intention: ${a1}`;
        metadata = { pulseMode: 'morning', intention: a1 };
      } else {
        contentText = `Went right: ${a1}\n\nDone better: ${a2}`;
        metadata = { pulseMode: 'evening', wentRight: a1, doneBetter: a2 };

        // Intention-outcome — only present when the user actually
        // logged a morning intention today AND tagged an outcome on
        // the evening pulse. Empty obstacle is omitted so the
        // metadata column stays clean.
        if (hasIntentionRecall && intentionOutcome) {
          metadata.prior_intention = morningIntention;
          metadata.prior_intention_outcome = intentionOutcome;
          const obstacle = intentionObstacle.trim();
          if (obstacle) metadata.prior_intention_obstacle = obstacle;
        }
      }

      // Layer body+mind check-in scores onto the pulse metadata. Skipped
      // (null) values are omitted so we don't pollute the JSON with
      // placeholder fields. Each pulse entry is itself the time-stamp,
      // so trends can be plotted from journal_entries.created_at later.
      const bodyOption = bodyScore != null ? BODY_SCALE.find((o) => o.score === bodyScore) : null;
      const mindOption = mindScore != null ? MIND_SCALE.find((o) => o.score === mindScore) : null;
      if (bodyOption) {
        metadata.body_score = bodyOption.score;
        metadata.body_label = bodyOption.labelKey;
      }
      if (mindOption) {
        metadata.mind_score = mindOption.score;
        metadata.mind_label = mindOption.labelKey;
      }

      const wordCount = contentText.split(/\s+/).filter(Boolean).length;
      // createEntry is now bounded by a 15s timeout inside journalStore,
      // and it optimistically updates the `entries` slice on success —
      // so the redundant fetchEntries() that used to follow is gone.
      // Net effect: pulse save can't hang indefinitely AND the screen
      // updates the moment the insert returns.
      await createEntry({
        entry_type: 'pulse',
        content_text: contentText,
        title: mode === 'morning' ? 'Morning Pulse' : 'Evening Pulse',
        metadata,
        word_count: wordCount,
        notebook_id: pulseNotebookId,
      });
      // Success — NOW clear the draft and move on.
      setAnswer1('');
      setAnswer2('');
      setBodyScore(null);
      setMindScore(null);
      setIntentionOutcome(null);
      setIntentionObstacle('');
      setStep(0);
      celebrate();
      showToast(
        mode === 'morning' ? t('pulse.morningSaved') : t('pulse.eveningSaved')
      );
    } catch (err) {
      console.error('Failed to save pulse:', err);
      // CRITICAL: do NOT reset answer1/answer2/scores on failure. The
      // user's words survive the retry. Previous behavior cleared the
      // draft in the finally block and stranded them with nothing.
      const msg = err instanceof Error ? err.message : 'Failed to save. Try again.';
      setSaveError(
        msg.includes('timed out')
          ? 'Save took too long — check your connection and tap Save again.'
          : msg,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Edit state for completed pulses ──────────────────────────────
  // Only one entry edits at a time. Draft mirrors the entry's
  // metadata until Save (which calls updateEntry) or Cancel.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editIntention, setEditIntention] = useState('');
  const [editWentRight, setEditWentRight] = useState('');
  const [editDoneBetter, setEditDoneBetter] = useState('');
  const [editBodyScore, setEditBodyScore] = useState<number | null>(null);
  const [editMindScore, setEditMindScore] = useState<number | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const startEditing = (entry: JournalEntry) => {
    const meta = (entry.metadata ?? {}) as Record<string, unknown>;
    setEditIntention(typeof meta.intention === 'string' ? meta.intention : '');
    setEditWentRight(typeof meta.wentRight === 'string' ? meta.wentRight : '');
    setEditDoneBetter(typeof meta.doneBetter === 'string' ? meta.doneBetter : '');
    setEditBodyScore(typeof meta.body_score === 'number' ? meta.body_score : null);
    setEditMindScore(typeof meta.mind_score === 'number' ? meta.mind_score : null);
    setEditError('');
    setEditingId(entry.id);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditError('');
  };

  const saveEditing = async (entry: JournalEntry) => {
    const m = pulseModeOf(entry);
    if (!m) return;
    setEditSaving(true);
    setEditError('');
    try {
      const next: Record<string, unknown> = { pulseMode: m };
      let contentText: string;
      if (m === 'morning') {
        next.intention = editIntention.trim();
        contentText = `Intention: ${editIntention.trim()}`;
      } else {
        next.wentRight = editWentRight.trim();
        next.doneBetter = editDoneBetter.trim();
        contentText = `Went right: ${editWentRight.trim()}\n\nDone better: ${editDoneBetter.trim()}`;
      }
      const bodyOption = editBodyScore != null ? BODY_SCALE.find((o) => o.score === editBodyScore) : null;
      const mindOption = editMindScore != null ? MIND_SCALE.find((o) => o.score === editMindScore) : null;
      if (bodyOption) {
        next.body_score = bodyOption.score;
        next.body_label = bodyOption.labelKey;
      }
      if (mindOption) {
        next.mind_score = mindOption.score;
        next.mind_label = mindOption.labelKey;
      }
      const wordCount = contentText.split(/\s+/).filter(Boolean).length;
      // updateEntry is now bounded by a 15s timeout and optimistically
      // syncs the in-memory entry, so the post-save fetchEntries() is
      // redundant — drop it to halve the round-trips and eliminate a
      // second potential hang site.
      await updateEntry(entry.id, {
        content_text: contentText,
        metadata: next,
        word_count: wordCount,
      });
      setEditingId(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save edits';
      setEditError(
        msg.includes('timed out')
          ? 'Save took too long — check your connection and try again.'
          : msg,
      );
    } finally {
      setEditSaving(false);
    }
  };

  // ── Expandable card for a completed pulse ───────────────────────
  // Header is a button (toggles expand). Body is conditionally
  // rendered: read-only summary by default, an editable form when
  // the user taps Edit. This is the surface for backfilling body/mind
  // scores onto pulses that were saved before that feature existed.
  const renderCompletedPulse = (entry: JournalEntry) => {
    const meta = (entry.metadata ?? {}) as Record<string, string>;
    const m = pulseModeOf(entry);
    if (!m) return null;
    const label = m === 'morning' ? t('pulse.morningDone') : t('pulse.eveningDone');
    const icon = m === 'morning' ? '☀️' : '🌙';
    const isExpanded = expandedIds.has(entry.id);
    const isEditing = editingId === entry.id;

    return (
      <motion.div
        layout
        className="bg-surface rounded-2xl border border-border p-4 shadow-warm-sm"
        data-testid={`pulse-completed-${m}`}
      >
        <button
          onClick={() => toggleExpanded(entry.id)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <span className="font-semibold text-text-primary text-sm">{label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-success">✓</span>
            <motion.span
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="text-xs text-text-tertiary inline-block"
            >
              ▼
            </motion.span>
          </div>
        </button>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
              animate={prefersReducedMotion ? undefined : { height: 'auto', opacity: 1 }}
              exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              {!isEditing ? (
                <div className="mt-3 space-y-2 pt-3 border-t border-border">
                  {m === 'morning' && meta.intention && (
                    <div>
                      <span className="text-xs font-medium text-primary">{t('pulse.intentionLabel')}</span>
                      <p className="text-sm text-text-primary mt-0.5 whitespace-pre-wrap">{meta.intention}</p>
                    </div>
                  )}
                  {/* Evening intention-outcome — only shown on evenings
                      that actually answered the recall step. Quotes the
                      morning intention verbatim so the chain is visible
                      without flipping back to the morning entry. */}
                  {m === 'evening' && meta.prior_intention_outcome && (
                    <div>
                      <span className="text-xs font-medium text-primary">Morning intention</span>
                      {meta.prior_intention && (
                        <p className="text-[13px] italic text-text-secondary mt-0.5 leading-snug whitespace-pre-wrap">
                          &ldquo;{meta.prior_intention}&rdquo;
                        </p>
                      )}
                      <p className="text-sm text-text-primary mt-1 capitalize">
                        {meta.prior_intention_outcome === 'fully'
                          ? '✓ Fully'
                          : meta.prior_intention_outcome === 'partially'
                          ? '~ Partially'
                          : meta.prior_intention_outcome === 'distracted'
                          ? 'Got distracted'
                          : 'Not at all'}
                      </p>
                      {meta.prior_intention_obstacle && (
                        <p className="text-[13px] text-text-secondary mt-1 leading-snug whitespace-pre-wrap">
                          {meta.prior_intention_obstacle}
                        </p>
                      )}
                    </div>
                  )}
                  {m === 'evening' && meta.wentRight && (
                    <div>
                      <span className="text-xs font-medium text-primary">{t('pulse.wentRightLabel')}</span>
                      <p className="text-sm text-text-primary mt-0.5 whitespace-pre-wrap">{meta.wentRight}</p>
                    </div>
                  )}
                  {m === 'evening' && meta.doneBetter && (
                    <div>
                      <span className="text-xs font-medium text-accent">{t('pulse.doneBetterLabel')}</span>
                      <p className="text-sm text-text-primary mt-0.5 whitespace-pre-wrap">{meta.doneBetter}</p>
                    </div>
                  )}
                  {/* Body/Mind chips — show whichever the user picked.
                      Skipped values aren't in metadata so don't render. */}
                  {(meta.body_label || meta.mind_label) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {meta.body_label && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-surface-elevated text-text-secondary">
                          {BODY_SCALE.find((o) => o.labelKey === meta.body_label)?.emoji}
                          <span>{t(`checkin.body.${meta.body_label}`)}</span>
                        </span>
                      )}
                      {meta.mind_label && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-surface-elevated text-text-secondary">
                          {MIND_SCALE.find((o) => o.labelKey === meta.mind_label)?.emoji}
                          <span>{t(`checkin.mind.${meta.mind_label}`)}</span>
                        </span>
                      )}
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      onClick={() => startEditing(entry)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {t('common.edit')}
                    </button>
                  </div>
                </div>
              ) : (
                /* Edit form — text + body + mind. Body & mind picker
                    rows mirror the live pulse-step pickers exactly so
                    backfilling feels identical to the first capture. */
                <div className="mt-3 space-y-3 pt-3 border-t border-border">
                  {m === 'morning' && (
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-primary">{t('pulse.intentionLabel')}</span>
                      <textarea
                        value={editIntention}
                        onChange={(e) => setEditIntention(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-text-primary outline-none focus:border-primary resize-none"
                      />
                    </div>
                  )}
                  {m === 'evening' && (
                    <>
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-primary">{t('pulse.wentRightLabel')}</span>
                        <textarea
                          value={editWentRight}
                          onChange={(e) => setEditWentRight(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-text-primary outline-none focus:border-primary resize-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-accent">{t('pulse.doneBetterLabel')}</span>
                        <textarea
                          value={editDoneBetter}
                          onChange={(e) => setEditDoneBetter(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-text-primary outline-none focus:border-primary resize-none"
                        />
                      </div>
                    </>
                  )}

                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-text-secondary">{t('pulse.bodyPrompt')}</p>
                    <EmojiPickerRow
                      options={BODY_SCALE}
                      value={editBodyScore}
                      onPick={setEditBodyScore}
                      labelPrefix="checkin.body"
                      layoutId={`bodyEditRing-${entry.id}`}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-text-secondary">{t('pulse.mindPrompt')}</p>
                    <EmojiPickerRow
                      options={MIND_SCALE}
                      value={editMindScore}
                      onPick={setEditMindScore}
                      labelPrefix="checkin.mind"
                      layoutId={`mindEditRing-${entry.id}`}
                    />
                  </div>

                  {editError && (
                    <p className="text-xs text-error">{editError}</p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={cancelEditing}
                      disabled={editSaving}
                      className="flex-1 py-2 bg-surface-elevated border border-border text-text-secondary rounded-xl text-sm font-medium"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={() => saveEditing(entry)}
                      disabled={editSaving}
                      className="flex-1 py-2 bg-primary text-white rounded-xl text-sm font-semibold disabled:opacity-50"
                    >
                      {editSaving ? t('common.saving') : t('common.save')}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  // ── Skeleton while entries haven't been fetched yet ─────────────
  // Prevents the input form from flashing before we know if today's
  // pulse is already complete.
  if (!hasFetched) {
    return (
      <div
        className="bg-surface rounded-2xl border border-border p-4 h-[72px] animate-pulse opacity-60"
        aria-hidden
        data-testid="pulse-skeleton"
      />
    );
  }

  // ── Fully complete: both (or just current-mode) pulses done ─────
  if (currentModePulse) {
    return (
      <motion.div layout className="space-y-2">
        {todayPulses.map((p) => (
          <motion.div key={p.id} layout>
            {renderCompletedPulse(p)}
          </motion.div>
        ))}
      </motion.div>
    );
  }

  // ── Input state — show earlier pulses above if they exist ───────
  const isLastStep = step === totalSteps - 1;

  return (
    <div className="space-y-3">
      {/* Any already-completed pulses from earlier today (e.g. morning
          when user is composing the evening) stay visible ABOVE the
          input so the user can review what they reflected on earlier. */}
      {todayPulses.length > 0 && (
        <div className="space-y-2">
          {todayPulses.map((p) => (
            <div key={p.id}>{renderCompletedPulse(p)}</div>
          ))}
        </div>
      )}

      <motion.div
        layout
        className="glass-card rounded-2xl p-5 space-y-5 shadow-warm-md"
        data-testid="pulse-card"
      >
        {/* Header: Bodhi listen + progress (one segment per step,
            including the body and mind check-in steps) */}
        <div className="flex items-center gap-3">
          <GuideMascot pose="listen" size="sm" animate />
          <div className="flex-1 flex gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <motion.div
                key={i}
                layout
                className={`flex-1 h-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-border'}`}
                transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 280, damping: 30 }}
              />
            ))}
          </div>
        </div>

        {/* Question — recall (evening only) reads back the morning
            intention and asks how it went; text steps show the
            existing prompts; check-in steps show body/mind. One
            question per screen. */}
        <p className="text-lg text-text-primary font-medium leading-snug">
          {isIntentionStep
            ? 'How did your morning intention go?'
            : isTextStep
            ? t(questions[textQuestionIndex].translationKey)
            : isBodyStep
            ? t('pulse.bodyPrompt')
            : t('pulse.mindPrompt')}
        </p>

        {/* Recall step — show the morning intention verbatim, then a
            row of outcome pills, then an optional obstacle textarea
            that only appears for non-"fully" answers. Skipping is
            allowed (Next without picking) and persists nothing. */}
        {isIntentionStep && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-text-tertiary font-semibold mb-1">
                This morning
              </p>
              <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                &ldquo;{morningIntention}&rdquo;
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'fully', label: 'Fully' },
                  { id: 'partially', label: 'Partially' },
                  { id: 'distracted', label: 'Got distracted' },
                  { id: 'not', label: 'Not at all' },
                ] as Array<{ id: IntentionOutcome; label: string }>
              ).map((opt) => {
                const selected = intentionOutcome === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setIntentionOutcome(selected ? null : opt.id)}
                    aria-pressed={selected}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      selected
                        ? 'bg-primary text-white border border-primary'
                        : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {intentionOutcome && intentionOutcome !== 'fully' && (
              <div className="space-y-1">
                <p className="text-xs text-text-secondary">
                  What got in the way? (optional)
                </p>
                <textarea
                  value={intentionObstacle}
                  onChange={(e) => setIntentionObstacle(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-text-primary outline-none focus:border-primary resize-none"
                />
              </div>
            )}
          </div>
        )}

        {isTextStep && (
          <>
            <textarea
              ref={textareaRef}
              value={currentValue}
              onChange={(e) => setCurrentValue(e.target.value)}
              placeholder={t('pulse.placeholder')}
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary text-sm resize-none outline-none min-h-[160px] focus:border-primary placeholder:text-text-tertiary"
              data-testid={`pulse-q${step}`}
            />

            {speechSupported && (
              <button
                {...micButtonProps}
                className={`w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                  isListening
                    ? 'bg-error text-white'
                    : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                {isListening ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                )}
                {isListening ? t('template.stopRecording') : t('template.tapToSpeak')}
              </button>
            )}
          </>
        )}

        {/* Body & Mind check-in step — five tappable emoji buttons.
            Skippable by tapping Next/Save without picking; null score
            is omitted from metadata so trends only count actual taps. */}
        {(isBodyStep || isMindStep) && (
          <div className="flex justify-between gap-1">
            {(isBodyStep ? BODY_SCALE : MIND_SCALE).map((opt) => {
              const value = isBodyStep ? bodyScore : mindScore;
              const setValue = isBodyStep ? setBodyScore : setMindScore;
              const labelPrefix = isBodyStep ? 'checkin.body' : 'checkin.mind';
              const isSelected = value === opt.score;
              return (
                <motion.button
                  key={opt.score}
                  onClick={() => setValue(opt.score)}
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.9 }}
                  animate={
                    prefersReducedMotion
                      ? undefined
                      : isSelected
                      ? { scale: 1.12, y: -2 }
                      : { scale: 1, y: 0 }
                  }
                  transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                  className={`relative flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl ${
                    isSelected ? 'opacity-100' : 'opacity-55 hover:opacity-100'
                  }`}
                  aria-label={t(`${labelPrefix}.${opt.labelKey}`)}
                  aria-pressed={isSelected}
                >
                  {isSelected && (
                    <motion.span
                      layoutId={isBodyStep ? 'pulseBodyRing' : 'pulseMindRing'}
                      className="absolute inset-0 rounded-xl bg-surface ring-2 ring-primary shadow-warm-sm"
                      transition={
                        prefersReducedMotion
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 380, damping: 28 }
                      }
                    />
                  )}
                  <span className="relative z-10 text-3xl leading-none">{opt.emoji}</span>
                  <span className="relative z-10 text-[10px] text-text-secondary leading-tight text-center">
                    {t(`${labelPrefix}.${opt.labelKey}`)}
                  </span>
                </motion.button>
              );
            })}
          </div>
        )}

        {saveError && (
          <p className="text-error text-sm text-center">{saveError}</p>
        )}

        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={goBack}
              className="flex-1 py-3 bg-surface border border-border text-text-secondary rounded-xl text-sm font-medium"
            >
              {t('common.back')}
            </button>
          )}
          {isLastStep ? (
            <button
              onClick={handleSubmit}
              // Submit needs at least the first text answer (intention
              // for morning, what-went-right for evening). Body and
              // mind on the last steps remain optional — null is OK.
              disabled={!answer1.trim() || submitting}
              className="flex-1 py-3 bg-primary text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition-opacity"
              data-testid="pulse-submit"
            >
              {submitting ? t('common.saving') : t('pulse.save')}
            </button>
          ) : (
            <button
              onClick={goNext}
              // On text steps, require non-empty before advancing. On
              // recall + body/mind steps, Next is always enabled
              // (skip = null persists nothing).
              disabled={isTextStep && !currentValue.trim()}
              className="flex-1 py-3 bg-primary text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition-opacity"
              data-testid="pulse-next"
            >
              {isTextStep ||
              isIntentionStep ||
              (isBodyStep ? bodyScore != null : mindScore != null)
                ? t('common.next')
                : t('pulse.skip')}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// Reusable emoji picker row — five tappable buttons, ring on selected.
// Used by the edit-mode form for completed pulses (live pulse steps
// inline this same shape directly because they need bigger sizing).
function EmojiPickerRow({
  options,
  value,
  onPick,
  labelPrefix,
  layoutId,
}: {
  options: ScaleOption[];
  value: number | null;
  onPick: (n: number) => void;
  labelPrefix: string;
  layoutId: string;
}) {
  return (
    <div className="flex justify-between gap-1">
      {options.map((opt) => {
        const isSelected = value === opt.score;
        return (
          <motion.button
            key={opt.score}
            onClick={() => onPick(opt.score)}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.9 }}
            animate={
              prefersReducedMotion
                ? undefined
                : isSelected
                ? { scale: 1.1, y: -1 }
                : { scale: 1, y: 0 }
            }
            transition={{ type: 'spring', stiffness: 420, damping: 18 }}
            className={`relative flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl ${
              isSelected ? 'opacity-100' : 'opacity-55 hover:opacity-100'
            }`}
            aria-label={t(`${labelPrefix}.${opt.labelKey}`)}
            aria-pressed={isSelected}
          >
            {isSelected && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-xl bg-surface-elevated ring-2 ring-primary"
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 380, damping: 28 }
                }
              />
            )}
            <span className="relative z-10 text-2xl leading-none">{opt.emoji}</span>
            <span className="relative z-10 text-[10px] text-text-secondary leading-tight text-center">
              {t(`${labelPrefix}.${opt.labelKey}`)}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
