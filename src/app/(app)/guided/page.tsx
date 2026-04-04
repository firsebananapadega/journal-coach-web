'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { getGuideResponse, getClosingMessage, getTimeOfDay } from '@/lib/guideEngine';
import type { ConversationExchange } from '@/lib/guideEngine';
import { getGuideOrDefault, type GuideId } from '@/lib/guideConfigs';
import { getGuideAvatar } from '@/lib/guideAvatars';
import {
  isSpeechRecognitionSupported,
  requestMicPermission,
  startListening,
  stopListening,
  correctTranscript,
} from '@/lib/speechRecognition';
import { useJournalStore } from '@/stores/journalStore';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { MoodSelector } from '@/components/MoodSelector';

interface Exchange {
  question: string;
  answer: string;
  timestamp: string;
}

export default function GuidedSessionPage() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const guide = getGuideOrDefault(profile?.preferred_guide);
  const createEntry = useJournalStore((s) => s.createEntry);
  const updateEntry = useJournalStore((s) => s.updateEntry);
  const { entries } = useJournalStore();

  const getGuideGreeting = useCallback(() => {
    const tod = getTimeOfDay();
    const greetings = guide.greetings[tod as keyof typeof guide.greetings] || guide.greetings.evening;
    return greetings[Math.floor(Math.random() * greetings.length)];
  }, [guide]);

  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [moodScore, setMoodScore] = useState<number | null>(null);
  const [moodLabel, setMoodLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [geminiError, setGeminiError] = useState(false);
  const [detectedGoal, setDetectedGoal] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [sessionWasDeep, setSessionWasDeep] = useState(false);
  const [speechSupported] = useState(() => typeof window !== 'undefined' && isSpeechRecognitionSupported());

  const stopRef = useRef<(() => void) | null>(null);
  const draftEntryIdRef = useRef<string | null>(null);
  const lastFailedAnswer = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Set greeting on mount
  useEffect(() => {
    setCurrentQuestion(getGuideGreeting());
  }, [getGuideGreeting]);

  // Auto-scroll to bottom
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

  const toggleMic = async () => {
    if (isListening) {
      stopRef.current?.();
      stopRef.current = null;
      setIsListening(false);
    } else {
      const granted = await requestMicPermission();
      if (!granted) {
        alert('Please enable microphone access in your browser settings.');
        return;
      }
      setIsListening(true);
      const cleanup = startListening({
        continuous: true,
        onResult: (transcript, isFinal) => {
          if (isFinal) {
            setCurrentAnswer(transcript);
          } else {
            setCurrentAnswer(transcript);
          }
        },
        onEnd: () => {
          setIsListening(false);
          stopRef.current = null;
        },
        onError: (err) => {
          console.warn('Speech error:', err);
          setIsListening(false);
          stopRef.current = null;
        },
      });
      stopRef.current = cleanup;
    }
  };

  const recentEntriesSummary = entries
    .slice(0, 5)
    .map((e) => {
      const date = new Date(e.created_at).toLocaleDateString('en-US', { weekday: 'short' });
      const mood = e.mood_label ? ` (${e.mood_label})` : '';
      const content = e.content_text?.substring(0, 300) || '';
      return `[${date}${mood}] ${content}`;
    })
    .filter(Boolean)
    .join(' | ');

  const submitAnswer = async (retryAnswer?: string) => {
    const fullAnswer = retryAnswer || currentAnswer.trim();
    if (!fullAnswer) return;
    setGeminiError(false);

    // Stop mic if active
    if (isListening) {
      stopRef.current?.();
      stopRef.current = null;
      setIsListening(false);
    }

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
        recentEntriesSummary,
        activeGoals: profile?.intentions || [],
        mood: moodLabel || undefined,
      });

      setThinking(false);
      lastFailedAnswer.current = null;
      setCurrentQuestion(result.response.question);

      if (result.response.type === 'goal_suggestion' && result.response.detected_goal) {
        setDetectedGoal(result.response.detected_goal);
      }

      autoSave(updatedExchanges, result.response.question);
    } catch {
      setThinking(false);
      lastFailedAnswer.current = fullAnswer;
      setGeminiError(true);
      autoSave(updatedExchanges, currentQuestion);
    }
  };

  const handleSave = async () => {
    if (exchanges.length === 0) return;
    setSaving(true);

    const contentParts = exchanges.map((e) => `Q: ${e.question}\nA: ${e.answer}`);
    const contentText = contentParts.join('\n\n');
    const allAnswers = exchanges.map((e) => e.answer).join(' ');
    const wordCount = allAnswers.split(/\s+/).filter(Boolean).length;

    try {
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
    } catch (err) {
      console.warn('Save failed:', err);
    }

    setSaving(false);
    router.push('/home');
  };

  const handleEndSession = () => {
    const allText = exchanges.map((e) => e.answer).join(' ').toLowerCase();
    const deepIndicators = ['grief', 'loss', 'death', 'trauma', 'abuse', 'divorce', 'breakup', 'fired', 'failed', 'worthless', 'hopeless'];
    setSessionWasDeep(deepIndicators.some((w) => allText.includes(w)));
    setIsComplete(true);
  };

  return (
    <div className="flex flex-col h-dvh bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
        <button
          onClick={() => {
            if (exchanges.length > 0 && !confirm('Leave session? Your progress is saved.')) return;
            router.push('/home');
          }}
          className="text-text-secondary hover:text-text-primary text-lg"
        >
          ✕
        </button>
        <div className="flex items-center gap-2">
          <Image
            src={getGuideAvatar(guide.id as GuideId)}
            alt={guide.name}
            width={28}
            height={28}
            className="rounded-full"
          />
          <span className="text-sm font-semibold text-text-primary">Session with {guide.name}</span>
        </div>
        {exchanges.length > 0 && !isComplete ? (
          <button onClick={handleEndSession} className="text-sm text-primary font-semibold">End</button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {exchanges.map((exchange, i) => (
          <div key={i} className="space-y-2">
            {/* Guide bubble */}
            <div className="max-w-[85%] bg-[#1A2B22] rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Image src={getGuideAvatar(guide.id as GuideId)} alt="" width={20} height={20} className="rounded-full" />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: guide.accentColor }}>{guide.name}</span>
              </div>
              <p className="text-[15px] text-[#F0F0F5] leading-relaxed">{exchange.question}</p>
            </div>
            {/* User bubble */}
            <div className="max-w-[85%] ml-auto bg-[#222725] rounded-2xl p-4">
              <p className="text-[15px] text-text-primary leading-relaxed">{exchange.answer}</p>
            </div>
          </div>
        ))}

        {/* Current state */}
        {thinking ? (
          <div className="max-w-[85%] bg-[#1A2B22] rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Image src={getGuideAvatar(guide.id as GuideId)} alt="" width={20} height={20} className="rounded-full" />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: guide.accentColor }}>{guide.name}</span>
            </div>
            <p className="text-[15px] text-text-secondary italic">Reflecting...</p>
          </div>
        ) : geminiError ? (
          <div className="bg-[#2A1A1A] border border-[#4A2A2A] rounded-2xl p-4 text-center space-y-3">
            <p className="text-sm text-[#FF9999]">Couldn&apos;t reach your guide. Check your connection.</p>
            <button
              onClick={() => lastFailedAnswer.current && submitAnswer(lastFailedAnswer.current)}
              className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-semibold"
            >
              Retry
            </button>
          </div>
        ) : !isComplete ? (
          <>
            <div className="max-w-[85%] bg-[#1A2B22] rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Image src={getGuideAvatar(guide.id as GuideId)} alt="" width={20} height={20} className="rounded-full" />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: guide.accentColor }}>{guide.name}</span>
              </div>
              <p className="text-[15px] text-[#F0F0F5] leading-relaxed">{currentQuestion}</p>
            </div>
            {detectedGoal && (
              <div className="bg-[#2A2D1E] border border-[#4A5C3A] rounded-2xl p-4 space-y-3">
                <p className="text-sm text-text-primary font-medium">🎯 Hold &quot;{detectedGoal}&quot; as an intention?</p>
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
                    Yes
                  </button>
                  <button
                    onClick={() => setDetectedGoal(null)}
                    className="px-4 py-2 bg-border text-text-secondary rounded-lg text-sm"
                  >
                    Not now
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <div className="max-w-[85%] bg-[#1A2B22] rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Image src={getGuideAvatar(guide.id as GuideId)} alt="" width={20} height={20} className="rounded-full" />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: guide.accentColor }}>{guide.name}</span>
              </div>
              <p className="text-[15px] text-[#F0F0F5] leading-relaxed">
                {sessionWasDeep
                  ? 'You went somewhere real today. That takes courage. Take a moment before you move on.'
                  : `Thanks for sharing. You covered ${exchanges.length} topic${exchanges.length !== 1 ? 's' : ''}. How are you feeling now?`}
              </p>
            </div>

            {sessionWasDeep && (
              <div className="bg-[#1A2320] rounded-2xl p-4 space-y-2">
                <p className="text-sm font-semibold text-text-primary">Take a breath</p>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Processing heavy stuff can leave you drained. Try a slow exhale — breathe in through your nose, then let out a long sigh. Do that twice.
                </p>
              </div>
            )}

            <MoodSelector value={moodScore} onChange={(score, label) => { setMoodScore(score); setMoodLabel(label); }} />

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Session'}
            </button>
          </div>
        )}
      </div>

      {/* Input area */}
      {!isComplete && !geminiError && (
        <div className="border-t border-border bg-bg px-5 py-3 space-y-2">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={currentAnswer}
              onChange={(e) => setCurrentAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitAnswer();
                }
              }}
              placeholder={isListening ? 'Listening...' : 'Type or tap mic to speak...'}
              className={`flex-1 px-4 py-2.5 bg-surface border rounded-2xl text-text-primary text-[15px] resize-none outline-none min-h-[44px] max-h-[120px] ${
                isListening ? 'border-error' : 'border-border focus:border-primary'
              }`}
              rows={1}
            />
            {speechSupported && (
              <button
                onClick={toggleMic}
                className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  isListening ? 'bg-error mic-pulse' : 'bg-primary hover:bg-primary-dark'
                }`}
              >
                {isListening ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                )}
              </button>
            )}
          </div>
          {currentAnswer.trim() && (
            <button
              onClick={() => submitAnswer()}
              className="w-full py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors"
            >
              Send
            </button>
          )}
        </div>
      )}
    </div>
  );
}
