'use client';

// Presence pause — mid-day capture surface rendered on /home (Pulse
// tab) when the user hasn't yet recorded a presence today.
//
// Two quick prompts in a single light screen:
//   1. Where's your attention right now?  (free text, ~80 chars)
//   2. One word for this moment            (single word, ~24 chars)
//
// Writes one journal_entries row with entry_type='pulse' +
// metadata.pulseMode='presence'. /home gates rendering of this
// component on whether today's presence exists; once submitted, the
// row appears as a compact done card inside DailyPulseCard's
// chronologically-sorted list (alongside morning + evening).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useJournalStore } from '@/stores/journalStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { useUiStore } from '@/stores/uiStore';
import { useSelectionAwareMic } from '@/hooks/useSelectionAwareMic';
import {
  isSpeechRecognitionSupported,
  startListening,
  stopListening,
  correctTranscript,
} from '@/lib/speechRecognition';
import { getLanguage } from '@/lib/language';
import { t } from '@/lib/translations';

// Max height for the attention contenteditable. Past this, internal
// scrolling kicks in so the latest dictated text stays visible.
const PRESENCE_ATTENTION_MAX_PX = 152;
const PRESENCE_ATTENTION_MAX_CHARS = 500;

interface PresenceCaptureProps {
  /** Called after a successful save. /home uses this to collapse the
   *  compose form back to the "+ Add another pause" button so the user
   *  can record additional mid-day pauses throughout the day without
   *  the form being permanently mounted. */
  onSaved?: () => void;
}

export default function PresenceCapture({ onSaved }: PresenceCaptureProps = {}) {
  const hasFetched = useJournalStore((s) => s.hasFetched);
  const fetchEntries = useJournalStore((s) => s.fetchEntries);
  const createEntry = useJournalStore((s) => s.createEntry);
  const pulseNotebookId = useNotebookStore((s) => s.pulseId());
  const fetchNotebooks = useNotebookStore((s) => s.fetchNotebooks);
  const hasFetchedNotebooks = useNotebookStore((s) => s.hasFetched);
  const showToast = useUiStore((s) => s.showToast);

  const [attention, setAttention] = useState('');
  const [oneWord, setOneWord] = useState('');
  const [saving, setSaving] = useState(false);

  // Speech-recognition support detection runs once on mount — keeps
  // the mic button hidden on browsers that don't support Web Speech
  // (e.g. desktop Firefox) instead of rendering a dead button.
  const [speechSupported] = useState(
    () => typeof window !== 'undefined' && isSpeechRecognitionSupported(),
  );

  // ── Attention field (contenteditable) ─────────────────────────
  // Why contenteditable instead of <textarea>: the user wanted text
  // to wrap around the mic button on the line where the mic sits,
  // with lines above using full width. <textarea> is a replaced
  // element — its content can't have floated children, so you can't
  // wrap text around anything inside it. A <div contentEditable> can
  // hold a floated child (the mic button), and natural CSS float:right
  // makes the text flow around it on the first line, with lines below
  // using full width. CSS float positions the mic at TOP-RIGHT of its
  // container — bottom-right wrap is fragile in pure CSS and would
  // require JS-driven dynamic float sizing.
  const attentionEditableRef = useRef<HTMLDivElement | null>(null);
  const [attentionListening, setAttentionListening] = useState(false);
  const attentionStopRef = useRef<(() => void) | null>(null);
  // The contenteditable is intentionally UNCONTROLLED — React renders
  // it once and the DOM owns its content from then on (writing
  // textContent imperatively would wipe the floated mic-button child).
  // To programmatically clear after save, we bump this key, which
  // remounts the editable in its empty initial state.
  const [editableInstanceKey, setEditableInstanceKey] = useState(0);

  const handleAttentionInput = useCallback(() => {
    const el = attentionEditableRef.current;
    if (!el) return;
    const text = (el.textContent ?? '').slice(0, PRESENCE_ATTENTION_MAX_CHARS);
    setAttention(text);
    // Auto-scroll: when content exceeds max-height, keep the latest
    // dictated text visible.
    if (el.scrollHeight > el.clientHeight) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const handleAttentionBeforeInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const ev = e.nativeEvent as InputEvent;
    if (!ev.inputType?.startsWith('insert')) return;
    const el = attentionEditableRef.current;
    if (!el) return;
    if ((el.textContent ?? '').length >= PRESENCE_ATTENTION_MAX_CHARS) {
      e.preventDefault();
    }
  }, []);

  const handleAttentionPaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const el = attentionEditableRef.current;
    if (!el) return;
    const remaining = PRESENCE_ATTENTION_MAX_CHARS - (el.textContent ?? '').length;
    if (remaining <= 0) return;
    document.execCommand('insertText', false, text.slice(0, remaining));
  }, []);

  // Mic dictation for the contenteditable. Bypasses useSelectionAwareMic
  // (which is textarea-specific) and inserts via execCommand so the
  // browser handles cursor + selection naturally. Final transcripts
  // append at the cursor with leading space when needed.
  const lastFinalRef = useRef('');
  const startAttentionDictation = useCallback(() => {
    if (attentionListening) return;
    const el = attentionEditableRef.current;
    if (!el) return;
    el.focus();
    lastFinalRef.current = '';
    const stop = startListening({
      language: getLanguage(),
      continuous: true,
      onStart: () => setAttentionListening(true),
      onResult: (transcript, isFinal) => {
        if (!isFinal) return;
        // The lib emits the cumulative final transcript; insert only
        // the delta since the last fire.
        const delta = transcript.slice(lastFinalRef.current.length);
        lastFinalRef.current = transcript;
        const piece = correctTranscript(delta).trim();
        if (!piece) return;
        const target = attentionEditableRef.current;
        if (!target) return;
        target.focus();
        const existing = target.textContent ?? '';
        const remaining = PRESENCE_ATTENTION_MAX_CHARS - existing.length;
        if (remaining <= 0) return;
        const prefix = existing && !/\s$/.test(existing) ? ' ' : '';
        const insertable = (prefix + piece).slice(0, remaining);
        // execCommand inserts at the current selection / caret.
        document.execCommand('insertText', false, insertable);
      },
      onEnd: () => {
        setAttentionListening(false);
        attentionStopRef.current = null;
      },
      onError: () => {
        setAttentionListening(false);
        attentionStopRef.current = null;
      },
    });
    attentionStopRef.current = stop;
  }, [attentionListening]);

  const stopAttentionDictation = useCallback(() => {
    if (attentionStopRef.current) {
      attentionStopRef.current();
      attentionStopRef.current = null;
    } else {
      stopListening();
    }
    setAttentionListening(false);
  }, []);

  const toggleAttentionMic = useCallback(() => {
    if (attentionListening) stopAttentionDictation();
    else startAttentionDictation();
  }, [attentionListening, startAttentionDictation, stopAttentionDictation]);

  // Cleanup on unmount — never leave SR running.
  useEffect(() => {
    return () => {
      attentionStopRef.current?.();
      attentionStopRef.current = null;
    };
  }, []);

  // ── One-word field (regular input, unchanged) ──────────────────
  const oneWordInputRef = useRef<HTMLInputElement | null>(null);
  // The hook expects an HTMLTextAreaElement ref. The one-word field is
  // an <input>, but the hook uses .value / selection / dispatch — all
  // shared between input and textarea — so we cast the ref.
  const oneWordRefForMic = oneWordInputRef as unknown as React.RefObject<HTMLTextAreaElement>;
  const oneWordMic = useSelectionAwareMic({
    textareaRef: oneWordRefForMic,
    value: oneWord,
    onChange: (next) => setOneWord(next.slice(0, 24).replace(/\s+/g, '')),
  });

  // Hydrate journal entries on first mount so the parent (/home) can
  // detect whether today's presence is already done and decide whether
  // to render this component.
  useEffect(() => {
    if (!hasFetched) void fetchEntries();
  }, [hasFetched, fetchEntries]);
  useEffect(() => {
    if (!hasFetchedNotebooks) void fetchNotebooks();
  }, [hasFetchedNotebooks, fetchNotebooks]);

  const canSave = !!(attention.trim() || oneWord.trim());

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const trimmedAttention = attention.trim();
      const trimmedWord = oneWord.trim().split(/\s+/)[0]?.slice(0, 24) ?? '';
      const contentText = [trimmedAttention, trimmedWord].filter(Boolean).join(' • ');
      await createEntry({
        entry_type: 'pulse',
        title: 'Presence Pause',
        content_text: contentText || null,
        notebook_id: pulseNotebookId,
        word_count: contentText ? contentText.split(/\s+/).filter(Boolean).length : 0,
        metadata: {
          pulseMode: 'presence',
          attention: trimmedAttention || null,
          // body_score / body_label intentionally omitted — body
          // emoji-scale removed from the capture flow. Past entries
          // with these fields render correctly via DailyPulseCard's
          // presence branch in renderCompletedPulse.
          one_word: trimmedWord || null,
        },
      });
      // After save: clear the form. /home will detect the new entry
      // (via journalStore.entries) and unmount this component, while
      // DailyPulseCard renders the new presence row as a compact done
      // card in chronological order with morning + evening.
      setAttention('');
      setOneWord('');
      // Bump the contenteditable's key to force-remount it back to
      // its empty initial state — the contenteditable is uncontrolled
      // (React doesn't manage its children after first paint), so this
      // is the only safe way to clear it without wiping the floated
      // mic-button child.
      setEditableInstanceKey((k) => k + 1);
      showToast(t('presence.done'), 'success');
      // Tell the parent we're done — /home uses this to collapse the
      // compose form back to the "+ Add another pause" button so the
      // user can record additional pauses without the form being
      // mounted indefinitely.
      onSaved?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Skeleton ─────────────────────────────────────────────
  if (!hasFetched) {
    return (
      <div
        className="bg-surface rounded-2xl border border-border p-4 h-[160px] animate-pulse opacity-60"
        aria-hidden
      />
    );
  }

  // ── Compose view ─────────────────────────────────────────
  // Done state intentionally removed — the parent (/home) gates
  // whether to render this component based on today's presence
  // entries. Once the user submits, DailyPulseCard takes over the
  // done-card rendering so all three pulses (morning / mid-day /
  // evening) sit in a single chronological list.
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-surface p-4 space-y-4">
        {/* 1. Attention — typography matches the morning/evening pulse
             prompt (text-lg / font-medium / leading-snug) and the
             input mirrors the pulse textarea (text-[17px] / leading-
             relaxed) so the surface feels like a third pulse. */}
        <div className="space-y-2">
          <label className="text-lg text-text-primary font-medium leading-snug block">
            {t('presence.intro')}
          </label>
          {/* contenteditable wrapper. The mic button is a real DOM
              child with `float: right` so the first line of typed
              text wraps around it; lines below the mic flow at full
              width. Placeholder is rendered as an absolute span
              shown only when the editable is empty (contenteditable
              has no native placeholder). */}
          <div
            className="relative w-full bg-bg border border-border rounded-xl focus-within:border-primary"
          >
            {/* Empty-state placeholder. pointer-events-none so it
                doesn't intercept the click that should focus the
                editable behind it. */}
            {!attention && (
              <span
                className="pointer-events-none absolute left-4 top-3.5 text-[17px] leading-relaxed text-text-tertiary"
                aria-hidden
              >
                {t('presence.attentionPlaceholder')}
              </span>
            )}
            <div
              key={editableInstanceKey}
              ref={attentionEditableRef}
              role="textbox"
              aria-multiline="true"
              aria-label={t('presence.intro')}
              contentEditable
              suppressContentEditableWarning
              onInput={handleAttentionInput}
              onBeforeInput={handleAttentionBeforeInput}
              onPaste={handleAttentionPaste}
              spellCheck
              className="w-full px-4 py-3.5 text-[17px] leading-relaxed text-text-primary outline-none overflow-y-auto whitespace-pre-wrap break-words"
              style={{
                minHeight: '52px',
                maxHeight: `${PRESENCE_ATTENTION_MAX_PX}px`,
              }}
            >
              {/* Floated mic — `contentEditable={false}` so the user
                  can't put the caret inside it; `float: right` makes
                  text wrap around it on the first line. The button's
                  margin-bottom + margin-left create the airy negative
                  space around it inside the textbox. */}
              {speechSupported && (
                <span
                  contentEditable={false}
                  className="float-right ml-2 mb-1 inline-block"
                >
                  <button
                    type="button"
                    onClick={toggleAttentionMic}
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label={attentionListening ? t('template.stopRecording') : t('template.tapToSpeak')}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-warm-sm ${
                      attentionListening
                        ? 'bg-error text-white scale-105'
                        : 'bg-surface border border-border text-text-secondary hover:text-primary hover:border-primary/50'
                    }`}
                  >
                    {attentionListening ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" x2="12" y1="19" y2="22" />
                      </svg>
                    )}
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 2. One word — body emoji-scale removed per user feedback;
             past entries that captured a body_score still display it
             via PauseCard (BODY_SCALE retained for that lookup). */}
        <div className="space-y-2">
          <label className="text-lg text-text-primary font-medium leading-snug block">
            {t('presence.oneWordPrompt')}
          </label>
          <div className="relative">
            <input
              ref={oneWordInputRef}
              type="text"
              value={oneWord}
              onChange={(e) => setOneWord(e.target.value.slice(0, 24).replace(/\s+/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSave) {
                  e.preventDefault();
                  void handleSave();
                }
              }}
              placeholder={t('presence.oneWordPlaceholder')}
              className="w-full pl-4 pr-14 py-3.5 bg-bg border border-border rounded-xl text-[17px] leading-relaxed text-text-primary outline-none focus:border-primary placeholder:text-text-tertiary"
            />
            {speechSupported && (
              <button
                {...oneWordMic.micButtonProps}
                aria-label={oneWordMic.isListening ? t('template.stopRecording') : t('template.tapToSpeak')}
                className={`absolute top-1/2 right-2.5 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-warm-sm ${
                  oneWordMic.isListening
                    ? 'bg-error text-white scale-105'
                    : 'bg-surface border border-border text-text-secondary hover:text-primary hover:border-primary/50'
                }`}
              >
                {oneWordMic.isListening ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full py-3.5 rounded-2xl bg-primary text-white text-base font-semibold disabled:opacity-40"
        >
          {saving ? t('common.saving') : t('presence.save')}
        </button>
      </div>
    </div>
  );
}
