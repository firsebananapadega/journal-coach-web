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

type PulseMode = 'morning' | 'evening';

function getCurrentMode(): PulseMode {
  return new Date().getHours() >= 18 ? 'evening' : 'morning';
}

// Morning: 1 question. Evening: 2 questions.
const MORNING_QUESTIONS = [
  { translationKey: 'pulse.morning.q1' },
];
const EVENING_QUESTIONS = [
  { translationKey: 'pulse.evening.q1' },
  { translationKey: 'pulse.evening.q2' },
];

export default function DailyPulseCard({ entries }: Props) {
  const { createEntry, fetchEntries } = useJournalStore();
  const [mode] = useState<PulseMode>(getCurrentMode);
  const [step, setStep] = useState(0);
  const [answer1, setAnswer1] = useState('');
  const [answer2, setAnswer2] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported] = useState(
    () => typeof window !== 'undefined' && isSpeechRecognitionSupported()
  );

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const accumulatedRef = useRef('');
  const stepRef = useRef(step);
  const answer1Ref = useRef(answer1);
  const answer2Ref = useRef(answer2);

  useEffect(() => { stepRef.current = step; }, [step]);
  useEffect(() => { answer1Ref.current = answer1; }, [answer1]);
  useEffect(() => { answer2Ref.current = answer2; }, [answer2]);

  const today = toLocalDateStr(new Date());
  const questions = mode === 'morning' ? MORNING_QUESTIONS : EVENING_QUESTIONS;
  const totalSteps = questions.length;

  // Find today's pulse for the current mode
  const todayPulse = entries.find(
    (e) =>
      e.entry_type === 'pulse' &&
      entryDateStr(e.created_at) === today &&
      (e.metadata as Record<string, unknown>)?.pulseMode === mode
  );

  // Also find the other mode's pulse for the completed view
  const otherMode = mode === 'morning' ? 'evening' : 'morning';
  const otherPulse = entries.find(
    (e) =>
      e.entry_type === 'pulse' &&
      entryDateStr(e.created_at) === today &&
      (e.metadata as Record<string, unknown>)?.pulseMode === otherMode
  );

  const currentValue = step === 0 ? answer1 : answer2;
  const setCurrentValue = step === 0 ? setAnswer1 : setAnswer2;

  // Auto-scroll textarea as speech adds text
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [answer1, answer2, step]);

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
      accumulatedRef.current = s === 0 ? answer1Ref.current : answer2Ref.current;
      stopMic();
    } else {
      const s = stepRef.current;
      accumulatedRef.current = s === 0 ? answer1Ref.current : answer2Ref.current;
      setIsListening(true);
      startListening({
        continuous: true,
        language: getLanguage(),
        onResult: (text) => {
          const prefix = accumulatedRef.current;
          const combined = prefix ? prefix + ' ' + text : text;
          if (stepRef.current === 0) setAnswer1(combined);
          else setAnswer2(combined);
        },
        onEnd: () => {
          const s = stepRef.current;
          accumulatedRef.current = s === 0 ? answer1Ref.current : answer2Ref.current;
          setIsListening(false);
        },
        onError: () => {
          const s = stepRef.current;
          accumulatedRef.current = s === 0 ? answer1Ref.current : answer2Ref.current;
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
      }

      const wordCount = contentText.split(/\s+/).filter(Boolean).length;
      await createEntry({
        entry_type: 'pulse',
        content_text: contentText,
        title: mode === 'morning' ? 'Morning Pulse' : 'Evening Pulse',
        metadata,
        word_count: wordCount,
      });
      await fetchEntries();
      setAnswer1('');
      setAnswer2('');
      setStep(0);
    } catch (err) {
      console.error('Failed to save pulse:', err);
      setSaveError(err instanceof Error ? err.message : 'Failed to save. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Helper to render a completed pulse summary ──────────────────
  const renderCompletedPulse = (
    entry: JournalEntry,
    pulseMode: PulseMode,
    isExpandable: boolean
  ) => {
    const meta = entry.metadata as Record<string, string> | null;
    const label = pulseMode === 'morning' ? t('pulse.morningDone') : t('pulse.eveningDone');
    const icon = pulseMode === 'morning' ? '☀️' : '🌙';

    if (!isExpandable) {
      // Compact non-expandable summary (the other mode's pulse)
      return (
        <div className="flex items-center gap-2 px-1">
          <span className="text-sm">{icon}</span>
          <span className="text-xs text-text-tertiary">{label}</span>
          <span className="text-xs text-success">✓</span>
        </div>
      );
    }

    return (
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left bg-surface rounded-2xl border border-border p-4 transition-colors hover:border-primary/30"
        data-testid="pulse-completed"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <span className="font-semibold text-text-primary text-sm">{label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-success">✓</span>
            <span className="text-xs text-text-tertiary">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>

        {expanded && meta && (
          <div className="mt-3 space-y-2 pt-3 border-t border-border">
            {pulseMode === 'morning' && meta.intention && (
              <div>
                <span className="text-xs font-medium text-primary">{t('pulse.intentionLabel')}</span>
                <p className="text-sm text-text-primary mt-0.5">{meta.intention}</p>
              </div>
            )}
            {pulseMode === 'evening' && meta.wentRight && (
              <div>
                <span className="text-xs font-medium text-primary">{t('pulse.wentRightLabel')}</span>
                <p className="text-sm text-text-primary mt-0.5">{meta.wentRight}</p>
              </div>
            )}
            {pulseMode === 'evening' && meta.doneBetter && (
              <div>
                <span className="text-xs font-medium text-accent">{t('pulse.doneBetterLabel')}</span>
                <p className="text-sm text-text-primary mt-0.5">{meta.doneBetter}</p>
              </div>
            )}
          </div>
        )}
      </button>
    );
  };

  // ── Completed state ─────────────────────────────────────────────
  if (todayPulse) {
    return (
      <div className="space-y-2">
        {renderCompletedPulse(todayPulse, mode, true)}
        {otherPulse && renderCompletedPulse(otherPulse, otherMode, false)}
      </div>
    );
  }

  // ── Input state — one question at a time ────────────────────────
  const isLastStep = step === totalSteps - 1;

  return (
    <div className="space-y-5" data-testid="pulse-card">
      {/* Progress dots */}
      <div className="flex gap-1.5">
        {questions.map((_, i) => (
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
        {t(questions[step].translationKey)}
      </p>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={currentValue}
        onChange={(e) => setCurrentValue(e.target.value)}
        placeholder={t('pulse.placeholder')}
        className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary text-sm resize-none outline-none min-h-[160px] focus:border-primary placeholder:text-text-tertiary"
        data-testid={`pulse-q${step}`}
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
        {isLastStep ? (
          <button
            onClick={handleSubmit}
            disabled={!answer1.trim() || submitting}
            className="flex-1 py-3 bg-primary text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition-opacity"
            data-testid="pulse-submit"
          >
            {submitting ? t('common.saving') : t('pulse.save')}
          </button>
        ) : (
          <button
            onClick={goNext}
            disabled={!currentValue.trim()}
            className="flex-1 py-3 bg-primary text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition-opacity"
            data-testid="pulse-next"
          >
            {t('common.next')}
          </button>
        )}
      </div>

      {/* Show other mode's completed pulse if it exists */}
      {otherPulse && (
        <div className="pt-2">
          {renderCompletedPulse(otherPulse, otherMode, false)}
        </div>
      )}
    </div>
  );
}
