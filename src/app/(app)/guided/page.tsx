'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import Mascot from '@/components/mascot/Mascot';
import RichGuideText from './RichGuideText';
import { prefersReducedMotion } from '@/lib/motionVariants';
import {
  getGuideResponse,
  getClosingMessage,
  getTimeOfDay,
  RateLimitError,
  SESSION_MODE_OPTIONS,
  type SessionMode,
} from '@/lib/guideEngine';
import type { ConversationExchange } from '@/lib/guideEngine';
import { getGuideOrDefault, getLocalizedGreetings, type GuideId } from '@/lib/guideConfigs';
import { getLocale } from '@/lib/language';
import { isSpeechRecognitionSupported } from '@/lib/speechRecognition';
import { useOnline } from '@/lib/networkStatus';
import { useSelectionAwareMic } from '@/hooks/useSelectionAwareMic';
import { useJournalStore } from '@/stores/journalStore';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { supabase } from '@/lib/supabase';
// MoodSelector import removed — wrap-up flow no longer used.
import { getLanguage } from '@/lib/language';
import { t } from '@/lib/translations';

interface Exchange {
  question: string;
  answer: string;
  timestamp: string;
}

// Auto-grow input that starts as a single line and expands up to ~6
// lines as content is added. Past that it scrolls internally so the
// dock height never overwhelms the chat above. Uses an imperative
// ref-passed textarea + a `scrollHeight`-based effect — simpler than
// a CSS-only solution (which would need `field-sizing: content`,
// not yet broadly supported on iOS Safari).
const AutoGrowTextarea = (() => {
  function Inner(
    {
      value,
      onChange,
      onSubmit,
      placeholder,
      isListening,
    }: {
      value: string;
      onChange: (v: string) => void;
      onSubmit: () => void;
      placeholder: string;
      isListening: boolean;
    },
    ref: React.ForwardedRef<HTMLTextAreaElement>,
  ) {
    const localRef = useRef<HTMLTextAreaElement>(null);
    // Forward the ref so the parent can imperatively focus / inject
    // mic transcript via useSelectionAwareMic's textareaRef.
    useImperativeHandle(ref, () => localRef.current as HTMLTextAreaElement);

    // Resize on every value change — set height to 'auto' first so
    // shrink-back works when the user deletes content.
    useEffect(() => {
      const ta = localRef.current;
      if (!ta) return;
      ta.style.height = 'auto';
      // Cap at ~6 lines (line-height ~22px * 6 ≈ 132px + padding ≈ 152).
      const max = 152;
      ta.style.height = `${Math.min(ta.scrollHeight, max)}px`;
      ta.style.overflowY = ta.scrollHeight > max ? 'auto' : 'hidden';
    }, [value]);

    return (
      <textarea
        ref={localRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends; Shift+Enter inserts a newline (matches every
          // chat-input convention).
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        rows={1}
        className={`w-full min-h-10 px-4 py-2.5 bg-surface-elevated border rounded-2xl text-text-primary text-[15px] leading-snug resize-none outline-none placeholder:text-text-tertiary transition-colors ${
          isListening ? 'border-error' : 'border-border/60 focus:border-primary'
        }`}
      />
    );
  }
  return forwardRef<HTMLTextAreaElement, {
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    placeholder: string;
    isListening: boolean;
  }>(Inner);
})();

// Info + select sheet for the session-mode picker. Renders the full
// description and a concrete example for whichever mode the user
// tapped, with Choose / Cancel below. Same bottom-sheet motion +
// safe-area handling as PushPermissionSheet for visual consistency.
function SessionModeInfoSheet({
  modeId,
  currentlySelectedId,
  onChoose,
  onClose,
}: {
  modeId: SessionMode | null;
  currentlySelectedId: SessionMode;
  onChoose: (id: SessionMode) => void;
  onClose: () => void;
}) {
  const opt = modeId ? SESSION_MODE_OPTIONS.find((o) => o.id === modeId) : null;
  const isCurrent = !!opt && opt.id === currentlySelectedId;
  return (
    <AnimatePresence>
      {opt && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50"
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            initial={prefersReducedMotion ? undefined : { y: '100%' }}
            animate={prefersReducedMotion ? undefined : { y: 0 }}
            exit={prefersReducedMotion ? undefined : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-[70] bg-bg rounded-t-3xl shadow-warm-xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>
            <div
              className="px-6 pt-2 pb-6 max-w-md mx-auto space-y-5"
              style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            >
              <div>
                <h2 className="text-xl font-bold text-text-primary">{opt.label}</h2>
                <p className="text-sm text-text-secondary mt-1">{opt.hint}</p>
              </div>

              <p className="text-[15px] text-text-primary leading-relaxed whitespace-pre-line">
                {opt.description}
              </p>

              <div className="rounded-2xl bg-surface border border-border p-4 space-y-1">
                <p className="text-[11px] uppercase tracking-widest text-text-tertiary font-semibold mb-1">
                  Example
                </p>
                <p className="text-[14px] text-text-secondary leading-relaxed whitespace-pre-line">
                  {opt.example}
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 rounded-2xl border border-border text-text-primary text-sm font-medium hover:bg-surface-elevated"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => onChoose(opt.id)}
                  disabled={isCurrent}
                  className="flex-1 py-3 rounded-2xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isCurrent ? 'Currently selected' : 'Choose'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Past-conversations history. LEFT-side drawer (Claude pattern) that
// lists the user's completed guided sessions, newest first, with a
// human-readable title derived from the first user answer so they're
// distinguishable. Tapping a row navigates to /guided?resume=<id> —
// the existing resume effect (page.tsx:529-560) hydrates exchanges
// from the entry's metadata and the user can keep typing with full
// AI context preserved.
interface PastSession {
  id: string;
  journal_entry_id: string | null;
  created_at: string;
  exchanges: { question: string; answer: string }[];
}
function GuidedHistoryDrawer({
  open,
  onClose,
  onContinue,
}: {
  open: boolean;
  onClose: () => void;
  onContinue: (journalEntryId: string) => void;
}) {
  const [sessions, setSessions] = useState<PastSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reload list every time the drawer opens.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSessions(null);
    void (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setSessions([]);
          return;
        }
        // Query journal_entries directly — it's the source of truth for
        // ongoing AND past conversations now (the wrap-up flow that
        // wrote to guided_sessions is gone). Order by updated_at so
        // recently-touched conversations float to the top, even if the
        // user resumes a 3-week-old chat today.
        const { data, error: dbErr } = await supabase
          .from('journal_entries')
          .select('id, updated_at, metadata')
          .eq('user_id', user.id)
          .eq('entry_type', 'guided')
          .order('updated_at', { ascending: false })
          .limit(50);
        if (dbErr) throw dbErr;
        setSessions(
          (data ?? [])
            .map((r) => {
              const meta = (r.metadata ?? {}) as Record<string, unknown>;
              const exchanges = Array.isArray(meta.exchanges)
                ? (meta.exchanges as PastSession['exchanges'])
                : [];
              return {
                id: r.id as string,
                journal_entry_id: r.id as string,
                created_at: r.updated_at as string,
                exchanges,
              };
            })
            // Filter out empty drafts — stub rows from sessions the
            // user opened but never typed in. Surfacing them clutters
            // the drawer with "(unanswered start)" entries.
            .filter((s) => s.exchanges.length > 0),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load history');
        setSessions([]);
      }
    })();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50"
            onClick={onClose}
          />
          <motion.div
            key="drawer"
            initial={prefersReducedMotion ? undefined : { x: '-100%' }}
            animate={prefersReducedMotion ? undefined : { x: 0 }}
            exit={prefersReducedMotion ? undefined : { x: '-100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed inset-y-0 left-0 z-[70] w-[86%] max-w-[360px] bg-bg shadow-warm-xl flex flex-col"
          >
            <div
              className="flex items-center justify-between px-5 border-b border-border/60 flex-shrink-0"
              style={{
                paddingTop: 'max(1rem, env(safe-area-inset-top))',
                paddingBottom: '0.75rem',
              }}
            >
              <h2 className="text-base font-bold text-text-primary">Past conversations</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="w-9 h-9 flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary text-lg"
              >
                ✕
              </button>
            </div>

            <div
              className="flex-1 overflow-y-auto"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              {sessions === null ? (
                <div className="px-5 py-10 text-center text-sm text-text-tertiary">Loading…</div>
              ) : error ? (
                <div className="px-5 py-10 text-center text-sm text-error">{error}</div>
              ) : sessions.length === 0 ? (
                <div className="px-5 py-12 text-center space-y-2">
                  <p className="text-base text-text-primary font-medium">No past sessions yet.</p>
                  <p className="text-sm text-text-tertiary">
                    Once you finish a guided session, it&rsquo;ll show up here.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {sessions.map((s) => {
                    // Title from the user's FIRST answer — way more
                    // identifiable than Ben's greeting (which is
                    // generic across sessions). Falls back if the
                    // session has no answer yet.
                    const firstAnswer = s.exchanges[0]?.answer?.trim() ?? '';
                    const title = firstAnswer
                      ? firstAnswer.length > 60
                        ? `${firstAnswer.slice(0, 60).trim()}…`
                        : firstAnswer
                      : '(unanswered start)';
                    const exchangeCount = s.exchanges.length;
                    const disabled = !s.journal_entry_id;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => {
                            if (s.journal_entry_id) onContinue(s.journal_entry_id);
                          }}
                          disabled={disabled}
                          className="w-full text-left px-5 py-4 hover:bg-surface-elevated transition-colors disabled:opacity-40"
                        >
                          <p className="text-sm text-text-primary font-medium leading-snug line-clamp-2 mb-1.5">
                            {title}
                          </p>
                          <div className="flex items-center justify-between text-[11px] text-text-tertiary">
                            <span>{formatSessionDate(s.created_at)}</span>
                            <span>
                              {exchangeCount} {exchangeCount === 1 ? 'exchange' : 'exchanges'}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const isYesterday = d.toDateString() === yest.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today · ${time}`;
  if (isYesterday) return `Yesterday · ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function ThinkingDots({ color }: { color: string }) {
  if (prefersReducedMotion) {
    return <p className="text-[15px] text-text-secondary italic">...</p>;
  }
  return (
    <div className="flex items-center gap-1.5 h-5 pt-0.5" aria-label="thinking">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: color }}
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{
            duration: 0.9,
            repeat: Infinity,
            delay: i * 0.15,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

export default function GuidedSessionPage() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const guide = getGuideOrDefault(profile?.preferred_guide);
  const createEntry = useJournalStore((s) => s.createEntry);
  const updateEntry = useJournalStore((s) => s.updateEntry);
  const fetchEntryById = useJournalStore((s) => s.fetchEntryById);
  const { entries } = useJournalStore();

  // PR 2 — Guided sessions are an opt-in feature now. If the toggle
  // is off, redirect to /today (the single landing). The route still
  // exists so the in-app entry point button works the moment the
  // user flips guided_enabled in Settings.
  useEffect(() => {
    if (profile && profile.guided_enabled !== true) {
      router.replace('/today');
    }
  }, [profile, router]);
  if (profile && profile.guided_enabled !== true) {
    return null;
  }

  const getGuideGreeting = useCallback(() => {
    const tod = getTimeOfDay();
    const localizedGreetings = getLocalizedGreetings(guide.id, getLocale());
    const greetings = localizedGreetings[tod as keyof typeof localizedGreetings] || localizedGreetings.evening;
    return greetings[Math.floor(Math.random() * greetings.length)];
  }, [guide]);

  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  // Session mode picker — persisted to localStorage so a user who
  // prefers Naikan keeps that as their default. Defaults to 'open'
  // (current behavior) so nothing changes for users who don't pick.
  const [sessionMode, setSessionMode] = useState<SessionMode>(() => {
    if (typeof window === 'undefined') return 'open';
    const saved = window.localStorage.getItem('guided_session_mode');
    if (saved === 'naikan' || saved === 'nvc' || saved === 'aar' || saved === 'open') {
      return saved as SessionMode;
    }
    return 'open';
  });
  const setAndPersistMode = useCallback((m: SessionMode) => {
    setSessionMode(m);
    try {
      window.localStorage.setItem('guided_session_mode', m);
    } catch {}
  }, []);
  // null = sheet closed; otherwise the chip the user just tapped to
  // see info about. Tapping a chip opens the info sheet (description
  // + example + Choose / Cancel) instead of selecting immediately.
  const [sessionInfoMode, setSessionInfoMode] = useState<SessionMode | null>(null);
  // History sheet — past completed guided sessions, read-only.
  // Triggered by the clock icon in the header (only when there are
  // no in-progress exchanges; mid-session the End button takes
  // priority).
  const [historyOpen, setHistoryOpen] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentAnswer, setCurrentAnswer] = useState('');
  // Wrap-up flow (isComplete + mood scoring + if-then plan) was
  // dropped: conversations now flow continuously and never need to
  // be explicitly "ended." Tap "+" to start fresh; the previous
  // conversation lives in the history drawer.
  const [thinking, setThinking] = useState(false);
  const [geminiError, setGeminiError] = useState(false);
  // Rate-limit state. 'fallback' = pro hit, flash served (silent badge +
  // one-time guide line); 'exhausted' = both engines gone, full card.
  const [rateLimitState, setRateLimitState] = useState<'none' | 'fallback' | 'exhausted'>('none');
  const [detectedGoal, setDetectedGoal] = useState<string | null>(null);
  const [liteMode, setLiteMode] = useState(false);
  const [thinkingLong, setThinkingLong] = useState(false);
  const [debugCopied, setDebugCopied] = useState(false);
  // Trace events are stored in state (not a ref) so React re-renders the
  // debug panel as they accumulate. We still keep `traceStartRef` for the
  // baseline timestamp and a ref mirror for synchronous reads inside
  // submitAnswer (where setState wouldn't have flushed yet).
  type TraceEvent = { t: number; label: string; meta?: Record<string, unknown> };
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [speechSupported] = useState(() => typeof window !== 'undefined' && isSpeechRecognitionSupported());
  // Guided sessions require Gemini for Ben's reply, so the Send path
  // is gated when offline. The textarea + mic stay enabled so users
  // can still capture thoughts; on reconnect they tap Send and Ben
  // replies normally.
  const online = useOnline();

  const draftEntryIdRef = useRef<string | null>(null);
  const lastFailedAnswer = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Debug trace baseline. `traceStartRef` holds t0 in performance.now()
  // units; per-event deltas are computed against it. Events themselves
  // live in `traceEvents` state above so the panel re-renders.
  const traceStartRef = useRef<number>(0);
  // One-shot flag — we only want to inject the pro-cap notice into the
  // very next guide message, not every message after the cap is hit.
  const proCapNoticePendingRef = useRef(false);

  // Selection-aware, cursor-tracking mic. See useSelectionAwareMic for
  // the full behavior spec — short version: speech inserts at the
  // cursor or replaces the highlighted selection; tapping elsewhere
  // in the textarea mid-recording re-anchors future speech at the
  // new position; iOS selection-blur quirks handled via a pointer-
  // down snapshot on the mic button.
  const {
    isListening,
    toggle: toggleMic,
    stop: stopMic,
    micButtonProps,
  } = useSelectionAwareMic({
    textareaRef: inputRef,
    value: currentAnswer,
    onChange: setCurrentAnswer,
  });

  // ── Immersive-mode triggers ────────────────────────────────────
  // /guided used to be unconditionally hideNav. Now it starts with
  // the wall nav visible (user just tapped the Guided tab from the
  // journal wall) and promotes to full-screen only when the user
  // actually engages: focusing the input, typing, mic, or resuming a
  // thread with prior exchanges. The flag lives in uiStore so the
  // layout can react.
  const setGuidedImmersive = useUiStore((s) => s.setGuidedImmersive);
  const guidedImmersive = useUiStore((s) => s.guidedImmersive);

  // Tap-into-input triggers immersive too. Without this, a user who
  // taps the textarea (which is sitting above the wall nav) would
  // see the wall nav stay visible until their first keystroke —
  // jittery. Focus is the earliest reliable engagement signal.
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    const onFocus = () => setGuidedImmersive(true);
    ta.addEventListener('focus', onFocus);
    return () => ta.removeEventListener('focus', onFocus);
  }, [setGuidedImmersive]);

  // First non-empty keystroke also flips to immersive (covers the
  // dictation path where focus lives elsewhere). Stays immersive
  // even if the user backspaces back to empty — sticky per spec
  // (the X button is the explicit way out).
  useEffect(() => {
    if (currentAnswer.length > 0) {
      setGuidedImmersive(true);
    }
  }, [currentAnswer, setGuidedImmersive]);

  // Mic activation also flips to immersive.
  useEffect(() => {
    if (isListening) {
      setGuidedImmersive(true);
    }
  }, [isListening, setGuidedImmersive]);

  // Cleanup on unmount — leaving /guided (X tap, wall switch, deep
  // navigation) returns the app to non-immersive state for the next
  // visit.
  useEffect(() => {
    return () => {
      setGuidedImmersive(false);
    };
  }, [setGuidedImmersive]);

  // Set greeting on mount, OR hydrate from a draft if ?resume=<id> is in
  // the URL. The hydrate path restores exchanges, the last question Ben
  // asked, and stores the draft id in `draftEntryIdRef` so future
  // autoSave() calls keep mutating the SAME row instead of creating a
  // new draft. Falls back to a fresh greeting if the draft has no
  // exchanges yet (race: created but first save failed).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const resumeId = params.get('resume');
    if (!resumeId) {
      setCurrentQuestion(getGuideGreeting());
      return;
    }
    let cancelled = false;
    (async () => {
      const entry = await fetchEntryById(resumeId);
      if (cancelled) return;
      const meta = (entry?.metadata as Record<string, unknown> | null) ?? null;
      const resumedExchanges = meta?.exchanges as Exchange[] | undefined;
      const lastQuestion = meta?.current_question as string | undefined;
      if (entry && resumedExchanges && resumedExchanges.length > 0) {
        setExchanges(resumedExchanges);
        setCurrentQuestion(lastQuestion || getGuideGreeting());
        // Mood/mood_label setters dropped along with the wrap-up flow.
        draftEntryIdRef.current = entry.id;
        // Resumed threads go straight to immersive — a long thread
        // with the wall nav stealing 80px at the bottom looks wrong.
        setGuidedImmersive(true);
      } else if (entry) {
        // Draft exists but is empty — keep the row and start from greeting
        // so the next autoSave reuses it instead of creating a duplicate.
        draftEntryIdRef.current = entry.id;
        setCurrentQuestion(getGuideGreeting());
      } else {
        setCurrentQuestion(getGuideGreeting());
      }
    })();
    return () => { cancelled = true; };
  }, [getGuideGreeting, fetchEntryById]);

  const trace = useCallback((label: string, meta?: Record<string, unknown>) => {
    const t = performance.now() - traceStartRef.current;
    setTraceEvents((prev) => {
      const next = [...prev, { t, label, meta }];
      // Cap at 25 events so the panel always fits on a phone screenshot.
      return next.length > 25 ? next.slice(next.length - 25) : next;
    });
  }, []);

  const formatTraceForCopy = useCallback(() => {
    const header = [
      `guide=${guide.id}`,
      `locale=${getLocale()}`,
      `exchange#=${exchanges.length}`,
      `model=${process.env.NEXT_PUBLIC_GEMINI_GUIDED_MODEL || 'gemini-2.5-pro'}`,
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
  }, [guide.id, exchanges.length, traceEvents]);

  const copyDebug = async () => {
    try {
      await navigator.clipboard.writeText(formatTraceForCopy());
      setDebugCopied(true);
      setTimeout(() => setDebugCopied(false), 1500);
    } catch {
      // Fallback for clipboard-blocked contexts: select-all in a textarea.
      const ta = document.createElement('textarea');
      ta.value = formatTraceForCopy();
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setDebugCopied(true); setTimeout(() => setDebugCopied(false), 1500); } catch {}
      document.body.removeChild(ta);
    }
  };

  // Show "taking a moment" hint if thinking lingers past 10s — the Pro
  // model genuinely takes 15-22s for a full structured response.
  useEffect(() => {
    if (!thinking) {
      setThinkingLong(false);
      return;
    }
    const t = window.setTimeout(() => setThinkingLong(true), 10_000);
    return () => window.clearTimeout(t);
  }, [thinking]);

  // Mic mechanics (selection snapshot, post-commit cursor pin, mid-
  // recording re-anchor, selectionchange listener) now live inside
  // useSelectionAwareMic. This file only needs business logic.

  // Track the VISIBLE viewport rectangle explicitly via the
  // `visualViewport` API. We need BOTH `height` (shrinks with
  // keyboard) and `offsetTop` (non-zero if iOS pans the document to
  // bring a focused input into view). Using pixel values — not
  // `100dvh`/`100lvh` — because iOS Safari's interpretation of those
  // units varies across versions and sometimes leaves fixed elements
  // anchored to the layout viewport instead of the visual one.
  const [vv, setVv] = useState<{
    height: number;
    offsetTop: number;
    keyboardOpen: boolean;
  } | null>(null);
  // Track the MAX visible height we've observed — that's the
  // no-keyboard baseline. On iOS Safari 16.4+ with
  // `interactive-widget=resizes-content`, `window.innerHeight` ALSO
  // shrinks when the keyboard opens, so `innerHeight - vv.height` is
  // ~0 and can't be used to detect the keyboard. Comparing current
  // height against the max we've ever seen gives us a reliable signal.
  const maxHeightRef = useRef(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      const vvport = window.visualViewport;
      const h = vvport ? vvport.height : window.innerHeight;
      const offsetTop = vvport ? vvport.offsetTop : 0;
      if (h > maxHeightRef.current) maxHeightRef.current = h;
      const kbOpen = maxHeightRef.current - h > 100;
      setVv({ height: h, offsetTop, keyboardOpen: kbOpen });
    };
    update();
    const vvport = window.visualViewport;
    if (vvport) {
      vvport.addEventListener('resize', update);
      vvport.addEventListener('scroll', update);
      return () => {
        vvport.removeEventListener('resize', update);
        vvport.removeEventListener('scroll', update);
      };
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Measure dock height so the chat's scroll area can reserve exactly
  // that much padding-bottom — messages can then scroll past the dock
  // overlay rather than being permanently hidden behind it.
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState(320);
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const el = dockRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      // Use offsetHeight (border-box) — it includes padding and
      // borders. contentRect.height would undercount by padding, and
      // the dock has both pt-3 and padding-bottom for safe-area, so
      // the dock would be positioned too low and the Send button
      // would be clipped off the bottom of the visible viewport.
      const h = el.offsetHeight;
      if (h > 0) setDockHeight(h);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [geminiError, rateLimitState]);

  // Auto-scroll to bottom on NEW content only (new exchange, thinking
  // state change, new guide question). Intentionally NOT triggered by
  // viewport height changes — when the keyboard opens the chat area
  // shrinks, and we want whatever the user was looking at to stay put
  // rather than jumping to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [exchanges, thinking, currentQuestion]);

  // Auto-save to Supabase
  const autoSave = async (updatedExchanges: Exchange[], question: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const contentParts = updatedExchanges.map((e) => `Q: ${e.question}\nA: ${e.answer}`);
      const contentText = contentParts.join('\n\n');
      const allAnswers = updatedExchanges.map((e) => e.answer).join(' ');
      const wordCount = allAnswers.split(/\s+/).filter(Boolean).length;

      if (draftEntryIdRef.current) {
        await supabase.from('journal_entries').update({
          content_text: contentText,
          word_count: wordCount,
          metadata: { exchanges: updatedExchanges, current_question: question, guide_id: guide.id, is_draft: true },
          updated_at: new Date().toISOString(),
        }).eq('id', draftEntryIdRef.current);
      } else {
        const { data } = await supabase.from('journal_entries').insert({
          user_id: user.id,
          entry_type: 'guided',
          title: `Guided session — ${new Date().toLocaleDateString()}`,
          content_text: contentText,
          word_count: wordCount,
          metadata: { exchanges: updatedExchanges, current_question: question, guide_id: guide.id, is_draft: true },
        }).select().single();
        if (data) draftEntryIdRef.current = data.id;
      }
    } catch {}
  };

  // recentEntriesSummary is now computed internally inside guideEngine
  // (Tier 1 context: weekly reflection + last 3 guided sessions + stats).
  // This page no longer needs to assemble it.

  const submitAnswer = async (retryAnswer?: string) => {
    const fullAnswer = retryAnswer || currentAnswer.trim();
    if (!fullAnswer) return;
    setGeminiError(false);
    setRateLimitState('none');

    // Reset trace at the start of each submit so the debug panel reflects
    // *this* request's pipeline, not the previous one.
    traceStartRef.current = performance.now();
    setTraceEvents([]);
    trace('send tapped', { chars: fullAnswer.length });

    // Stop mic if active
    if (isListening) stopMic();

    const isRetry = !!retryAnswer;
    let updatedExchanges: Exchange[];

    if (isRetry) {
      updatedExchanges = exchanges;
    } else {
      const newExchange: Exchange = {
        question: currentQuestion,
        answer: fullAnswer,
        timestamp: new Date().toISOString(),
      };
      updatedExchanges = [...exchanges, newExchange];
      setExchanges(updatedExchanges);
      setCurrentAnswer('');
      setDetectedGoal(null);
    }

    // The auto-end-after-7-exchanges block was dropped along with the
    // wrap-up flow. Conversations now flow indefinitely; the user
    // taps "+" to start a fresh one when they want a new topic.

    setThinking(true);
    const conversationHistory: ConversationExchange[] = updatedExchanges.map((e) => ({
      question: e.question,
      answer: e.answer,
    }));

    try {
      const result = await getGuideResponse(fullAnswer, {
        guideId: guide.id,
        exchanges: conversationHistory,
        activeGoals: profile?.intentions || [],
        // mood removed along with the wrap-up flow — no longer captured.
        mode: sessionMode,
        onTrace: trace,
      });

      setThinking(false);
      lastFailedAnswer.current = null;

      // First time we see usedFallback flip true in a session, queue the
      // guide's pro-cap notice to be prepended to the very next question.
      // Keeps the conversation in-voice instead of bolting a system banner
      // on top of the chat.
      const justFellBack = !!result.usedFallback && !liteMode;
      if (justFellBack) {
        proCapNoticePendingRef.current = true;
      }
      setLiteMode(!!result.usedFallback);

      let nextQuestion = result.response.question;
      if (proCapNoticePendingRef.current) {
        const locale = getLocale();
        const notice = guide.rateLimitLines.proCapHit[locale === 'es' ? 'es' : 'en'];
        nextQuestion = `${notice}\n\n${nextQuestion}`;
        proCapNoticePendingRef.current = false;
      }
      setCurrentQuestion(nextQuestion);

      if (result.response.type === 'goal_suggestion' && result.response.detected_goal) {
        setDetectedGoal(result.response.detected_goal);
      }

      autoSave(updatedExchanges, nextQuestion);
    } catch (err) {
      setThinking(false);
      lastFailedAnswer.current = fullAnswer;
      if (err instanceof RateLimitError) {
        trace('rate limited (caught)', { scope: err.scope });
        setRateLimitState(err.scope === 'all' ? 'exhausted' : 'fallback');
      } else {
        trace('error (caught)', { msg: err instanceof Error ? err.message : String(err) });
        setGeminiError(true);
      }
      autoSave(updatedExchanges, currentQuestion);
    }
  };

  // handleSave + handleEndSession dropped along with the wrap-up flow.
  // Conversations are continuously autosaved via autoSave() — no
  // explicit "end" needed. Tap "+" to start a fresh conversation.

  // Is the keyboard open? Detected by comparing visual to layout
  // viewport — a gap bigger than ~60px almost certainly means the
  // soft keyboard is up.
  const keyboardOpen = vv?.keyboardOpen ?? false;
  // Keyboard DOWN: small lift (12px) so the dock isn't glued to the
  // bottom safe-area edge. Keyboard UP: 0 — dock sits flush against
  // the keyboard's top edge so the input + the line being typed are
  // both fully visible. The previous design pushed the dock DOWN by
  // 56px to "tuck Send behind the suggestion bar" — that hid the
  // text being typed, which is what the user reported.
  // Keyboard DOWN: small lift (12px) so the dock isn't glued to the
  // safe-area edge.
  // Keyboard UP: NEGATIVE offset — pushes the dock DOWN past
  // vv.bottom so the input row sits inside the iOS suggestion-bar
  // strip where chat would otherwise leak. Combined with the bottom
  // skirt (rendered above the dock JSX), this lands the input row
  // visibly inside that strip and covers everything below it with
  // bg-bg. Per user's "move the textbox lower" feedback.
  const dockBottomOffset = keyboardOpen ? -40 : 12;

  // Use vv-based positioning ONLY while the keyboard is open. When
  // the keyboard is closed, fall back to plain fixed-bottom anchoring
  // (with 100dvh height for the chat). Reason: iOS Safari shrinks
  // visualViewport.height as its URL bar appears mid-scroll, so a
  // vv-bound layout re-positions on every scroll-driven URL-bar
  // toggle — visible as a small layout "jitter" in the chat surface.
  // Stable anchoring kills the jitter while keyboard handling stays
  // intact (since we still go vv-bound the moment the keyboard rises).
  const chatStyle: React.CSSProperties = vv && keyboardOpen
    ? {
        position: 'fixed',
        top: `${vv.offsetTop}px`,
        left: 0,
        right: 0,
        height: `${vv.height}px`,
        zIndex: 1,
      }
    : {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '100dvh',
        zIndex: 1,
      };
  const dockTop = vv
    ? vv.offsetTop + vv.height - dockHeight - dockBottomOffset
    : 0;
  // When the page is non-immersive (wall nav visible), the dock has
  // to sit ABOVE the nav or it gets covered and the user can't reach
  // the textarea. ~80px clears the visible nav across viewports;
  // safe-area-inset-bottom takes care of iOS home-indicator slop.
  // Keyboard up always means we've gone immersive (focus → immersive
  // happens before the keyboard finishes rising), so this branch is
  // only relevant for the keyboard-down state.
  const dockBottom = !guidedImmersive
    ? 'calc(80px + env(safe-area-inset-bottom))'
    : '0px';
  const dockStyle: React.CSSProperties = vv && keyboardOpen
    ? {
        position: 'fixed',
        top: `${dockTop}px`,
        left: 0,
        right: 0,
        zIndex: 10,
      }
    : {
        position: 'fixed',
        bottom: dockBottom,
        left: 0,
        right: 0,
        zIndex: 10,
        // Smooth the transition so when focus flips immersive on,
        // the dock glides from "above nav" to "flush bottom" instead
        // of snapping. Matches the wall nav's own slide-out timing.
        transition: 'bottom 220ms cubic-bezier(0.22, 1, 0.36, 1)',
      };

  return (
    // TWO TRULY INDEPENDENT FIXED LAYERS.
    //
    //   1. Chat layer. Pinned EXPLICITLY to the visible viewport via
    //      `top: visualViewport.offsetTop` and `height:
    //      visualViewport.height`. This means even if iOS Safari pans
    //      the document (which it sometimes does regardless of
    //      `interactive-widget=resizes-content`), the chat follows the
    //      pan and its header never drifts off-screen. The chat's
    //      scroll area has real `padding-bottom: dockHeight` so
    //      messages can scroll past the dock overlay — nothing is
    //      permanently hidden.
    //
    //   2. Dock layer. Positioned INDEPENDENTLY via `top: offsetTop +
    //      height - dockHeight`. It floats above the keyboard and is
    //      not in a flex relationship with the chat, so it can NEVER
    //      be squeezed or clipped, no matter how small the visible
    //      viewport shrinks. The keyboard-focus textarea lives in
    //      here, and since this layer is not a descendant of the
    //      chat's scroll container, iOS's "scroll-focused-input-
    //      into-view" heuristic cannot scroll the chat when the
    //      textarea takes focus.
    //
    // Dock height is measured live with ResizeObserver so the chat's
    // scroll-area padding always matches — no hard-coded magic number.
    <>
    <div
      className="flex flex-col bg-bg"
      style={chatStyle}
    >
      {/* Header — doesn't shrink */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 pt-4 pb-3 border-b border-border">
        {/* LEFT: hamburger (3 horizontal lines) — opens past-
            conversations drawer. Claude-style convention. */}
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          aria-label="Past conversations"
          className="w-9 h-9 flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* CENTER: Mascot + session title (unchanged). */}
        <div className="flex items-center gap-2">
          <Mascot guide={guide.id as GuideId} pose="listen" size="sm" animate />
          <span className="text-sm font-semibold text-text-primary">{t('guided.sessionWith', { name: guide.name })}</span>
          {liteMode && (
            <motion.span
              initial={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
              animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              className="ml-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-warning/15 text-warning"
              title="Pro daily limit reached — using lite model. Resets at midnight Pacific."
            >
              {t('guided.liteMode')}
            </motion.span>
          )}
        </div>

        {/* RIGHT: + (new conversation) + ✕ (close). Both are icons.
            No End button — conversations autosave continuously and
            never need to be explicitly "ended." Tapping + starts a
            fresh conversation; the previous one stays in history.
            Tapping ✕ returns to /home (no confirm: nothing to lose). */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              // Hard navigation forces a fresh page mount: draftEntryIdRef
              // resets to null, exchanges to [], currentQuestion to greeting.
              // The previous draft stays in journal_entries via autoSave
              // and shows up in the history drawer.
              window.location.assign('/guided');
            }}
            aria-label="New conversation"
            className="w-9 h-9 flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => router.push('/home')}
            aria-label="Close"
            className="w-9 h-9 flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors text-lg"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Session-mode picker — only before the first exchange so it
          can't be changed mid-conversation. Tapping a chip opens an
          info sheet (description + concrete example), with Choose /
          Cancel inside the sheet — selection is two taps so users
          don't pick a mode they don't understand. The currently-
          active mode is highlighted in the chip strip. */}
      {exchanges.length === 0 && (
        <div className="flex-shrink-0 px-5 pt-3 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2 overflow-x-auto" role="radiogroup" aria-label="Session mode">
            {SESSION_MODE_OPTIONS.map((opt) => {
              const selected = opt.id === sessionMode;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSessionInfoMode(opt.id)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
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
        </div>
      )}

      {/* Sheets used to mount here — moved to root sibling of the
          dock layer below so their high z-index actually wins over
          the dock. (Inside the chatLayer they were trapped in its
          z-1 stacking context.) */}

      {/* Conversation — independent scroll container. The dock
          overlays its bottom as a separate fixed layer, so we reserve
          exactly `dockHeight` of padding-bottom (measured live) so
          the last message can always be scrolled into view above the
          dock. `overscroll-behavior: contain` stops any scroll chain
          from propagating to / from the dock layer. */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 space-y-4"
        style={{
          // Reserve dock-height + breathing AND, when non-immersive,
          // also the wall-nav strip below the dock. Otherwise the last
          // message would scroll behind the wall nav (since the
          // messages container is full-viewport height while the dock
          // is now floating above the nav).
          paddingBottom: `calc(${dockHeight + 16}px + ${!guidedImmersive ? '80px + env(safe-area-inset-bottom)' : '0px'})`,
          // 'contain' blocks scroll-chaining (so pulling the chat past
          // its top doesn't scroll the parent) without disabling
          // normal in-bounds scrolling. The earlier 'none' setting
          // accidentally killed scrolling on iOS when combined with
          // the fixed-position layout — revert.
          overscrollBehavior: 'contain',
        }}
      >
        {exchanges.map((exchange, i) => (
          <div key={i} className="space-y-2">
            {/* Guide bubble — slides in from left */}
            <motion.div
              initial={prefersReducedMotion ? undefined : { opacity: 0, x: -20 }}
              animate={prefersReducedMotion ? undefined : { opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              className="max-w-[85%] bg-[#1A2B22] rounded-2xl p-4 shadow-warm-sm"
            >
              <div className="flex items-center gap-2 mb-1">
                <Mascot guide={guide.id as GuideId} pose="listen" size="xs" animate />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: guide.accentColor }}>{guide.name}</span>
              </div>
              <RichGuideText text={exchange.question} className="text-[#F0F0F5]" />
            </motion.div>
            {/* User bubble — slides in from right */}
            <motion.div
              initial={prefersReducedMotion ? undefined : { opacity: 0, x: 20 }}
              animate={prefersReducedMotion ? undefined : { opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.05 }}
              className="max-w-[85%] ml-auto bg-[#222725] rounded-2xl p-4 shadow-warm-sm"
            >
              <p className="text-[15px] text-text-primary leading-relaxed">{exchange.answer}</p>
            </motion.div>
          </div>
        ))}

        {/* Current state */}
        <AnimatePresence mode="wait">
        {thinking ? (
          <motion.div
            key="thinking"
            initial={prefersReducedMotion ? undefined : { opacity: 0, x: -16 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, x: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="max-w-[85%] bg-[#1A2B22] rounded-2xl p-4 shadow-warm-sm"
          >
            <div className="flex items-center gap-2 mb-1">
              <Mascot guide={guide.id as GuideId} pose="listen" size="xs" animate />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: guide.accentColor }}>{guide.name}</span>
            </div>
            <ThinkingDots color={guide.accentColor} />
            {thinkingLong && (
              <motion.div
                initial={prefersReducedMotion ? undefined : { opacity: 0 }}
                animate={prefersReducedMotion ? undefined : { opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="mt-2 space-y-1.5"
              >
                <p className="text-xs text-text-tertiary italic">
                  {t('guided.takingAMoment')}
                </p>
                <div className="border-t border-border/40 pt-1.5">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-text-tertiary">
                    <span>⏱ {t('guided.debugHeader')}</span>
                    <button
                      onClick={copyDebug}
                      className="text-primary font-semibold normal-case tracking-normal"
                    >
                      {debugCopied ? t('guided.debugCopied') : t('guided.debugCopy')}
                    </button>
                  </div>
                  <div className="mt-1 font-mono text-[11px] leading-snug text-text-secondary max-h-[180px] overflow-y-auto">
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
              </motion.div>
            )}
          </motion.div>
        ) : rateLimitState === 'exhausted' ? (
          <motion.div
            key="rate-limited"
            initial={prefersReducedMotion ? undefined : { opacity: 0, y: 8 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            className="space-y-3"
          >
            <div className="max-w-[85%] bg-[#1A2B22] rounded-2xl p-4 shadow-warm-sm">
              <div className="flex items-center gap-2 mb-1">
                <Mascot guide={guide.id as GuideId} pose="listen" size="xs" animate />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: guide.accentColor }}>{guide.name}</span>
              </div>
              <RichGuideText
                text={guide.rateLimitLines.exhausted[getLocale() === 'es' ? 'es' : 'en']}
                className="text-[#F0F0F5]"
              />
            </div>
            <div className="bg-[#2A2410] border border-[#5A4A1A] rounded-2xl p-4 space-y-3">
              <p className="text-sm font-semibold text-warning">{t('guided.rateLimitTitle')}</p>
              <p className="text-xs text-text-tertiary">{t('guided.rateLimitResetNote')}</p>
              <button
                onClick={() => router.push('/home')}
                className="w-full py-2.5 bg-primary text-white rounded-xl text-sm font-semibold"
              >
                {t('guided.rateLimitGoHome')}
              </button>
            </div>
          </motion.div>
        ) : geminiError ? (
          <motion.div
            key="error"
            initial={prefersReducedMotion ? undefined : { opacity: 0, y: 8 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            className="bg-[#2A1A1A] border border-[#4A2A2A] rounded-2xl p-4 text-center space-y-3"
          >
            <p className="text-sm text-[#FF9999]">{t('guided.connectionError')}</p>
            <button
              onClick={() => lastFailedAnswer.current && submitAnswer(lastFailedAnswer.current)}
              className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-semibold"
            >
              {t('common.retry')}
            </button>
          </motion.div>
        ) : (
          /* Active "ready for your reply" Ben bubble. The wrap-up
             render branch (mood scoring + if-then plan + Save button)
             was dropped along with the End ceremony — conversations
             flow continuously now. */
          currentQuestion && (
            <motion.div
              key={`q-${exchanges.length}`}
              initial={prefersReducedMotion ? undefined : { opacity: 0, x: -20 }}
              animate={prefersReducedMotion ? undefined : { opacity: 1, x: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              className="space-y-2"
            >
              <div className="max-w-[85%] bg-[#1A2B22] rounded-2xl p-4 shadow-warm-sm">
                <div className="flex items-center gap-2 mb-1">
                  <Mascot guide={guide.id as GuideId} pose="listen" size="xs" animate />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: guide.accentColor }}>{guide.name}</span>
                </div>
                <RichGuideText text={currentQuestion} className="text-[#F0F0F5]" />
              </div>
              {detectedGoal && (
                <div className="bg-[#2A2D1E] border border-[#4A5C3A] rounded-2xl p-4 space-y-3">
                  <p className="text-sm text-text-primary font-medium">🎯 {t('guided.holdIntention', { goal: detectedGoal! })}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        const current = profile?.intentions || [];
                        if (!current.some((i) => i.toLowerCase() === detectedGoal!.toLowerCase())) {
                          await updateProfile({ intentions: [...current, detectedGoal!] });
                        }
                        setDetectedGoal(null);
                      }}
                      className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold"
                    >
                      {t('common.yes')}
                    </button>
                    <button
                      onClick={() => setDetectedGoal(null)}
                      className="px-4 py-2 bg-border text-text-secondary rounded-lg text-sm"
                    >
                      {t('guided.notNow')}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )
        )}
        </AnimatePresence>
      </div>
    </div>

    {/* Bottom skirt — a separate solid bg-bg bar that fills any
        strip between the dock's bottom edge and the on-screen
        keyboard. iOS visualViewport sometimes reports a vv.bottom
        that's above the actual keyboard top (it can stop at the top
        of the suggestion bar), leaving chat content visible in the
        gap behind/below the dock. The skirt sits at z-index 9 (just
        below the dock z-10) anchored from `top: vv.bottom` to
        `bottom: 0` — purely cosmetic, totally independent of the
        dock's measurement loop. Only renders when keyboard is open. */}
    {vv && keyboardOpen && (
      <div
        aria-hidden
        className="bg-bg fixed left-0 right-0 pointer-events-none"
        style={{
          top: `${vv.offsetTop + vv.height - 1}px`,
          bottom: 0,
          zIndex: 9,
        }}
      />
    )}

    {/* Input dock — independent fixed-position layer. Its `top` is
        computed from visualViewport so it always floats just above
        the keyboard, regardless of what iOS does to the layout
        viewport. Not a child of the chat layer, so scrolling the
        chat has zero effect on this dock's position, and tapping
        the textarea doesn't cause iOS to scroll the chat. */}
    {!geminiError && rateLimitState !== 'exhausted' && (
        <div
          ref={dockRef}
          className="bg-bg px-3 pt-3"
          style={{
            ...dockStyle,
            // Keyboard up: stay close to the keyboard so the input +
            // typed line are both visible. Keyboard down: match the
            // capture page's bottom breathing room (≥40px floor +
            // safe-area) so the dock doesn't read as glued to the
            // bottom edge of the screen.
            paddingBottom: keyboardOpen
              ? '0.5rem'
              : 'max(2.5rem, calc(env(safe-area-inset-bottom) + 1rem))',
          }}
        >
          {/* Single-row chat input — input on the left auto-grows up
              to ~6 lines as content is added; mic + send icon-only
              buttons sit on the right and center vertically with the
              textarea (items-center) so single-line state — the
              dominant case — looks perfectly aligned. Mic is flat
              icon-only (no circle bg) so the input has maximum room;
              Send is a small primary circle so the action stays
              visually distinct. */}
          <div className="w-full flex items-center gap-1.5">
            <div className="flex-1 min-w-0">
              <AutoGrowTextarea
                ref={inputRef}
                value={currentAnswer}
                onChange={setCurrentAnswer}
                onSubmit={() => {
                  if (currentAnswer.trim() && !isListening && !thinking) submitAnswer();
                }}
                placeholder={
                  isListening ? t('guided.listeningPlaceholder') : t('guided.typePlaceholder')
                }
                isListening={isListening}
              />
            </div>
            {speechSupported && (
              <button
                {...micButtonProps}
                disabled={thinking}
                className={`w-10 h-10 flex items-center justify-center transition-colors flex-shrink-0 disabled:opacity-50 ${
                  isListening
                    ? 'text-error'
                    : 'text-text-secondary hover:text-primary'
                }`}
                aria-label={isListening ? t('template.stopRecording') : t('template.tapToSpeak')}
              >
                {isListening ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                )}
              </button>
            )}
            <button
              onClick={() => submitAnswer()}
              disabled={!currentAnswer.trim() || isListening || thinking || !online}
              title={!online ? "Offline — Ben can't reply right now" : undefined}
              className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center transition-colors hover:bg-primary-dark disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
              aria-label={t('common.send')}
            >
              {/* Paper-airplane glyph — universal "send" affordance. */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Sheets — mounted at the root so their z-[60]/z-[70] compete
          with the dock (z-10) in the SAME stacking context. Mounting
          them inside the chatLayer (which is position:fixed + z-1)
          would trap them inside z-1's context, where no amount of
          inner z-index could rise above the dock. */}
      <SessionModeInfoSheet
        modeId={sessionInfoMode}
        currentlySelectedId={sessionMode}
        onChoose={(id) => {
          setAndPersistMode(id);
          setSessionInfoMode(null);
        }}
        onClose={() => setSessionInfoMode(null)}
      />

      <GuidedHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onContinue={(journalEntryId) => {
          // Mid-session: confirm before swapping the conversation. The
          // current draft auto-saves elsewhere, so the user won't
          // lose data — but they should know they're switching.
          if (
            exchanges.length > 0 &&
            !confirm(
              'Switch to a past conversation? Your current chat will be saved as a draft.',
            )
          ) {
            return;
          }
          setHistoryOpen(false);
          // Hard navigation (not router.push) so the page fully
          // remounts and the existing ?resume useEffect (page.tsx:529)
          // re-runs with the new URL. router.push would update the
          // URL but the effect's stable deps mean it wouldn't re-fire,
          // and the in-memory exchanges wouldn't reset. Hydration on
          // fresh mount: reads metadata.exchanges from the entry,
          // restores currentQuestion, primes draftEntryIdRef. Then
          // submitAnswer feeds the full exchanges to getGuideResponse
          // so Ben sees the prior context automatically.
          window.location.assign(`/guided?resume=${journalEntryId}`);
        }}
      />
    </>
  );
}
