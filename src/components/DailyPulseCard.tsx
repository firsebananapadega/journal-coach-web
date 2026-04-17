'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useJournalStore, type JournalEntry } from '@/stores/journalStore';
import { toLocalDateStr, entryDateStr } from '@/lib/dateUtils';
import { t } from '@/lib/translations';
import {
  isSpeechRecognitionSupported,
  startListening,
  stopListening,
} from '@/lib/speechRecognition';
import { getLanguage } from '@/lib/language';

interface Props {
  entries: JournalEntry[];
}

const QUESTIONS = [
  { key: 'alive' as const, translationKey: 'pulse.alive' },
  { key: 'drained' as const, translationKey: 'pulse.drained' },
];

export default function DailyPulseCard({ entries }: Props) {
  const { createEntry, fetchEntries } = useJournalStore();
  const [step, setStep] = useState(0);
  const [alive, setAlive] = useState('');
  const [drained, setDrained] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported] = useState(
    () => typeof window !== 'undefined' && isSpeechRecognitionSupported()
  );

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const accumulatedRef = useRef('');
  // Use refs for values accessed inside speech callbacks (avoids stale closures)
  const stepRef = useRef(step);
  const aliveRef = useRef(alive);
  const drainedRef = useRef(drained);

  // Keep refs in sync with state
  useEffect(() => { stepRef.current = step; }, [step]);
  useEffect(() => { aliveRef.current = alive; }, [alive]);
  useEffect(() => { drainedRef.current = drained; }, [drained]);

  const today = toLocalDateStr(new Date());
  const todayPulse = entries.find(
    (e) => e.entry_type === 'pulse' && entryDateStr(e.created_at) === today
  );

  const currentValue = step === 0 ? alive : drained;
  const setCurrentValue = step === 0 ? setAlive : setDrained;

  // Auto-scroll textarea as speech adds text
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [alive, drained, step]);

  // Focus textarea when step changes
  useEffect(() => {
    if (!todayPulse && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [step, todayPulse]);

  const stopMic = useCallback(() => {
    stopListening();
    setIsListening(false);
  }, []);

  const toggleMic = useCallback(async () => {
    if (isListening) {
      const s = stepRef.current;
      accumulatedRef.current = s === 0 ? aliveRef.current : drainedRef.current;
      stopMic();
    } else {
      const s = stepRef.current;
      accumulatedRef.current = s === 0 ? aliveRef.current : drainedRef.current;
      setIsListening(true);
      startListening({
        continuous: true,
        language: getLanguage(),
        onResult: (text) => {
          const prefix = accumulatedRef.current;
          const combined = prefix ? prefix + ' ' + text : text;
          // Use ref to always get the current step
          if (stepRef.current === 0) setAlive(combined);
          else setDrained(combined);
        },
        onEnd: () => {
          const s = stepRef.current;
          accumulatedRef.current = s === 0 ? aliveRef.current : drainedRef.current;
          setIsListening(false);
        },
        onError: () => {
          const s = stepRef.current;
          accumulatedRef.current = s === 0 ? aliveRef.current : drainedRef.current;
          setIsListening(false);
        },
      });
    }
  }, [isListening, stopMic]);

  const goNext = () => {
    stopMic();
    accumulatedRef.current = '';
    setStep(1);
  };

  const goBack = () => {
    stopMic();
    accumulatedRef.current = '';
    setStep(0);
  };

  const handleSubmit = async () => {
    stopMic();
    const a = aliveRef.current.trim();
    const d = drainedRef.current.trim();
    if (!a && !d) return;
    setSaveError('');
    setSubmitting(true);
    try {
      const contentText = `Alive: ${a}\n\nDrained: ${d}`;
      const wordCount = contentText.split(/\s+/).filter(Boolean).length;
      await createEntry({
        entry_type: 'pulse',
        content_text: contentText,
        title: 'Daily Pulse',
        metadata: { alive: a, drained: d },
        word_count: wordCount,
      });
      // Force refresh entries from Supabase to ensure todayPulse is found
      await fetchEntries();
      setAlive('');
      setDrained('');
      setStep(0);
    } catch (err) {
      console.error('Failed to save pulse:', err);
      setSaveError(err instanceof Error ? err.message : 'Failed to save. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Completed state ─────────────────────────────────────────────
  if (todayPulse) {
    const meta = todayPulse.metadata as { alive?: string; drained?: string } | null;
    return (
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left bg-surface rounded-2xl border border-border p-4 transition-colors hover:border-primary/30"
        data-testid="pulse-completed"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">✨</span>
            <span className="font-semibold text-text-primary text-sm">{t('pulse.saved')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-success">✓</span>
            <span className="text-xs text-text-tertiary">
              {expanded ? '▲' : '▼'}
            </span>
          </div>
        </div>

        {expanded && meta && (
          <div className="mt-3 space-y-2 pt-3 border-t border-border">
            {meta.alive && (
              <div>
                <span className="text-xs font-medium text-primary">{t('pulse.aliveLabel')}</span>
                <p className="text-sm text-text-primary mt-0.5">{meta.alive}</p>
              </div>
            )}
            {meta.drained && (
              <div>
                <span className="text-xs font-medium text-accent">{t('pulse.drainedLabel')}</span>
                <p className="text-sm text-text-primary mt-0.5">{meta.drained}</p>
              </div>
            )}
          </div>
        )}
      </button>
    );
  }

  // ── Input state — one question at a time ────────────────────────
  return (
    <div className="space-y-5" data-testid="pulse-card">
      {/* Progress dots */}
      <div className="flex gap-1.5">
        {QUESTIONS.map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-1 rounded-full transition-colors ${
              i <= step ? 'bg-primary' : 'bg-border'
            }`}
          />
        ))}
      </div>

      {/* Question */}
      <p className="text-lg text-text-primary font-medium leading-snug">
        {t(QUESTIONS[step].translationKey)}
      </p>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={currentValue}
        onChange={(e) => setCurrentValue(e.target.value)}
        placeholder={step === 0 ? t('pulse.alivePlaceholder') : t('pulse.drainedPlaceholder')}
        className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary text-sm resize-none outline-none min-h-[160px] focus:border-primary placeholder:text-text-tertiary"
        data-testid={step === 0 ? 'pulse-alive' : 'pulse-drained'}
      />

      {/* Mic button */}
      {speechSupported && (
        <button
          onClick={toggleMic}
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

      {/* Error message */}
      {saveError && (
        <p className="text-error text-sm text-center">{saveError}</p>
      )}

      {/* Navigation buttons */}
      <div className="flex gap-3">
        {step > 0 && (
          <button
            onClick={goBack}
            className="flex-1 py-3 bg-surface border border-border text-text-secondary rounded-xl text-sm font-medium"
          >
            {t('common.back')}
          </button>
        )}
        {step === 0 ? (
          <button
            onClick={goNext}
            disabled={!currentValue.trim()}
            className="flex-1 py-3 bg-primary text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition-opacity"
            data-testid="pulse-next"
          >
            {t('common.next')}
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={(!aliveRef.current.trim() && !drainedRef.current.trim()) || submitting}
            className="flex-1 py-3 bg-primary text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition-opacity"
            data-testid="pulse-submit"
          >
            {submitting ? t('common.saving') : t('pulse.save')}
          </button>
        )}
      </div>
    </div>
  );
}
