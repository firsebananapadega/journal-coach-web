'use client';

import { useEffect, useState, useRef, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useJournalStore } from '@/stores/journalStore';
import { MoodSelector } from '@/components/MoodSelector';
import {
  isSpeechRecognitionSupported,
  startListening,
  stopListening,
} from '@/lib/speechRecognition';
import { getLanguage } from '@/lib/language';

interface TemplateQuestion {
  id: string;
  question_text: string;
  input_type: string;
  placeholder: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  questions: TemplateQuestion[];
  category: string;
}

export default function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: templateId } = use(params);
  const router = useRouter();
  const createEntry = useJournalStore((s) => s.createEntry);
  const [template, setTemplate] = useState<Template | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [moodScore, setMoodScore] = useState<number | null>(null);
  const [moodLabel, setMoodLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported] = useState(() => typeof window !== 'undefined' && isSpeechRecognitionSupported());

  // Use refs for the speech callback to always have current values
  const answersRef = useRef(answers);
  const currentQRef = useRef(currentQ);
  const accumulatedRef = useRef('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  answersRef.current = answers;
  currentQRef.current = currentQ;

  useEffect(() => {
    if (!templateId) return;
    supabase.from('templates').select('*').eq('id', templateId).single().then(({ data, error }) => {
      if (error || !data) {
        setLoadError(true);
        return;
      }
      const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
      const questions = rawQuestions.filter(
        (q: TemplateQuestion) => q.input_type !== 'phase_header'
      ) as TemplateQuestion[];
      setTemplate({ ...(data as Omit<Template, 'questions'>), questions });
      setAnswers(new Array(questions.length).fill(''));
    });
  }, [templateId]);

  // Auto-scroll textarea when answer changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [answers, currentQ]);

  // Stop mic when changing questions
  const stopMic = useCallback(() => {
    if (isListening) {
      stopListening();
      setIsListening(false);
    }
  }, [isListening]);

  const goToQuestion = (index: number) => {
    // Save accumulated text for next time
    accumulatedRef.current = '';
    stopMic();
    setCurrentQ(index);
  };

  const toggleMic = async () => {
    if (isListening) {
      // Save current answer as accumulated text for appending
      const idx = currentQRef.current;
      accumulatedRef.current = answersRef.current[idx] || '';
      stopMic();
    } else {
      // Set accumulated to current answer so new speech appends
      const idx = currentQRef.current;
      accumulatedRef.current = answersRef.current[idx] || '';
      setIsListening(true);
      startListening({
        continuous: true,
        language: getLanguage(),
        onResult: (text) => {
          const i = currentQRef.current;
          const updated = [...answersRef.current];
          const prefix = accumulatedRef.current;
          updated[i] = prefix ? prefix + ' ' + text : text;
          setAnswers(updated);
        },
        onEnd: () => {
          const i = currentQRef.current;
          accumulatedRef.current = answersRef.current[i] || '';
          setIsListening(false);
        },
        onError: () => {
          const i = currentQRef.current;
          accumulatedRef.current = answersRef.current[i] || '';
          setIsListening(false);
        },
      });
    }
  };

  const handleSave = async () => {
    if (!template) return;
    setSaving(true);
    setSaveError('');
    const contentParts = template.questions.map((q, i) => `Q: ${q.question_text}\nA: ${answers[i] || '(skipped)'}`);
    const contentText = contentParts.join('\n\n');
    const wordCount = answers.join(' ').split(/\s+/).filter(Boolean).length;
    try {
      await createEntry({
        entry_type: 'template',
        content_text: contentText,
        template_id: template.id,
        title: template.name,
        mood_score: moodScore,
        mood_label: moodLabel,
        word_count: wordCount,
      });
      router.push('/home');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-text-secondary">Template not found.</p>
        <button onClick={() => router.push('/home')} className="text-primary">Go home</button>
      </div>
    );
  }

  if (!template) {
    return <div className="flex items-center justify-center min-h-screen"><div className="animate-pulse text-primary">Loading template...</div></div>;
  }

  const isDone = currentQ >= template.questions.length;
  const currentQuestion = !isDone ? template.questions[currentQ] : null;

  return (
    <div className="flex flex-col h-screen bg-bg">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
        <button onClick={() => { stopMic(); router.push('/home'); }} className="text-text-secondary text-lg">&#10005;</button>
        <span className="text-sm font-semibold text-text-primary">{template.name}</span>
        <div className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
        {/* Progress */}
        <div className="flex gap-1">
          {template.questions.map((_, i) => (
            <div key={i} className={`flex-1 h-1 rounded-full ${i <= currentQ ? 'bg-primary' : 'bg-border'}`} />
          ))}
        </div>

        {!isDone && currentQuestion ? (
          <div className="space-y-4">
            <p className="text-lg text-text-primary font-medium">{currentQuestion.question_text}</p>

            {currentQuestion.input_type === 'mood_scale' ? (
              <MoodSelector
                value={moodScore}
                onChange={(score, label) => {
                  setMoodScore(score);
                  setMoodLabel(label);
                  const updated = [...answers];
                  updated[currentQ] = label;
                  setAnswers(updated);
                }}
              />
            ) : (
              <div className="flex flex-col space-y-2">
                <textarea
                  ref={textareaRef}
                  value={answers[currentQ] || ''}
                  onChange={(e) => {
                    const updated = [...answers];
                    updated[currentQ] = e.target.value;
                    setAnswers(updated);
                  }}
                  placeholder={currentQuestion.placeholder || 'Your answer...'}
                  className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary text-sm resize-none outline-none min-h-[200px] focus:border-primary"
                />
                {speechSupported && (
                  <button
                    onClick={toggleMic}
                    className={`w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                      isListening
                        ? 'bg-error text-white'
                        : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    </svg>
                    {isListening ? 'Stop Recording' : 'Tap to Speak'}
                  </button>
                )}
              </div>
            )}

            <div className="flex gap-2">
              {currentQ > 0 && (
                <button onClick={() => goToQuestion(currentQ - 1)} className="flex-1 py-3 bg-surface border border-border text-text-secondary rounded-xl text-sm font-medium">
                  Previous
                </button>
              )}
              <button
                onClick={() => goToQuestion(currentQ + 1)}
                className="flex-1 py-3 bg-primary text-white rounded-xl text-sm font-semibold"
              >
                {currentQ < template.questions.length - 1 ? 'Next' : 'Done'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-text-primary">Review</h2>
            {template.questions.map((q, i) => (
              <div key={i} className="space-y-1">
                <p className="text-xs text-text-tertiary">{q.question_text}</p>
                <p className="text-sm text-text-primary">{answers[i] || '(skipped)'}</p>
              </div>
            ))}
            <MoodSelector value={moodScore} onChange={(score, label) => { setMoodScore(score); setMoodLabel(label); }} />
            {saveError && <p className="text-error text-sm text-center">{saveError}</p>}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Entry'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
