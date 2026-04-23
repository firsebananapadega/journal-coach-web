'use client';

// Selection-aware, cursor-tracking mic. Extracted from the guided-
// session page so every tap-to-speak surface gets the same behavior:
//
//   1. Tap mic → speech inserts at the textarea cursor, replacing
//      any highlighted selection.
//   2. Mid-recording, tap somewhere else in the textarea → future
//      speech inserts at the NEW cursor position; what was already
//      transcribed stays put.
//   3. Tap mic to stop → no duplication, no stale final-transcript
//      double-write.
//   4. iOS: textarea blurs the instant the mic button is pressed, so
//      the hook snapshots the selection on pointerdown (which fires
//      BEFORE focus shifts away). A secondary `lastSelRef` cache
//      covers the case where even pointerdown didn't land in time.
//
// The hook owns ONLY the mic mechanics. Consumers still own:
//   - the textarea element + its value/onChange state
//   - any auto-save, rate-limit, or classification side-effects
//   - what label/icon to render on the button
//
// Usage:
//   const { isListening, toggle, micButtonProps } =
//     useSelectionAwareMic({ textareaRef, value, onChange });
//   ...
//   <button {...micButtonProps}>Tap to speak</button>

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  startListening,
  requestMicPermission,
} from '@/lib/speechRecognition';
import { getLanguage } from '@/lib/language';
import { playCaptureStart, playCaptureStop } from '@/lib/audioCues';
import { useScreenWakeLock } from '@/hooks/useScreenWakeLock';

interface UseSelectionAwareMicOptions {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  // Auto-chain a second recognition instance if the browser ends the
  // first one naturally (iOS times out after ~60s of silence). Only
  // enable on surfaces where long-form capture is the primary flow
  // (e.g. /voice). For short one-sentence fields (priorities, pulse),
  // leave false so the user can just tap the mic again.
  autoRestart?: boolean;
  // Language override — defaults to getLanguage(). Exposed so an
  // individual surface can force a different locale without changing
  // the app-wide setting.
  language?: string;
}

export function useSelectionAwareMic({
  textareaRef,
  value,
  onChange,
  autoRestart = false,
  language,
}: UseSelectionAwareMicOptions) {
  const [isListening, setIsListening] = useState(false);

  // Keep the screen awake while the mic is open so auto-lock doesn't
  // silently kill a long dictation. Graceful no-op on browsers that
  // don't support the Wake Lock API.
  useScreenWakeLock(isListening);

  // ─── Refs (see file-header comment for the invariants) ─────────
  const stopRef = useRef<(() => void) | null>(null);
  const selBeforeRef = useRef('');
  const selAfterRef = useRef('');
  const selCapturedRef = useRef(false);
  const transcriptBaselineRef = useRef('');
  const lastTranscriptRef = useRef('');
  const lastObservedValueRef = useRef(value);
  const lastSelRef = useRef<{ start: number; end: number; value: string } | null>(null);
  const isListeningRef = useRef(false);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const pendingCursorRef = useRef<number | null>(null);
  const programmaticSelectionUntilRef = useRef(0);
  const manualStopRef = useRef(false);
  const autoRestartUsedRef = useRef(false);

  // Keep ref mirrors in sync so the speech-recognition callbacks (which
  // capture values at mic-start time) can read the LATEST state.
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // Post-commit bookkeeping for each value update:
  //   - Pin the cursor at the insertion point so "tap at end to append"
  //     works (the I-beam genuinely moved, so selectionchange fires).
  //   - Suppress the selectionchange event our own setSelectionRange
  //     synthesizes — we don't want anchorMidRecording to fire for it.
  //   - Refresh lastObservedValueRef so document-level selectionchange
  //     can distinguish value-updates from true cursor moves.
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.scrollTop = ta.scrollHeight;
      const pos = pendingCursorRef.current;
      if (pos != null) {
        pendingCursorRef.current = null;
        programmaticSelectionUntilRef.current = Date.now() + 120;
        try {
          ta.setSelectionRange(pos, pos);
        } catch {
          // Older Safari can throw on unfocused elements; harmless.
        }
      }
    }
    lastObservedValueRef.current = value;
  }, [value, textareaRef]);

  // Capture the user's writing position. Used at mic START. Tries the
  // focused textarea first; falls back to the selectionchange-populated
  // lastSelRef (iOS blurs on mic-button tap and clears selectionStart);
  // last-resort defaults to end-of-text so speech at least appends.
  const captureSelection = useCallback(() => {
    const ta = textareaRef.current;
    if (
      ta &&
      typeof document !== 'undefined' &&
      document.activeElement === ta &&
      typeof ta.selectionStart === 'number'
    ) {
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      selBeforeRef.current = ta.value.slice(0, start);
      selAfterRef.current = ta.value.slice(end);
      selCapturedRef.current = true;
      return;
    }
    if (lastSelRef.current && ta && lastSelRef.current.value === ta.value) {
      const { start, end, value: v } = lastSelRef.current;
      const safeStart = Math.min(start, v.length);
      const safeEnd = Math.min(end, v.length);
      selBeforeRef.current = v.slice(0, safeStart);
      selAfterRef.current = v.slice(safeEnd);
      selCapturedRef.current = true;
      return;
    }
    selBeforeRef.current = valueRef.current ?? '';
    selAfterRef.current = '';
    selCapturedRef.current = true;
  }, [textareaRef]);

  // Re-anchor mid-recording: the user moved the cursor, so future
  // speech should insert at the new position. Freeze the current
  // transcript as the new baseline so subsequent delta computations
  // don't replay past speech at the new anchor.
  const anchorMidRecording = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    let start: number;
    let end: number;
    let v: string;
    if (
      typeof document !== 'undefined' &&
      document.activeElement === ta &&
      typeof ta.selectionStart === 'number'
    ) {
      start = ta.selectionStart ?? ta.value.length;
      end = ta.selectionEnd ?? ta.value.length;
      v = ta.value;
    } else if (lastSelRef.current && lastSelRef.current.value === ta.value) {
      ({ start, end, value: v } = lastSelRef.current);
    } else {
      return;
    }
    selBeforeRef.current = v.slice(0, Math.min(start, v.length));
    selAfterRef.current = v.slice(Math.min(end, v.length));
    transcriptBaselineRef.current = lastTranscriptRef.current;
  }, [textareaRef]);

  // Document-level selectionchange listener — the only reliable way
  // on iOS to notice "user tapped elsewhere in the textarea while
  // recording". We distinguish real cursor moves (value unchanged)
  // from speech-driven value updates (value changed) so only the
  // former re-anchor.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handler = () => {
      const ta = textareaRef.current;
      if (!ta) return;
      if (document.activeElement !== ta) return;
      if (Date.now() < programmaticSelectionUntilRef.current) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      if (start == null || end == null) return;
      const valueChanged = ta.value !== lastObservedValueRef.current;
      lastObservedValueRef.current = ta.value;
      lastSelRef.current = { start, end, value: ta.value };
      if (valueChanged) return;
      if (isListeningRef.current) anchorMidRecording();
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [textareaRef, anchorMidRecording]);

  // Core start-recognition routine. Factored out because autoRestart
  // needs to call it a second time from inside onEnd.
  const beginRecognition = useCallback((): (() => void) | null => {
    return startListening({
      continuous: true,
      language: language ?? getLanguage(),
      onResult: (transcript) => {
        const baseline = transcriptBaselineRef.current;
        const delta =
          transcript.length >= baseline.length && transcript.startsWith(baseline)
            ? transcript.slice(baseline.length)
            : transcript;
        const before = selBeforeRef.current;
        const after = selAfterRef.current;
        const needsSpaceBefore = before.length > 0 && !/\s$/.test(before);
        const needsSpaceAfter = after.length > 0 && !/^\s/.test(after);
        const piece = delta.trim();
        const leadingSpace = needsSpaceBefore && piece.length > 0 ? 1 : 0;
        const trailingSpace = needsSpaceAfter && piece.length > 0 ? 1 : 0;
        const combined =
          before +
          (leadingSpace ? ' ' : '') +
          piece +
          (trailingSpace ? ' ' : '');
        const newValue = combined + after;
        pendingCursorRef.current = before.length + leadingSpace + piece.length;
        lastTranscriptRef.current = transcript;
        onChangeRef.current(newValue);
      },
      onEnd: () => {
        stopRef.current = null;
        if (autoRestart && !manualStopRef.current && !autoRestartUsedRef.current) {
          // iOS tends to auto-end recognition after ~60s of silence
          // or on certain audio-route changes. Re-anchor at the end
          // of the current value and chain one more instance so the
          // user's long-form capture isn't broken by the auto-end.
          // No stop cue on auto-restart — we only signal truly-final
          // stops so the user can tell the difference between "mic
          // cycled" and "mic done."
          autoRestartUsedRef.current = true;
          const v = valueRef.current;
          selBeforeRef.current = v;
          selAfterRef.current = '';
          transcriptBaselineRef.current = '';
          lastTranscriptRef.current = '';
          const retry = beginRecognition();
          if (retry) {
            stopRef.current = retry;
          } else {
            setIsListening(false);
            playCaptureStop();
          }
          return;
        }
        setIsListening(false);
        playCaptureStop();
      },
      onError: () => {
        stopRef.current = null;
        setIsListening(false);
        playCaptureStop();
      },
    });
  }, [autoRestart, language]);

  const toggle = useCallback(async () => {
    if (isListening) {
      manualStopRef.current = true;
      stopRef.current?.();
      stopRef.current = null;
      setIsListening(false);
      playCaptureStop();
      return;
    }

    manualStopRef.current = false;
    autoRestartUsedRef.current = false;

    if (!selCapturedRef.current) {
      captureSelection();
    }
    selCapturedRef.current = false;

    transcriptBaselineRef.current = '';
    lastTranscriptRef.current = '';

    const ok = await requestMicPermission();
    if (!ok) {
      console.warn('[mic] permission denied or unavailable');
      return;
    }

    const cleanup = beginRecognition();
    if (cleanup) {
      setIsListening(true);
      playCaptureStart();
      stopRef.current = cleanup;
    } else {
      console.warn('[mic] startListening returned null — recognition unavailable');
    }
  }, [beginRecognition, captureSelection, isListening]);

  const stop = useCallback(() => {
    manualStopRef.current = true;
    stopRef.current?.();
    stopRef.current = null;
    setIsListening(false);
    playCaptureStop();
  }, []);

  // Spread onto the mic button. onPointerDown fires BEFORE focus
  // leaves the textarea — critical on iOS where the browser clears
  // selectionStart the moment another element takes focus.
  const onPointerDown = useCallback(() => {
    if (!isListeningRef.current) {
      captureSelection();
    }
  }, [captureSelection]);

  return {
    isListening,
    toggle,
    stop,
    micButtonProps: { onPointerDown, onClick: toggle },
  };
}
