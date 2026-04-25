'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
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
import { useSelectionAwareMic } from '@/hooks/useSelectionAwareMic';
import { useJournalStore } from '@/stores/journalStore';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { MoodSelector } from '@/components/MoodSelector';
import { getLanguage } from '@/lib/language';
import { t } from '@/lib/translations';

interface Exchange {
  question: string;
  answer: string;
  timestamp: string;
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
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [moodScore, setMoodScore] = useState<number | null>(null);
  const [moodLabel, setMoodLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [geminiError, setGeminiError] = useState(false);
  // Rate-limit state. 'fallback' = pro hit, flash served (silent badge +
  // one-time guide line); 'exhausted' = both engines gone, full card.
  const [rateLimitState, setRateLimitState] = useState<'none' | 'fallback' | 'exhausted'>('none');
  const [detectedGoal, setDetectedGoal] = useState<string | null>(null);
  const [sessionWasDeep, setSessionWasDeep] = useState(false);
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
        setMoodScore(entry.mood_score);
        setMoodLabel(entry.mood_label);
        draftEntryIdRef.current = entry.id;
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
  }, [isComplete, geminiError, rateLimitState]);

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

    if (updatedExchanges.length >= 7) {
      const allText = updatedExchanges.map((e) => e.answer).join(' ').toLowerCase();
      const deepIndicators = ['grief', 'loss', 'death', 'trauma', 'abuse', 'divorce', 'breakup', 'fired', 'failed', 'worthless', 'hopeless', 'scared', 'terrified', 'panic', 'crying', 'depressed', 'suicid', 'self-harm'];
      setSessionWasDeep(deepIndicators.some((w) => allText.includes(w)));
      setIsComplete(true);
      autoSave(updatedExchanges, currentQuestion);
      return;
    }

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
        mood: moodLabel || undefined,
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

  const handleSave = async () => {
    if (exchanges.length === 0) return;
    setSaving(true);
    setSaveError(false);

    const contentParts = exchanges.map((e) => `Q: ${e.question}\nA: ${e.answer}`);
    const contentText = contentParts.join('\n\n');
    const allAnswers = exchanges.map((e) => e.answer).join(' ');
    const wordCount = allAnswers.split(/\s+/).filter(Boolean).length;

    // Wrap the entire save in a timeout so it never hangs forever
    const saveWithTimeout = async () => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Save timed out')), 12000)
      );

      const save = async () => {
        if (draftEntryIdRef.current) {
          await updateEntry(draftEntryIdRef.current, {
            content_text: contentText,
            mood_score: moodScore,
            mood_label: moodLabel,
            word_count: wordCount,
            metadata: { exchanges, guide_id: guide.id, is_draft: false },
          });

          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from('guided_sessions').insert({
              user_id: user.id,
              journal_entry_id: draftEntryIdRef.current,
              session_type: 'daily_reflection',
              guide_id: guide.id,
              exchanges,
              completed: true,
            });
          }
        } else {
          const entry = await createEntry({
            entry_type: 'guided',
            title: `Guided session — ${new Date().toLocaleDateString()}`,
            content_text: contentText,
            mood_score: moodScore,
            mood_label: moodLabel,
            word_count: wordCount,
            metadata: { exchanges, guide_id: guide.id, is_draft: false },
          });

          if (entry) {
            await supabase.from('guided_sessions').insert({
              user_id: entry.user_id,
              journal_entry_id: entry.id,
              session_type: 'daily_reflection',
              guide_id: guide.id,
              exchanges,
              completed: true,
            });
          }
        }
      };

      await Promise.race([save(), timeout]);
    };

    try {
      await saveWithTimeout();
      setSaving(false);
      router.push('/home');
    } catch (err) {
      console.warn('Save failed:', err);
      setSaving(false);
      setSaveError(true);
      // Don't navigate — let user retry or go home manually
    }
  };

  const handleEndSession = () => {
    const allText = exchanges.map((e) => e.answer).join(' ').toLowerCase();
    const deepIndicators = ['grief', 'loss', 'death', 'trauma', 'abuse', 'divorce', 'breakup', 'fired', 'failed', 'worthless', 'hopeless'];
    setSessionWasDeep(deepIndicators.some((w) => allText.includes(w)));
    setIsComplete(true);
  };

  // Is the keyboard open? Detected by comparing visual to layout
  // viewport — a gap bigger than ~60px almost certainly means the
  // soft keyboard is up. We use this to pick the right dock offset:
  // a small lift above the screen bottom when the keyboard is DOWN
  // (so the dock isn't visually glued to the edge), and flush
  // against the keyboard when it's UP (so we don't waste any of the
  // shrunken visible area).
  const keyboardOpen = vv?.keyboardOpen ?? false;
  // When the keyboard is DOWN: lift the dock 20px above the bottom
  // edge so it floats rather than sitting flush.
  // When the keyboard is UP: push the dock DOWN by ~one button
  // height + gap (≈56px) so the Send button tucks behind the
  // keyboard's suggestion bar and "Tap to Speak" moves into where
  // Send used to sit. This reclaims vertical room for the chat above
  // so the guide's question stays fully visible. The keyboard's
  // Enter key still submits, so losing the visible Send button here
  // doesn't block sending.
  const dockBottomOffset = keyboardOpen ? -56 : 20;

  const chatStyle: React.CSSProperties = vv
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
  const dockStyle: React.CSSProperties = vv
    ? {
        position: 'fixed',
        top: `${dockTop}px`,
        left: 0,
        right: 0,
        zIndex: 10,
      }
    : {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10,
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
      <div className="flex-shrink-0 flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
        <button
          onClick={() => {
            if (exchanges.length > 0 && !confirm(t('guided.leaveConfirm'))) return;
            router.push('/home');
          }}
          className="text-text-secondary hover:text-text-primary text-lg"
        >
          ✕
        </button>
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
        {exchanges.length > 0 && !isComplete ? (
          <button onClick={handleEndSession} className="text-sm text-primary font-semibold">{t('guided.end')}</button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* Session-mode picker — only before the first exchange so it
          can't be changed mid-conversation (which would whipsaw the
          guide's question shape). Defaults to "Open" (current
          behavior); switching to Naikan / NVC / AAR overlays a
          structural directive on the guide's system prompt. */}
      {exchanges.length === 0 && !isComplete && (
        <div className="flex-shrink-0 px-5 pt-3 pb-2 border-b border-border/60">
          <div className="flex items-center gap-2 overflow-x-auto" role="radiogroup" aria-label="Session mode">
            {SESSION_MODE_OPTIONS.map((opt) => {
              const selected = opt.id === sessionMode;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setAndPersistMode(opt.id)}
                  title={opt.hint}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
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
          <p className="mt-1.5 text-[11px] text-text-tertiary">
            {SESSION_MODE_OPTIONS.find((o) => o.id === sessionMode)?.hint}
          </p>
        </div>
      )}

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
          paddingBottom: isComplete
            ? 'max(2rem, calc(env(safe-area-inset-bottom) + 1.5rem))'
            : `${dockHeight + 16}px`,
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
        ) : !isComplete ? (
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
        ) : (
          <motion.div
            key="complete"
            initial={prefersReducedMotion ? undefined : { opacity: 0, y: 12 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 26 }}
            className="space-y-4"
          >
            <div className="max-w-[85%] bg-[#1A2B22] rounded-2xl p-4 shadow-warm-sm">
              <div className="flex items-center gap-2 mb-1">
                <Mascot guide={guide.id as GuideId} pose="listen" size="xs" animate />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: guide.accentColor }}>{guide.name}</span>
              </div>
              <RichGuideText
                text={
                  sessionWasDeep
                    ? t('guided.deepSession')
                    : t('guided.normalSession', { count: String(exchanges.length), plural: exchanges.length !== 1 ? 's' : '' })
                }
                className="text-[#F0F0F5]"
              />
            </div>

            {sessionWasDeep && (
              <div className="bg-[#1A2320] rounded-2xl p-4 space-y-2">
                <p className="text-sm font-semibold text-text-primary">{t('guided.takeABreath')}</p>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {t('guided.breathDescription')}
                </p>
              </div>
            )}

            <MoodSelector value={moodScore} onChange={(score, label) => { setMoodScore(score); setMoodLabel(label); }} />

            {saveError && (
              <div className="bg-[#2A1A1A] border border-[#4A2A2A] rounded-2xl p-4 space-y-3">
                <p className="text-sm text-[#FF9999]">
                  {getLocale() === 'es'
                    ? 'No se pudo guardar. Tu sesión está guardada como borrador — no se pierde nada.'
                    : "Couldn't save. Your session is saved as a draft — nothing is lost."}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold"
                  >
                    {getLocale() === 'es' ? 'Reintentar' : 'Retry'}
                  </button>
                  <button
                    onClick={() => router.push('/home')}
                    className="flex-1 py-2.5 bg-border text-text-secondary rounded-xl text-sm"
                  >
                    {getLocale() === 'es' ? 'Ir al inicio' : 'Go Home'}
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {saving ? t('common.saving') : t('guided.saveSession')}
            </button>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </div>

    {/* Input dock — independent fixed-position layer. Its `top` is
        computed from visualViewport so it always floats just above
        the keyboard, regardless of what iOS does to the layout
        viewport. Not a child of the chat layer, so scrolling the
        chat has zero effect on this dock's position, and tapping
        the textarea doesn't cause iOS to scroll the chat. */}
    {!isComplete && !geminiError && rateLimitState !== 'exhausted' && (
        <div
          ref={dockRef}
          className="bg-bg px-4 pt-3 border-t border-border/40"
          style={{
            ...dockStyle,
            paddingBottom: 'max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem))',
          }}
        >
          <div className="flex flex-col gap-2">
            <textarea
              ref={inputRef}
              value={currentAnswer}
              onChange={(e) => setCurrentAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (currentAnswer.trim() && !isListening && !thinking) submitAnswer();
                }
              }}
              // No focus-time auto-scroll: the chat is now an
              // INDEPENDENT scroll container that doesn't reflow with
              // the keyboard. Yanking the user back to the bottom on
              // every focus would defeat the "separate scrollable
              // thing in the back" pattern the user asked for.
              placeholder={
                isListening ? t('guided.listeningPlaceholder') : t('guided.typePlaceholder')
              }
              rows={3}
              className={`w-full px-4 py-2.5 bg-surface border-2 rounded-2xl text-text-primary text-[15px] leading-snug resize-none outline-none placeholder:text-text-tertiary min-h-[96px] max-h-[180px] overflow-y-auto transition-colors ${
                isListening ? 'border-error' : 'border-border focus:border-primary'
              }`}
            />
            {speechSupported && (
              <button
                {...micButtonProps}
                className={`w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                  isListening
                    ? 'bg-error text-white'
                    : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
                }`}
                aria-label={
                  isListening ? t('template.stopRecording') : t('template.tapToSpeak')
                }
              >
                {isListening ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                )}
                {isListening ? t('template.stopRecording') : t('template.tapToSpeak')}
              </button>
            )}
            <button
              onClick={() => submitAnswer()}
              disabled={!currentAnswer.trim() || isListening || thinking}
              className="w-full py-3 rounded-2xl bg-primary text-white text-sm font-semibold transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label={t('common.send')}
            >
              {t('common.send')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
