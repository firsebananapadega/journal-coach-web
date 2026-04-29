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

import { useEffect, useRef, useState } from 'react';
import { useJournalStore } from '@/stores/journalStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { useUiStore } from '@/stores/uiStore';
import { useSelectionAwareMic } from '@/hooks/useSelectionAwareMic';
import { isSpeechRecognitionSupported } from '@/lib/speechRecognition';
import { t } from '@/lib/translations';

// Auto-grow + auto-scroll cap. Same vocabulary as the guided dock
// textarea — caps at ~6 lines (152px including padding) so the
// presence card never balloons; once the cap is hit, the textarea
// scrolls internally so the latest dictated text stays visible.
const PRESENCE_TEXTAREA_MAX_PX = 152;
const PRESENCE_ATTENTION_MAX_CHARS = 500;

export default function PresenceCapture() {
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

  // Per-field mic. Each field gets its own selection-aware mic instance
  // so dictation lands in the field the user actually started recording
  // on, and toggling one mic doesn't shut off the other (the hook owns
  // its own startListening / stop calls).
  const attentionMicRef = useRef<HTMLTextAreaElement | null>(null);
  const oneWordInputRef = useRef<HTMLInputElement | null>(null);
  // The hook expects an HTMLTextAreaElement ref. The one-word field is
  // an <input>, but the hook uses .value / selection / dispatch — all
  // shared between input and textarea — so we cast the ref. iOS-quirk
  // selection bookkeeping inside the hook works the same way for both.
  const oneWordRefForMic = oneWordInputRef as unknown as React.RefObject<HTMLTextAreaElement>;
  const attentionMic = useSelectionAwareMic({
    textareaRef: attentionMicRef,
    value: attention,
    onChange: (next) => setAttention(next.slice(0, PRESENCE_ATTENTION_MAX_CHARS)),
    autoRestart: true,
  });
  const oneWordMic = useSelectionAwareMic({
    textareaRef: oneWordRefForMic,
    value: oneWord,
    onChange: (next) => setOneWord(next.slice(0, 24).replace(/\s+/g, '')),
  });

  // Auto-grow + auto-scroll for the attention textarea. Resize on
  // every value change: set height='auto' first so the textarea can
  // shrink back if the user deletes text, then cap at MAX_PX. Past
  // the cap we keep scrollTop pinned to scrollHeight so a user who's
  // dictating sees their latest words instead of older lines.
  useEffect(() => {
    const ta = attentionMicRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const next = Math.min(ta.scrollHeight, PRESENCE_TEXTAREA_MAX_PX);
    ta.style.height = `${next}px`;
    if (ta.scrollHeight > PRESENCE_TEXTAREA_MAX_PX) {
      ta.style.overflowY = 'auto';
      ta.scrollTop = ta.scrollHeight;
    } else {
      ta.style.overflowY = 'hidden';
    }
  }, [attention]);

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
      showToast(t('presence.done'), 'success');
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
          {/* Wrapper is the positioning context for the inline mic
              button. Right padding on the textarea reserves visual
              space so dictated text never slides under the mic. */}
          <div className="relative">
            <textarea
              ref={attentionMicRef}
              value={attention}
              onChange={(e) => setAttention(e.target.value.slice(0, PRESENCE_ATTENTION_MAX_CHARS))}
              placeholder={t('presence.attentionPlaceholder')}
              rows={1}
              className="w-full pl-4 pr-14 py-3.5 bg-bg border border-border rounded-xl text-[17px] leading-relaxed text-text-primary outline-none focus:border-primary placeholder:text-text-tertiary resize-none"
            />
            {speechSupported && (
              <button
                {...attentionMic.micButtonProps}
                aria-label={attentionMic.isListening ? t('template.stopRecording') : t('template.tapToSpeak')}
                className={`absolute top-1/2 right-2.5 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-warm-sm ${
                  attentionMic.isListening
                    ? 'bg-error text-white scale-105'
                    : 'bg-surface border border-border text-text-secondary hover:text-primary hover:border-primary/50'
                }`}
              >
                {attentionMic.isListening ? (
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
