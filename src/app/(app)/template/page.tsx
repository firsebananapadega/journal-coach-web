'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useJournalStore } from '@/stores/journalStore';
import { MoodSelector } from '@/components/MoodSelector';
import {
  isSpeechRecognitionSupported,
  requestMicPermission,
  startListening,
} from '@/lib/speechRecognition';

interface Template {
  id: string;
  name: string;
  description: string;
  questions: string[];
  category: string;
}

function TemplateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get('id');
  const createEntry = useJournalStore((s) => s.createEntry);
  const [template, setTemplate] = useState<Template | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [moodScore, setMoodScore] = useState<number | null>(null);
  const [moodLabel, setMoodLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported] = useState(() => typeof window !== 'undefined' && isSpeechRecognitionSupported());
  const stopRef = { current: null as (() => void) | null };

  useEffect(() => {
    if (!templateId) return;
    supabase.from('templates').select('*').eq('id', templateId).single().then(({ data }) => {
      if (data) {
        setTemplate(data as Template);
        setAnswers(new Array((data as Template).questions.length).fill(''));
      }
    });
  }, [templateId]);

  const toggleMic = async (index: number) => {
    if (isListening) {
      stopRef.current?.();
      stopRef.current = null;
      setIsListening(false);
    } else {
      const granted = await requestMicPermission();
      if (!granted) return;
      setIsListening(true);
      stopRef.current = startListening({
        continuous: true,
        onResult: (text) => {
          const updated = [...answers];
          updated[index] = text;
          setAnswers(updated);
        },
        onEnd: () => { setIsListening(false); stopRef.current = null; },
        onError: () => { setIsListening(false); },
      });
    }
  };

  const handleSave = async () => {
    if (!template) return;
    setSaving(true);
    const contentParts = template.questions.map((q, i) => `Q: ${q}\nA: ${answers[i] || '(skipped)'}`);
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
    } catch {
      setSaving(false);
    }
  };

  if (!template) {
    return <div className="flex items-center justify-center min-h-screen"><div className="animate-pulse text-primary">Loading template...</div></div>;
  }

  const isDone = currentQ >= template.questions.length;

  return (
    <div className="flex flex-col h-dvh bg-bg">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
        <button onClick={() => router.push('/home')} className="text-text-secondary text-lg">✕</button>
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

        {!isDone ? (
          <div className="space-y-4">
            <p className="text-lg text-text-primary font-medium">{template.questions[currentQ]}</p>
            <div className="flex items-end gap-2">
              <textarea
                value={answers[currentQ] || ''}
                onChange={(e) => {
                  const updated = [...answers];
                  updated[currentQ] = e.target.value;
                  setAnswers(updated);
                }}
                placeholder="Your answer..."
                className="flex-1 px-4 py-3 bg-surface border border-border rounded-xl text-text-primary text-sm resize-none outline-none min-h-[100px] focus:border-primary"
              />
              {speechSupported && (
                <button
                  onClick={() => toggleMic(currentQ)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    isListening ? 'bg-error' : 'bg-primary'
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  </svg>
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {currentQ > 0 && (
                <button onClick={() => setCurrentQ(currentQ - 1)} className="flex-1 py-3 bg-surface border border-border text-text-secondary rounded-xl text-sm font-medium">
                  Previous
                </button>
              )}
              <button
                onClick={() => setCurrentQ(currentQ + 1)}
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
                <p className="text-xs text-text-tertiary">{q}</p>
                <p className="text-sm text-text-primary">{answers[i] || '(skipped)'}</p>
              </div>
            ))}
            <MoodSelector value={moodScore} onChange={(score, label) => { setMoodScore(score); setMoodLabel(label); }} />
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

export default function TemplatePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-pulse text-primary">Loading...</div></div>}>
      <TemplateContent />
    </Suspense>
  );
}
