'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { isSpeechRecognitionSupported } from '@/lib/speechRecognition';
import { useSelectionAwareMic } from '@/hooks/useSelectionAwareMic';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { useJournalStore } from '@/stores/journalStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { classifyCapture, hasContent, parseIntentFallback, type CaptureResult } from '@/lib/captureEngine';
import { commitCapture } from '@/lib/captureCommit';
import { usePriorityStore, type PriorityItem, type GroceryGroup } from '@/stores/priorityStore';
import { useListStore } from '@/stores/listStore';
import { useTaskStore } from '@/stores/taskStore';
import { toLocalDateStr } from '@/lib/dateUtils';
import { getLanguage } from '@/lib/language';
import { t } from '@/lib/translations';
import { CapturePreviewSheet, type CompletionMatch, type PriorityDestinations } from '@/components/CapturePreviewSheet';

export default function VoiceEntryPage() {
  const router = useRouter();
  const createEntry = useJournalStore((s) => s.createEntry);
  const updateEntry = useJournalStore((s) => s.updateEntry);
  const celebrate = useUiStore((s) => s.celebrate);
  const showToast = useUiStore((s) => s.showToast);
  const [transcript, setTranscript] = useState('');
  const [speechSupported] = useState(() => typeof window !== 'undefined' && isSpeechRecognitionSupported());
  const startTime = useRef(Date.now());
  const transcriptRef = useRef('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Selection-aware mic. autoRestart=true because this surface is the
  // dedicated long-form capture — the browser auto-ending recognition
  // after ~60s would silently cut a longer capture otherwise. Keeps
  // the same splice behavior as every other tap-to-speak surface.
  const {
    isListening,
    toggle: toggleMic,
    micButtonProps,
  } = useSelectionAwareMic({
    textareaRef,
    value: transcript,
    onChange: setTranscript,
    autoRestart: true,
  });

  // Pre-save preview state. classifyCapture's result lives here from the
  // moment it resolves until the user either confirms (writes to stores)
  // or cancels (drops it). Keeps the destination stores untouched until
  // the user has reviewed.
  const [pendingCapture, setPendingCapture] = useState<CaptureResult | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [classifyingLong, setClassifyingLong] = useState(false);
  // Fallback / error surface — non-null when the preview is showing a
  // regex-only guess instead of a real Gemini classification. Drives
  // the warning banner + Retry button in the sheet. We keep the user
  // IN the preview (so they can still save what's there) but make it
  // visible that the AI step didn't succeed.
  const [fellBack, setFellBack] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [debugCopied, setDebugCopied] = useState(false);
  // Snapshot of today's lists at the moment preview opens — used by the
  // sheet's fuzzy completion matcher. Gets refreshed each open.
  const [snapshotPriorities, setSnapshotPriorities] = useState<PriorityItem[]>([]);
  const [snapshotGroceries, setSnapshotGroceries] = useState<GroceryGroup[]>([]);
  // User's project lists — drives the destination dropdown in the preview
  // sheet. Fetched once on mount; the listStore caches across pages.
  const lists = useListStore((s) => s.lists);
  const fetchLists = useListStore((s) => s.fetchLists);
  const fetchTasks = useTaskStore((s) => s.fetchAll);
  useEffect(() => {
    fetchLists();
    fetchTasks();
  }, [fetchLists, fetchTasks]);
  // Debug trace — same pattern as /guided. After 10s of `classifying`,
  // an inline panel surfaces the timeline so the user can copy it and
  // share what step actually hung. Reset on each new triggerCapturePreview.
  type TraceEvent = { t: number; label: string; meta?: Record<string, unknown> };
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const traceStartRef = useRef<number>(0);

  useEffect(() => {
    startTime.current = Date.now();
    // No textarea auto-focus: this is the voice surface. The mic auto-
    // starts (see effect below); popping the keyboard on top of that is
    // hostile. The user can tap the textarea explicitly to type.
  }, []);

  // Auto-start the mic once on mount. Defer one tick so the textarea
  // is mounted and any permission prompt happens after the page paints.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!speechSupported) return;
    autoStartedRef.current = true;
    const id = window.setTimeout(() => {
      void toggleMic();
    }, 80);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechSupported]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Auto-scroll textarea to bottom during mic listening
  useEffect(() => {
    if (isListening && textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [transcript, isListening]);

  // Pull a fresh snapshot of today's lists for the preview's fuzzy
  // matcher. Reads through priorityStore so we don't go to Supabase twice.
  const loadSnapshot = async () => {
    const todayStr = toLocalDateStr(new Date());
    await usePriorityStore.getState().fetchPriorities(todayStr);
    setSnapshotPriorities(usePriorityStore.getState().items);
    setSnapshotGroceries(usePriorityStore.getState().groceries);
  };

  // Saves the raw transcript as a voice journal entry. Called as a
  // safety net — capture is for tasks/groceries/priorities, but the
  // user's words shouldn't be lost. Runs in the background and is
  // safe to call even if the user later confirms a structured save.
  const savedRawRef = useRef(false);
  const savedRawEntryIdRef = useRef<string | null>(null);
  const saveRawTranscript = useCallback(async () => {
    if (savedRawRef.current) return;
    savedRawRef.current = true;
    const text = transcriptRef.current.trim();
    if (!text) return;
    const duration = Math.round((Date.now() - startTime.current) / 1000);
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    try {
      const entry = await createEntry({
        entry_type: 'voice',
        content_text: text,
        title: `Capture — ${new Date().toLocaleDateString()}`,
        mood_score: null,
        mood_label: null,
        duration_seconds: duration,
        word_count: wordCount,
      });
      savedRawEntryIdRef.current = entry.id;
    } catch {
      // Silent — capture preview is the user-visible feedback.
    }
  }, [createEntry]);

  // Trace recorder — appends an event with the elapsed time since
  // triggerCapturePreview kicked off. Capped at 30 events so the panel
  // fits on a phone screenshot.
  const trace = useCallback((label: string, meta?: Record<string, unknown>) => {
    const t = performance.now() - traceStartRef.current;
    setTraceEvents((prev) => {
      const next = [...prev, { t, label, meta }];
      return next.length > 30 ? next.slice(next.length - 30) : next;
    });
  }, []);

  // 10s after `classifying` flips true, surface the debug panel so the
  // user can see exactly which step is taking forever (and copy it).
  useEffect(() => {
    if (!classifying) {
      setClassifyingLong(false);
      return;
    }
    const id = window.setTimeout(() => setClassifyingLong(true), 10_000);
    return () => window.clearTimeout(id);
  }, [classifying]);

  // Promise.race against a deadline — converts a hang into an explicit
  // throw the catch block can render. Used around every await inside
  // triggerCapturePreview so nothing can silently spin forever.
  function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
      ),
    ]);
  }

  const formatTraceForCopy = useCallback(() => {
    const header = [
      `surface=/voice`,
      `transcriptChars=${transcriptRef.current.length}`,
      `ts=${new Date().toISOString()}`,
    ].join(' · ');
    const lines = traceEvents.map((e) => {
      const sec = (e.t / 1000).toFixed(2).padStart(6, ' ');
      const meta = e.meta
        ? '  ' + Object.entries(e.meta).map(([k, v]) => `${k}=${v}`).join(' ')
        : '';
      return `${sec}s  ${e.label}${meta}`;
    });
    return `${header}\n\n${lines.join('\n')}`;
  }, [traceEvents]);

  const copyDebug = async () => {
    try {
      await navigator.clipboard.writeText(formatTraceForCopy());
      setDebugCopied(true);
      setTimeout(() => setDebugCopied(false), 1500);
    } catch {
      // Clipboard API blocked (insecure context) — fall back to a
      // hidden textarea + execCommand so the copy still lands.
      const ta = document.createElement('textarea');
      ta.value = formatTraceForCopy();
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setDebugCopied(true);
        setTimeout(() => setDebugCopied(false), 1500);
      } catch {}
      document.body.removeChild(ta);
    }
  };

  // Triggered when the mic stops with content. Saves raw to journal in
  // the background, runs classifyCapture, opens the preview sheet so
  // the user can review the parsed tasks/priorities/groceries before
  // anything hits the destination stores. Every await is bounded by a
  // timeout so a single hang (e.g. Supabase auth, Gemini network) can't
  // strand the user on "Saving…" forever.
  const triggerCapturePreview = useCallback(async () => {
    if (!transcriptRef.current.trim() || classifying) return;
    // Reset trace + start the timer that the debug panel measures from.
    traceStartRef.current = performance.now();
    setTraceEvents([]);
    setClassifying(true);
    trace('triggerCapturePreview start', { chars: transcriptRef.current.length });

    // Background save of the raw transcript so the user's words are
    // never lost regardless of what happens with classification. Bounded
    // so it can't pin classifying=true forever from the background.
    void withTimeout(saveRawTranscript(), 8000, 'saveRawTranscript').then(
      () => trace('saveRawTranscript ok'),
      (err) => trace('saveRawTranscript failed', { msg: err instanceof Error ? err.message : String(err) }),
    );

    // Intent-aware fallback: when Gemini throws OR returns empty, route
    // by regex signals — task verbs → priorities, grocery cues → groceries,
    // ambiguous → single Inbox priority. The old behavior dumped
    // EVERYTHING into a "General" grocery, which silently mis-routed
    // tasks with project mentions. This fallback is conservative in
    // the other direction: it prefers priorities when in doubt.
    const buildFallback = (): CaptureResult =>
      parseIntentFallback(transcriptRef.current);

    // Reset per-run fallback/error signals so a prior failed run
    // doesn't leave a stale banner in the preview.
    setFellBack(false);
    setClassifyError(null);

    try {
      trace('classify start');
      // Pass the user's current grocery + priority items as context so
      // Gemini can prefer "completion" classification when their speech
      // references something already on the list ("I bought celery"
      // matches the existing celery item rather than adding a duplicate).
      const groceryNames = snapshotGroceries.flatMap((g) => g.items.map((i) => i.name));
      const priorityTexts = snapshotPriorities.map((p) => p.text);
      const result = await withTimeout(
        classifyCapture(transcriptRef.current, {
          onTrace: trace,
          existingGroceries: groceryNames,
          existingPriorities: priorityTexts,
        }),
        30000,
        'classifyCapture',
      );
      trace('classify ok', {
        priorities: result.priorities.length,
        groceries: result.groceries.length,
        plans: result.plans.length,
        completions: result.completions.length,
      });

      const todayStr = toLocalDateStr(new Date());
      trace('fetchPriorities start', { date: todayStr });
      await withTimeout(
        usePriorityStore.getState().fetchPriorities(todayStr),
        5000,
        'fetchPriorities',
      );
      trace('fetchPriorities ok');

      setSnapshotPriorities(usePriorityStore.getState().items);
      setSnapshotGroceries(usePriorityStore.getState().groceries);
      const emptyResult = !hasContent(result);
      const finalResult = emptyResult ? buildFallback() : result;
      if (emptyResult) {
        setFellBack(true);
        setClassifyError('Classifier returned no content — used a regex guess.');
      }
      trace('open preview', { fellBack: emptyResult });
      setPendingCapture(finalResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      trace('error caught', { msg });
      console.warn('Capture classification failed:', err);
      // Never strand the user on the mic page with nothing. Fall back
      // to intent-aware routing so at least the right KIND of item
      // shows up in the preview (tasks for task-shaped speech, etc).
      // The banner + Retry button in the sheet gives the user a path
      // to re-run Gemini once the underlying issue clears.
      setFellBack(true);
      setClassifyError(
        msg.includes('timed out')
          ? 'The classifier took too long — used a regex guess. Tap Retry to try again.'
          : `Classifier failed — used a regex guess. (${msg})`,
      );
      setPendingCapture(buildFallback());
    } finally {
      setClassifying(false);
    }
  }, [classifying, saveRawTranscript, trace]);

  // Runs after the user confirms the preview. All STRUCTURED-item
  // writes (priorities, plans, groceries, etc.) happen here. The raw
  // transcript was already saved as a journal entry by
  // saveRawTranscript when the mic stopped, so we don't create another
  // entry here.
  const commitEverything = async (
    edited: CaptureResult,
    completionMatches: CompletionMatch[],
    destinations: PriorityDestinations,
  ) => {
    const todayStr = toLocalDateStr(new Date());

    // Priorities + groceries → shared router. Today/Inbox/Lists/new-list
    // are all handled inside commitCapture; the legacy plans channel is
    // ignored (events flow as priorities-with-time now).
    const lists = useListStore.getState().lists;
    await commitCapture(edited, destinations, {
      selectedDate: todayStr,
      lists,
    });

    // Route the raw transcript to the notebook Gemini classified (or
    // the user's override). Raw was saved with the default Journal
    // notebook by journalStore.createEntry; move it if Gemini picked
    // something else.
    if (savedRawEntryIdRef.current && edited.notebook_slug) {
      try {
        const nb = useNotebookStore
          .getState()
          .notebooks.find((n) => n.slug === edited.notebook_slug);
        if (nb) {
          await updateEntry(savedRawEntryIdRef.current, { notebook_id: nb.id });
        }
      } catch {
        // Silent — entry is still saved in its default notebook.
      }
    }

    // Ideas, gratitude → localStorage (unchanged)
    if (edited.ideas.length > 0) {
      try {
        const existing = JSON.parse(localStorage.getItem('journal_ideas') || '[]');
        const newItems = edited.ideas.map((txt) => ({ id: crypto.randomUUID(), text: txt, createdAt: new Date().toISOString() }));
        localStorage.setItem('journal_ideas', JSON.stringify([...newItems, ...existing]));
      } catch {}
    }
    if (edited.gratitude.length > 0) {
      try {
        const existing = JSON.parse(localStorage.getItem('journal_gratitude') || '[]');
        const newItems = edited.gratitude.map((txt) => ({ id: crypto.randomUUID(), text: txt, createdAt: new Date().toISOString() }));
        localStorage.setItem('journal_gratitude', JSON.stringify([...newItems, ...existing]));
      } catch {}
    }

    // Intentions → user profile
    if (edited.intentions.length > 0) {
      const profile = useAuthStore.getState().profile;
      const currentIntentions = profile?.intentions || [];
      const newIntentions = edited.intentions.filter((i) => !currentIntentions.includes(i));
      if (newIntentions.length > 0) {
        useAuthStore.getState().updateProfile({ intentions: [...currentIntentions, ...newIntentions] });
      }
    }

    // Habits → localStorage (as idea, unchanged)
    if (edited.habits.length > 0) {
      try {
        const existing = JSON.parse(localStorage.getItem('journal_ideas') || '[]');
        const newItems = edited.habits.map((txt) => ({ id: crypto.randomUUID(), text: `Habit idea: ${txt}`, createdAt: new Date().toISOString() }));
        localStorage.setItem('journal_ideas', JSON.stringify([...newItems, ...existing]));
      } catch {}
    }

    // Voice check-off — apply each confirmed completion match. Skip
    // matches with no target (Gemini detected the phrase but fuzzy
    // match couldn't find an item) — except for `bought` completions
    // which fall back to a new General grocery so the spoken item
    // isn't silently lost.
    const fallbackBoughtItems: string[] = [];
    for (const m of completionMatches) {
      if (!m.target) {
        if (m.intent.type === 'bought') {
          fallbackBoughtItems.push(m.intent.phrase);
        }
        continue;
      }
      try {
        if (m.intent.type === 'skip') {
          if (m.target.kind === 'priority') {
            await usePriorityStore.getState().removeItem(m.target.item.id);
          } else {
            await usePriorityStore
              .getState()
              .removeGroceryItem(m.target.group.id, m.target.item.id);
          }
        } else {
          if (m.target.kind === 'priority') {
            await usePriorityStore.getState().markItemDone(m.target.item.id);
          } else {
            await usePriorityStore
              .getState()
              .markGroceryDone(m.target.group.id, m.target.item.id);
          }
        }
      } catch (e) {
        console.warn('completion application failed', m.intent, e);
      }
    }
    if (fallbackBoughtItems.length > 0) {
      try {
        await usePriorityStore.getState().addGroceryGroups(todayStr, [
          {
            id: crypto.randomUUID(),
            store: 'General',
            items: fallbackBoughtItems.map((name) => ({
              id: crypto.randomUUID(),
              name,
              completed: true, // already bought; mark as done
            })),
          },
        ]);
      } catch (e) {
        console.warn('fallback grocery add failed', e);
      }
    }

    celebrate();
    showToast(t('write.saved'));
    // Return to the Tasks Wall the user came from. Previously routed
    // to /home which silently flipped them to the Journal Wall.
    router.push('/today');
  };

  // Auto-trigger the capture preview the moment the mic stops with
  // content. We watch isListening transitioning false and only fire
  // once per stop. The wasListeningRef guard prevents the effect from
  // firing on the initial mount (before the user has spoken).
  const wasListeningRef = useRef(false);
  useEffect(() => {
    if (isListening) {
      wasListeningRef.current = true;
      return;
    }
    if (wasListeningRef.current && transcriptRef.current.trim() && !pendingCapture) {
      wasListeningRef.current = false;
      void triggerCapturePreview();
    }
  }, [isListening, pendingCapture, triggerCapturePreview]);

  return (
    <div className="flex flex-col h-screen bg-bg">
      {/* Header — title removed; the page is purpose-clear from the
          big mic indicator and the placeholder text in the textarea.
          X button is a 44x44 hit area with a clearly readable glyph
          (per Apple HIG minimum touch target). */}
      <div className="flex items-center justify-between px-3 pt-2 pb-2 border-b border-border flex-shrink-0">
        <button
          onClick={() => router.push('/today')}
          className="w-11 h-11 flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
          aria-label={t('common.cancel')}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div className="w-11" />
      </div>

      {/* Textarea — capped height, scrolls internally */}
      <div className="px-5 pt-4 flex-shrink-0" style={{ height: '26vh' }}>
        {!speechSupported && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 mb-3">
            <p className="text-xs text-warning">{t('voice.browserWarning')}</p>
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={transcript}
          readOnly={isListening}
          onChange={(e) => {
            if (!isListening) {
              setTranscript(e.target.value);
            }
          }}
          className={`w-full h-full text-text-primary text-[15px] leading-relaxed bg-transparent outline-none resize-none overflow-y-auto placeholder:text-text-tertiary ${
            isListening ? 'caret-transparent' : ''
          }`}
          placeholder={t('voice.capturePlaceholder')}
        />
      </div>

      {/* Spacer — pushes the mic block to the bottom of the screen so
          it lands where the thumb naturally rests (roughly the same Y
          as the Tasks-wall center capture button). */}
      <div className="flex-1" />

      {/* Bottom section — mic-only. Capture is for tasks/groceries
          /priorities, not journal entries, so there's no mood selector
          and no explicit "Save entry" step. Stopping the mic
          automatically triggers classify + opens the preview sheet
          where the user reviews what was recognized. */}
      <div
        className="flex-shrink-0 flex flex-col items-center px-5 pt-4 space-y-3"
        style={{ paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))' }}
      >
        {classifying && (
          <p className="text-xs text-text-tertiary italic">{t('preview.saving')}</p>
        )}

        {/* Debug timeline — only renders if classifying has lasted >10s.
            Mirrors the panel on /guided so the user can screenshot or
            copy the trace and show exactly which milestone hung. */}
        {classifyingLong && (
          <div className="w-full bg-surface border border-border rounded-xl p-3 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-text-tertiary">
              <span>⏱ debug — tap copy and share with support</span>
              <button
                onClick={copyDebug}
                className="text-primary font-semibold normal-case tracking-normal"
              >
                {debugCopied ? t('guided.debugCopied') : t('guided.debugCopy')}
              </button>
            </div>
            <div className="font-mono text-[11px] leading-snug text-text-secondary max-h-[180px] overflow-y-auto">
              {traceEvents.map((e, i) => (
                <div key={i} className="whitespace-pre">
                  {(e.t / 1000).toFixed(2).padStart(6, ' ')}s  {e.label}
                  {e.meta
                    ? '  ' + Object.entries(e.meta).map(([k, v]) => `${k}=${v}`).join(' ')
                    : ''}
                </div>
              ))}
            </div>
          </div>
        )}

        {speechSupported && isListening && (
          <button
            {...micButtonProps}
            disabled={classifying}
            className="relative w-16 h-16 rounded-full flex items-center justify-center transition-colors shadow-lg bg-error mic-pulse shadow-error/30 disabled:opacity-60"
            aria-label={t('template.stopRecording')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white" aria-hidden>
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        )}

        {speechSupported && !isListening && !classifying && (
          <button
            {...micButtonProps}
            className="relative w-16 h-16 rounded-full flex items-center justify-center transition-colors shadow-lg bg-primary shadow-primary/30 hover:bg-primary-dark"
            aria-label={t('template.tapToSpeak')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </button>
        )}

        {/* "Listening" label with three pulsing dots — confirms the mic
            is alive even while the textarea hasn't filled yet. Same
            visual vocabulary as the guided session's thinking dots. */}
        {isListening && (
          <div
            className="flex items-center gap-1.5 text-xs font-medium text-error"
            aria-live="polite"
          >
            <span>{t('voice.listening')}</span>
            {!prefersReducedMotion && (
              <span className="flex items-center gap-1" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="inline-block w-1 h-1 rounded-full bg-error"
                    animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                    transition={{
                      duration: 0.9,
                      repeat: Infinity,
                      delay: i * 0.15,
                      ease: 'easeInOut',
                    }}
                  />
                ))}
              </span>
            )}
          </div>
        )}
      </div>

      <CapturePreviewSheet
        open={pendingCapture !== null}
        result={pendingCapture}
        existingPriorities={snapshotPriorities}
        existingGroceries={snapshotGroceries}
        lists={lists}
        busy={previewBusy}
        fellBack={fellBack}
        classifyError={classifyError}
        onRetryClassify={async () => {
          // Re-run classification on the same transcript. Close the
          // sheet first so the user sees the "Saving…" / classifying
          // state return, then triggerCapturePreview reopens it with
          // the fresh result (or a fresh fallback).
          setPendingCapture(null);
          await triggerCapturePreview();
        }}
        onCancel={() => setPendingCapture(null)}
        onConfirm={async (edited, matches, destinations) => {
          setPreviewBusy(true);
          try {
            // 20s ceiling on the whole commit. Previously an unbounded
            // Supabase / Gemini / list-create chain could pin "Saving…"
            // forever with no feedback. On timeout we surface a toast,
            // drop busy so the user can retry or edit, and KEEP the
            // preview open so their edits don't vanish.
            await withTimeout(
              commitEverything(edited, matches, destinations),
              20000,
              'commitEverything',
            );
            setPendingCapture(null);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn('commit failed:', err);
            showToast(
              msg.startsWith('commitEverything timed out')
                ? t('preview.saveTimeout') || 'Save took too long — try again.'
                : t('preview.saveFailed') || 'Couldn\u2019t save. Try again.',
            );
          } finally {
            setPreviewBusy(false);
          }
        }}
      />
    </div>
  );
}
