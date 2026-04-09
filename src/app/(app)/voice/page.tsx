'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  isSpeechRecognitionSupported,
  startListening,
  stopListening,
} from '@/lib/speechRecognition';
import { useJournalStore } from '@/stores/journalStore';
import { useAuthStore } from '@/stores/authStore';
import { MoodSelector } from '@/components/MoodSelector';
import { classifyCapture, type CaptureResult } from '@/lib/captureEngine';
import { getLanguage } from '@/lib/language';
import { t } from '@/lib/translations';

export default function VoiceEntryPage() {
  const router = useRouter();
  const createEntry = useJournalStore((s) => s.createEntry);
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [moodScore, setMoodScore] = useState<number | null>(null);
  const [moodLabel, setMoodLabel] = useState<string | null>(null);
  const [speechSupported] = useState(() => typeof window !== 'undefined' && isSpeechRecognitionSupported());
  const stopRef = useRef<(() => void) | null>(null);
  const startTime = useRef(Date.now());
  const accumulatedRef = useRef('');
  const transcriptRef = useRef('');
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const manualStopRef = useRef(false);

  useEffect(() => {
    startTime.current = Date.now();
    // Auto-focus the textarea
    textareaRef.current?.focus();
  }, []);

  // Keep transcriptRef in sync with state (avoids stale closures)
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Auto-scroll only during mic listening (programmatic text injection).
  // During manual typing, the browser handles cursor visibility natively.
  useEffect(() => {
    if (isListening) {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript, isListening]);

  const startMic = useCallback(() => {
    manualStopRef.current = false;
    setIsListening(true);
    const cleanup = startListening({
      continuous: true,
      language: getLanguage(),
      onResult: (text) => {
        const prefix = accumulatedRef.current;
        const newTranscript = prefix ? prefix + ' ' + text : text;
        setTranscript(newTranscript);
      },
      onEnd: () => {
        if (!manualStopRef.current) {
          accumulatedRef.current = transcriptRef.current;
        }
        setIsListening(false);
        stopRef.current = null;
      },
      onError: () => {
        accumulatedRef.current = transcriptRef.current;
        setIsListening(false);
        stopRef.current = null;
      },
    });
    stopRef.current = cleanup;
  }, []);

  const toggleMic = async () => {
    if (isListening) {
      manualStopRef.current = true;
      accumulatedRef.current = transcriptRef.current;
      stopRef.current?.();
      stopRef.current = null;
      setIsListening(false);
    } else {
      // Set accumulated to current text so mic appends after it
      accumulatedRef.current = transcriptRef.current;
      await startMic();
    }
  };

  const handleSave = async () => {
    if (!transcript.trim()) return;
    const duration = Math.round((Date.now() - startTime.current) / 1000);
    const wordCount = transcript.split(/\s+/).filter(Boolean).length;

    createEntry({
      entry_type: 'voice',
      content_text: transcript,
      title: `Voice entry — ${new Date().toLocaleDateString()}`,
      mood_score: moodScore,
      mood_label: moodLabel,
      duration_seconds: duration,
      word_count: wordCount,
    }).catch(() => {
      console.warn('Voice entry failed to save to Supabase');
    });

    classifyCapture(transcript).then((result: CaptureResult) => {
      if (result.ideas.length > 0) {
        try {
          const existing = JSON.parse(localStorage.getItem('journal_ideas') || '[]');
          const newItems = result.ideas.map((text) => ({
            id: crypto.randomUUID(),
            text,
            createdAt: new Date().toISOString(),
          }));
          localStorage.setItem('journal_ideas', JSON.stringify([...newItems, ...existing]));
        } catch {}
      }

      if (result.gratitude.length > 0) {
        try {
          const existing = JSON.parse(localStorage.getItem('journal_gratitude') || '[]');
          const newItems = result.gratitude.map((text) => ({
            id: crypto.randomUUID(),
            text,
            createdAt: new Date().toISOString(),
          }));
          localStorage.setItem('journal_gratitude', JSON.stringify([...newItems, ...existing]));
        } catch {}
      }

      if (result.intentions.length > 0) {
        const profile = useAuthStore.getState().profile;
        const currentIntentions = profile?.intentions || [];
        const newIntentions = result.intentions.filter((i) => !currentIntentions.includes(i));
        if (newIntentions.length > 0) {
          useAuthStore.getState().updateProfile({
            intentions: [...currentIntentions, ...newIntentions],
          });
        }
      }

      if (result.habits.length > 0) {
        try {
          const existing = JSON.parse(localStorage.getItem('journal_ideas') || '[]');
          const newItems = result.habits.map((text) => ({
            id: crypto.randomUUID(),
            text: `Habit idea: ${text}`,
            createdAt: new Date().toISOString(),
          }));
          localStorage.setItem('journal_ideas', JSON.stringify([...newItems, ...existing]));
        } catch {}
      }
    }).catch((err) => {
      console.warn('Capture classification failed:', err);
    });

    router.push('/home');
  };

  return (
    <div className="flex flex-col h-screen bg-bg">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
        <button onClick={() => router.push('/home')} className="text-text-secondary text-lg">&#10005;</button>
        <span className="text-sm font-semibold text-text-primary">{t('home.freeThought')}</span>
        <div className="w-10" />
      </div>

      <div className="flex-1 flex flex-col overflow-y-auto px-5 py-4">
        {!speechSupported && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 mb-4">
            <p className="text-sm text-warning">{t('voice.browserWarning')}</p>
          </div>
        )}

        {/* Text area — fills available space */}
        <div className="flex-1 min-h-0">
          <textarea
            ref={textareaRef}
            value={transcript}
            readOnly={isListening}
            onChange={(e) => {
              if (!isListening) {
                setTranscript(e.target.value);
                accumulatedRef.current = e.target.value;
              }
            }}
            className={`w-full h-full text-text-primary text-[15px] leading-relaxed bg-transparent border-none outline-none resize-none placeholder:text-text-tertiary ${
              isListening ? 'caret-transparent' : ''
            }`}
            placeholder={t('write.placeholder')}
          />
          <div ref={transcriptEndRef} />
        </div>

        {/* Mood selector and Save — show when there's text and mic is off */}
        {transcript.trim() && !isListening && (
          <div className="space-y-4 pt-4 flex-shrink-0">
            <MoodSelector value={moodScore} onChange={(score, label) => { setMoodScore(score); setMoodLabel(label); }} />
            <button
              onClick={handleSave}
              className="w-full py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors"
            >
              {t('voice.save')}
            </button>
          </div>
        )}
      </div>

      {/* Mic button at bottom */}
      {speechSupported && (
        <div className="flex justify-center pb-8 pt-4">
          <button
            onClick={toggleMic}
            className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-colors shadow-lg ${
              isListening ? 'bg-error mic-pulse shadow-error/30' : 'bg-primary shadow-primary/30 hover:bg-primary-dark'
            }`}
          >
            {isListening ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
