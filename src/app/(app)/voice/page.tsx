'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  isSpeechRecognitionSupported,
  requestMicPermission,
  startListening,
  stopListening,
} from '@/lib/speechRecognition';
import { useJournalStore } from '@/stores/journalStore';
import { MoodSelector } from '@/components/MoodSelector';

export default function VoiceEntryPage() {
  const router = useRouter();
  const createEntry = useJournalStore((s) => s.createEntry);
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [moodScore, setMoodScore] = useState<number | null>(null);
  const [moodLabel, setMoodLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [speechSupported] = useState(() => typeof window !== 'undefined' && isSpeechRecognitionSupported());
  const stopRef = useRef<(() => void) | null>(null);
  const startTime = useRef(Date.now());
  const accumulatedRef = useRef('');
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const hasAutoStarted = useRef(false);

  useEffect(() => {
    startTime.current = Date.now();
  }, []);

  // Auto-scroll to bottom when transcript changes
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const startMic = useCallback(async () => {
    const granted = await requestMicPermission();
    if (!granted) {
      alert('Please enable microphone access.');
      return;
    }
    setIsListening(true);
    const cleanup = startListening({
      continuous: true,
      onResult: (text) => {
        // Append new speech session text after accumulated text
        const prefix = accumulatedRef.current;
        setTranscript(prefix ? prefix + ' ' + text : text);
      },
      onEnd: () => {
        // Save current transcript as accumulated before stopping
        setTranscript((prev) => {
          accumulatedRef.current = prev;
          return prev;
        });
        setIsListening(false);
        stopRef.current = null;
      },
      onError: () => {
        setTranscript((prev) => {
          accumulatedRef.current = prev;
          return prev;
        });
        setIsListening(false);
        stopRef.current = null;
      },
    });
    stopRef.current = cleanup;
  }, []);

  // Auto-start mic on mount
  useEffect(() => {
    if (speechSupported && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      startMic();
    }
  }, [speechSupported, startMic]);

  const toggleMic = async () => {
    if (isListening) {
      // Save current transcript as accumulated text
      accumulatedRef.current = transcript;
      stopRef.current?.();
      stopRef.current = null;
      setIsListening(false);
    } else {
      await startMic();
    }
  };

  const handleSave = async () => {
    if (!transcript.trim()) return;
    setSaving(true);
    const duration = Math.round((Date.now() - startTime.current) / 1000);
    const wordCount = transcript.split(/\s+/).filter(Boolean).length;
    try {
      await createEntry({
        entry_type: 'voice',
        content_text: transcript,
        title: `Voice entry — ${new Date().toLocaleDateString()}`,
        mood_score: moodScore,
        mood_label: moodLabel,
        duration_seconds: duration,
        word_count: wordCount,
      });
      router.push('/home');
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-bg">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
        <button onClick={() => router.push('/home')} className="text-text-secondary text-lg">&#10005;</button>
        <span className="text-sm font-semibold text-text-primary">Voice Entry</span>
        <div className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
        {!speechSupported && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
            <p className="text-sm text-warning">
              Voice input is not supported in this browser. Try Chrome or Edge for the best experience.
            </p>
          </div>
        )}

        {/* Transcript */}
        <div className="min-h-[200px]">
          {transcript ? (
            <p className="text-text-primary text-[15px] leading-relaxed whitespace-pre-wrap">{transcript}</p>
          ) : (
            <p className="text-text-tertiary text-center mt-16">
              {isListening ? 'Listening...' : 'Tap the mic and start talking.'}
            </p>
          )}
          <div ref={transcriptEndRef} />
        </div>

        {/* Mood selector and Save — only show when mic is off and there's text */}
        {transcript.trim() && !isListening && (
          <>
            <MoodSelector value={moodScore} onChange={(score, label) => { setMoodScore(score); setMoodLabel(label); }} />
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Entry'}
            </button>
          </>
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
