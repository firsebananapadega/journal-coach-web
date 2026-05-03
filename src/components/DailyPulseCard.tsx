'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useJournalStore, type JournalEntry } from '@/stores/journalStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { usePushPromptStore } from '@/stores/pushPromptStore';
import { ensureSubscribed } from '@/lib/push';
import GuideMascot from '@/components/mascot/GuideMascot';
import { toLocalDateStr } from '@/lib/dateUtils';
import { t } from '@/lib/translations';
import { isSpeechRecognitionSupported } from '@/lib/speechRecognition';
import { useSelectionAwareMic } from '@/hooks/useSelectionAwareMic';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { parseIntentionToItems } from '@/lib/intentionParser';
import { getMorningPromptKey } from '@/lib/morningPrompts';

interface Props {
  entries: JournalEntry[];
}

// Three pulse touchpoints through the day. Morning + evening are the
// long-form structured pulses (intention / reflection / body / mind);
// presence is the lightweight mid-day pause captured via PresenceCapture
// on /home. They all live in journal_entries with entry_type='pulse'
// and a discriminating metadata.pulseMode, so this component can render
// all three sorted chronologically as compact done cards.
// Pulse helpers moved to src/lib/pulseTime.ts so PulseNotebookHero
// (the orchestrator) and this card share the same source of truth
// for the morning/evening boundary + done-state detection.
import {
  type PulseMode,
  eveningStartFromReminder,
  getCurrentMode,
  pulseDayOf,
  currentPulseDay,
  pulseModeOf,
} from '@/lib/pulseTime';

// Pulse mode by clock minute-of-day. Boundaries:
//   - 04:00 (240 min) → morning starts (subjective morning, so a 1AM
//                       wakeup still gets the end-of-day prompt, not
//                       morning)
//   - eveningStart (default 19:50, configurable per user) → evening
//                       starts. The user's evening reminder time minus
//                       a 5-min lead so the pulse is already in
//                       evening mode when the reminder push fires —
//                       tapping the notification lands on the right
//                       prompt, never on a stale morning view.
// Morning: 1 question. Evening: 2 questions. The morning translation
// key is RESOLVED PER DAY via getMorningPromptKey(today) — see
// src/lib/morningPrompts.ts. We keep a single-element array here so
// the rest of this component (step-counting, last-step detection)
// continues to treat morning as one text step. The actual prompt text
// is looked up dynamically below where the question renders.
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
  const showPushPrompt = usePushPromptStore((s) => s.show);
  // Profile snapshot for the "first pulse → enable reminders" gate.
  // Reading the prefs lets us suppress the prompt for users who
  // already have morning OR evening reminders enabled.
  const notificationPrefs = useAuthStore((s) => s.profile?.notification_preferences);
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

  // Evening threshold tracks the user's evening reminder time (with a
  // 5-min lead). Recomputed when the profile loads or the user changes
  // their reminder in Settings — the latter rarely happens but it's
  // free to support.
  const eveningReminder = useAuthStore(
    (s) => s.profile?.notification_preferences?.reminder_times?.evening,
  );
  const eveningStartMin = useMemo(
    () => eveningStartFromReminder(eveningReminder),
    [eveningReminder],
  );

  // Mode is recomputable: initial value is computed on mount, but a
  // service-worker `pulse-reminder` message (fired from public/sw.js
  // when the cron push lands) re-runs the evaluation so a user sitting
  // on /pulse at 19:54 sees the card flip to evening when their 19:55
  // notification arrives — without needing to reload.
  const [mode, setMode] = useState<PulseMode>(() => getCurrentMode(eveningStartMin));

  // If the threshold changes (profile loaded after first paint), make
  // sure the mode reflects the new threshold immediately.
  useEffect(() => {
    setMode(getCurrentMode(eveningStartMin));
  }, [eveningStartMin]);

  // Listen for the pulse-reminder push echo from the service worker.
  // Only the message-shape we care about triggers a re-evaluation;
  // unrelated SW messages are ignored.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | undefined;
      if (data?.type !== 'pulse-reminder') return;
      setMode(getCurrentMode(eveningStartMin));
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, [eveningStartMin]);
  const [step, setStep] = useState(0);
  const [answer1, setAnswer1] = useState('');
  const [answer2, setAnswer2] = useState('');
  // Body & Mind check-in scores — picked on the new sequential steps
  // appended after the existing text questions. Null = not picked yet
  // (user can skip by tapping Next without selecting an emoji).
  const [bodyScore, setBodyScore] = useState<number | null>(null);
  const [mindScore, setMindScore] = useState<number | null>(null);

  // Intention-outcome reflection (evening only — closes the loop on
  // the morning intention). Backed by Gollwitzer + Sheeran research
  // on if-then plans and self-monitoring of goal completion.
  //
  // Per-ITEM state: morning intentions are usually compound ("finish
  // proposal AND call mom AND exercise"). Each parsed item gets its
  // own outcome pill + optional notes textarea so the user can
  // evaluate them independently rather than collapsing everything to
  // a single overall verdict.
  type IntentionOutcome = 'fully' | 'partially' | 'distracted' | 'not';
  const [itemOutcomes, setItemOutcomes] = useState<Record<number, IntentionOutcome | null>>({});
  const [itemNotes, setItemNotes] = useState<Record<number, string>>({});
  // Loading flag while we wait on the Gemini parse of the morning
  // intention. Only relevant on first evening view of a given day.
  const [parsingIntention, setParsingIntention] = useState(false);
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
  // Morning: today's rotating question (deterministic by date hash).
  // Evening: the static two-question array. Kept in this shape so
  // textQuestionIndex bookkeeping below stays linear.
  const morningQuestionKey = useMemo(() => getMorningPromptKey(new Date()), []);
  const questions = mode === 'morning'
    ? [{ translationKey: morningQuestionKey }]
    : EVENING_QUESTIONS;

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

  // Today's morning pulse + parsed-out intention items (if logged).
  // The recall step shows each item separately so the user can
  // evaluate compound intentions individually.
  const morningPulse = useMemo(() => {
    if (mode !== 'evening') return null;
    return todayPulses.find((p) => pulseModeOf(p) === 'morning') ?? null;
  }, [mode, todayPulses]);
  const morningMeta = (morningPulse?.metadata ?? null) as Record<string, unknown> | null;
  const morningIntention = useMemo(() => {
    if (!morningMeta) return '';
    const v = morningMeta.intention;
    return typeof v === 'string' ? v.trim() : '';
  }, [morningMeta]);
  // Items already cached on the morning pulse (parsed previously).
  const cachedIntentionItems = useMemo<string[] | null>(() => {
    if (!morningMeta) return null;
    const v = morningMeta.intention_items;
    if (!Array.isArray(v)) return null;
    const cleaned = v.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
    return cleaned.length > 0 ? cleaned : null;
  }, [morningMeta]);

  // Local items state — flips between cached and freshly-parsed.
  const [parsedItems, setParsedItems] = useState<string[]>(cachedIntentionItems ?? []);
  // Sync items when the underlying morning pulse swaps (rare — same
  // device, same day — but possible if entries refetch).
  useEffect(() => {
    if (cachedIntentionItems) setParsedItems(cachedIntentionItems);
  }, [cachedIntentionItems]);

  // Lazy parse on first evening view: if we have a morning intention
  // but no cached items, fire Gemini to split it into a clean array
  // and persist back onto the morning pulse so we only do this once
  // per day.
  useEffect(() => {
    if (mode !== 'evening') return;
    if (!morningPulse || !morningIntention) return;
    if (cachedIntentionItems && cachedIntentionItems.length > 0) return;
    let cancelled = false;
    setParsingIntention(true);
    (async () => {
      try {
        const items = await parseIntentionToItems(morningIntention);
        if (cancelled) return;
        if (items.length > 0) {
          setParsedItems(items);
          // Cache on the morning pulse so future evening loads (this
          // device or another) skip the Gemini call. Merge — never
          // overwrite — so we preserve every other field.
          try {
            await updateEntry(morningPulse.id, {
              metadata: {
                ...(morningMeta ?? {}),
                intention_items: items,
              },
            });
          } catch {
            // Persist failure is non-fatal — the parsed items live
            // in this card's state for the duration of the session.
          }
        }
      } catch {
        // Already handled inside parseIntentionToItems; nothing to do.
      } finally {
        if (!cancelled) setParsingIntention(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // morningMeta intentionally excluded — using id+intention as the
    // identity, and morningMeta is a fresh object each render which
    // would cause re-fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, morningPulse?.id, morningIntention, cachedIntentionItems]);

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

        // Intention-outcome — store the morning intention verbatim
        // PLUS a per-item evaluation array. Each item carries its own
        // outcome pill + optional note. Empty notes are omitted, and
        // items the user didn't touch are skipped (no synthesized
        // null-outcome rows).
        if (hasIntentionRecall) {
          metadata.prior_intention = morningIntention;
          if (parsedItems.length > 0) {
            const evaluatedItems = parsedItems
              .map((text, i) => {
                const outcome = itemOutcomes[i] ?? null;
                const note = (itemNotes[i] ?? '').trim();
                if (!outcome && !note) return null;
                return {
                  text,
                  outcome,
                  ...(note ? { note } : {}),
                };
              })
              .filter((x): x is { text: string; outcome: IntentionOutcome | null; note?: string } => x !== null);
            if (evaluatedItems.length > 0) {
              metadata.prior_intention_items = evaluatedItems;
            }
          }
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
      setItemOutcomes({});
      setItemNotes({});
      setStep(0);
      celebrate();
      showToast(
        mode === 'morning' ? t('pulse.morningSaved') : t('pulse.eveningSaved')
      );
      // First-pulse-ever push prompt. If the user just saved their
      // FIRST pulse (no pulse entries existed before this save) AND
      // they have neither morning nor evening reminders enabled,
      // prompt them to turn reminders on. Otherwise the user is
      // unlikely to come back tomorrow.
      // Captured BEFORE the createEntry call would have been ideal,
      // but the entries slice already reflects optimistic insert by
      // the time we reach here — so we count "before this save" by
      // subtracting 1 from the current pulse-entry count.
      try {
        const pulseCountAfter = entries.filter((e) => e.entry_type === 'pulse').length;
        const wasFirstPulse = pulseCountAfter <= 1;
        const morningOn = notificationPrefs?.morning_reminder === true;
        const eveningOn = notificationPrefs?.evening_reminder === true;
        if (wasFirstPulse && !morningOn && !eveningOn) {
          // Mirror the voice-page pattern: only show the prompt if
          // we're not already 'ok' (subscribed + permitted). The
          // prompt's own dismissed-flag handling prevents repeat
          // nags within 30 days.
          const push = await ensureSubscribed();
          if (push !== 'ok') {
            showPushPrompt();
          }
        }
      } catch (err) {
        console.warn('[DailyPulseCard] push prompt gate failed', err);
      }
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
    const label =
      m === 'morning'
        ? t('pulse.morningDone')
        : m === 'evening'
        ? t('pulse.eveningDone')
        : t('pulse.presenceDone');
    const icon = m === 'morning' ? '☀️' : m === 'evening' ? '🌙' : '🌤️';
    const isExpanded = expandedIds.has(entry.id);
    const isEditing = editingId === entry.id;

    // Presence is a lighter card — no edit mode, no body/mind picker
    // re-roll. Just attention + one_word in the expanded section.
    if (m === 'presence') {
      const attention = (meta.attention as string) ?? '';
      const oneWord = (meta.one_word as string) ?? '';
      const time = new Date(entry.created_at).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      });
      return (
        <motion.div
          layout
          className="bg-surface rounded-2xl border border-border p-4 shadow-warm-sm"
          data-testid="pulse-completed-presence"
        >
          <button
            onClick={() => toggleExpanded(entry.id)}
            className="w-full flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{icon}</span>
              <span className="font-semibold text-text-primary text-sm">{label}</span>
              <span className="text-[11px] text-text-tertiary">{time}</span>
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
            {isExpanded && (attention || oneWord) && (
              <motion.div
                initial={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
                animate={prefersReducedMotion ? undefined : { height: 'auto', opacity: 1 }}
                exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  {attention && (
                    <p className="text-[15px] text-text-primary leading-relaxed">
                      {attention}
                    </p>
                  )}
                  {oneWord && (
                    <p className="text-sm text-text-secondary italic">
                      &ldquo;{oneWord}&rdquo;
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      );
    }

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
                <div className="mt-3 space-y-3 pt-3 border-t border-border">
                  {m === 'morning' && meta.intention && (
                    <div>
                      <span className="text-xs font-medium text-primary uppercase tracking-wide">{t('pulse.intentionLabel')}</span>
                      <p className="text-[15px] text-text-primary mt-1 leading-relaxed whitespace-pre-wrap">{meta.intention}</p>
                    </div>
                  )}
                  {/* Evening intention-outcome — per-item summary.
                      New schema: prior_intention_items is an array of
                      { text, outcome, note }. Old schema (single
                      overall prior_intention_outcome + obstacle) is
                      still rendered below for back-compat with
                      pulses written before the per-item rewrite. */}
                  {m === 'evening' && Array.isArray((entry.metadata as Record<string, unknown> | null)?.prior_intention_items) && (
                    <div>
                      <span className="text-xs font-medium text-primary uppercase tracking-wide">Morning intention</span>
                      <ul className="space-y-3 mt-2">
                        {((entry.metadata as Record<string, unknown>).prior_intention_items as Array<{
                          text: string;
                          outcome: 'fully' | 'partially' | 'distracted' | 'not' | null;
                          note?: string;
                        }>).map((it, i) => {
                          const outcomeLabel =
                            it.outcome === 'fully'
                              ? '✓ Fully'
                              : it.outcome === 'partially'
                              ? '~ Partially'
                              : it.outcome === 'distracted'
                              ? 'Drifted'
                              : it.outcome === 'not'
                              ? '✗ Not at all'
                              : null;
                          return (
                            <li key={i}>
                              <div className="flex items-start gap-2.5">
                                <span className="text-primary mt-1 shrink-0" aria-hidden>✦</span>
                                <span className="text-[16px] font-medium text-text-primary leading-snug">{it.text}</span>
                              </div>
                              {outcomeLabel && (
                                <p className="ml-6 mt-1 text-[13px] font-semibold text-text-secondary">
                                  {outcomeLabel}
                                </p>
                              )}
                              {it.note && (
                                <p className="ml-6 mt-1 text-[14px] text-text-secondary leading-relaxed whitespace-pre-wrap">
                                  {it.note}
                                </p>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {/* Legacy single-overall outcome — only renders when
                      the per-item array is absent. Old pulses written
                      before the rewrite still display correctly. */}
                  {m === 'evening' &&
                    !Array.isArray((entry.metadata as Record<string, unknown> | null)?.prior_intention_items) &&
                    meta.prior_intention_outcome && (
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
                      <span className="text-xs font-medium text-primary uppercase tracking-wide">{t('pulse.wentRightLabel')}</span>
                      <p className="text-[15px] text-text-primary mt-1 leading-relaxed whitespace-pre-wrap">{meta.wentRight}</p>
                    </div>
                  )}
                  {m === 'evening' && meta.doneBetter && (
                    <div>
                      <span className="text-xs font-medium text-accent uppercase tracking-wide">{t('pulse.doneBetterLabel')}</span>
                      <p className="text-[15px] text-text-primary mt-1 leading-relaxed whitespace-pre-wrap">{meta.doneBetter}</p>
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
                        className="w-full px-3.5 py-2.5 bg-surface-elevated border border-border rounded-xl text-base leading-relaxed text-text-primary outline-none focus:border-primary resize-none"
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
                          className="w-full px-3.5 py-2.5 bg-surface-elevated border border-border rounded-xl text-base leading-relaxed text-text-primary outline-none focus:border-primary resize-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-accent">{t('pulse.doneBetterLabel')}</span>
                        <textarea
                          value={editDoneBetter}
                          onChange={(e) => setEditDoneBetter(e.target.value)}
                          rows={3}
                          className="w-full px-3.5 py-2.5 bg-surface-elevated border border-border rounded-xl text-base leading-relaxed text-text-primary outline-none focus:border-primary resize-none"
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

  // ── Done with the current mode → render nothing.
  // PulseNotebookHero (the orchestrator) decides what comes next
  // (mid-day Presence, then Evening, then nothing). Past pulses
  // already render in the feed below as PulseEntryCard, so a
  // collapsed "✓ done" header here would be a duplicate.
  if (currentModePulse) {
    return null;
  }

  // ── Input state — clean form, no historical headers above.
  // (Previously stacked any earlier-today pulses on top; that was
  // duplicating the feed below.)
  const isLastStep = step === totalSteps - 1;

  return (
    <div className="space-y-3">
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
        <div>
          <p className="text-lg text-text-primary font-medium leading-snug">
            {isIntentionStep
              ? 'How did your morning intention go?'
              : isTextStep
              ? t(questions[textQuestionIndex].translationKey)
              : isBodyStep
              ? t('pulse.bodyPrompt')
              : t('pulse.mindPrompt')}
          </p>
          {/* Redundancy nudge — shown only on the morning text step.
              Solves the "I keep listing tasks in my Pulse" failure mode
              by pointing them at /today, without removing freedom. */}
          {isTextStep && mode === 'morning' && (
            <p className="text-xs text-text-tertiary mt-1.5 leading-snug">
              {t('pulse.morning.subtext')}
            </p>
          )}
        </div>

        {/* Recall step — clean bullet list of parsed intentions, each
            with its own outcome pills + optional notes textarea. The
            displayed items come from a Gemini parse of the raw morning
            transcript (cached on the morning pulse so we only parse
            once per day). Each compound intention becomes its own row,
            so "finish the proposal AND call mom AND exercise" gets
            evaluated as 3 distinct items rather than one overall
            verdict. */}
        {isIntentionStep && (
          <div className="space-y-4">
            <p className="text-[11px] uppercase tracking-widest text-text-tertiary font-semibold">
              Earlier today, you set out to:
            </p>
            {parsingIntention && parsedItems.length === 0 ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-3 w-3/4 bg-surface rounded" />
                <div className="h-3 w-2/3 bg-surface rounded" />
                <div className="h-3 w-1/2 bg-surface rounded" />
              </div>
            ) : parsedItems.length === 0 ? (
              <p className="text-sm text-text-secondary leading-relaxed">
                {morningIntention}
              </p>
            ) : (
              <ul className="space-y-4">
                {parsedItems.map((item, i) => {
                  const outcome = itemOutcomes[i] ?? null;
                  const note = itemNotes[i] ?? '';
                  return (
                    <li
                      key={i}
                      className="space-y-3 pb-4 border-b border-border/40 last:border-b-0 last:pb-0"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="text-primary mt-1 shrink-0 text-base" aria-hidden>
                          ✦
                        </span>
                        <span className="text-[17px] font-medium text-text-primary leading-snug">
                          {item}
                        </span>
                      </div>
                      {/* Outcome pills — single line, equally-sized via
                          flex-1 so all four fit on iPhone-narrow widths
                          without wrapping. Taller touch target (py-2)
                          and larger label so they're easier to read +
                          tap on mobile. Re-tap toggles off. */}
                      <div className="flex items-center gap-1.5 flex-nowrap pl-7">
                        {(
                          [
                            { id: 'fully', label: 'Fully' },
                            { id: 'partially', label: 'Partial' },
                            { id: 'distracted', label: 'Drift' },
                            { id: 'not', label: 'None' },
                          ] as Array<{ id: IntentionOutcome; label: string }>
                        ).map((opt) => {
                          const selected = outcome === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() =>
                                setItemOutcomes((prev) => ({
                                  ...prev,
                                  [i]: selected ? null : opt.id,
                                }))
                              }
                              aria-pressed={selected}
                              className={`flex-1 min-w-0 px-2 py-2 rounded-full text-[13px] font-semibold transition-colors whitespace-nowrap ${
                                selected
                                  ? 'bg-primary text-white border border-primary shadow-warm-sm'
                                  : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      {/* Per-item note — always available so the user
                          can write what actually happened (or what got
                          in the way) without needing to first commit
                          to a pill. */}
                      <textarea
                        value={note}
                        onChange={(e) =>
                          setItemNotes((prev) => ({ ...prev, [i]: e.target.value }))
                        }
                        placeholder="How did it go? (optional)"
                        rows={2}
                        className="ml-7 w-[calc(100%-1.75rem)] px-3.5 py-2.5 bg-surface border border-border rounded-xl text-base leading-relaxed text-text-primary placeholder:text-text-tertiary outline-none focus:border-primary resize-none"
                      />
                    </li>
                  );
                })}
              </ul>
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
              className="w-full px-4 py-3.5 bg-surface border border-border rounded-xl text-text-primary text-[17px] leading-relaxed resize-none outline-none min-h-[180px] focus:border-primary placeholder:text-text-tertiary"
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
