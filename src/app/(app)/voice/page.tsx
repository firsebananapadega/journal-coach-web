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
import { classifyCapture, resolveWhen, type CaptureResult } from '@/lib/captureEngine';
import { usePlanStore, type PlanEvent } from '@/stores/planStore';
import { usePriorityStore, type PriorityItem, type GroceryGroup, type GroceryItem } from '@/stores/priorityStore';
import { toLocalDateStr } from '@/lib/dateUtils';
import { supabase } from '@/lib/supabase';
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const manualStopRef = useRef(false);

  useEffect(() => {
    startTime.current = Date.now();
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Auto-scroll textarea to bottom during mic listening
  useEffect(() => {
    if (isListening && textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [transcript, isListening]);

  const startMic = useCallback(() => {
    manualStopRef.current = false;
    const cleanup = startListening({
      continuous: true,
      language: getLanguage(),
      onResult: (text) => {
        const prefix = accumulatedRef.current;
        const newTranscript = prefix ? prefix + ' ' + text : text;
        setTranscript(newTranscript);
      },
      onEnd: () => {
        // Always sync accumulatedRef with current transcript
        accumulatedRef.current = transcriptRef.current;
        stopRef.current = null;

        if (!manualStopRef.current) {
          // Recognition ended naturally (iOS pause, timeout, etc.)
          // Auto-restart with a fresh instance — no stale state
          const retry = startListening({
            continuous: true,
            language: getLanguage(),
            onResult: (text) => {
              const prefix = accumulatedRef.current;
              const newTranscript = prefix ? prefix + ' ' + text : text;
              setTranscript(newTranscript);
            },
            onEnd: () => {
              accumulatedRef.current = transcriptRef.current;
              stopRef.current = null;
              if (!manualStopRef.current) {
                // If still not manually stopped, give up after second auto-end
                // (avoids infinite restart loops)
                setIsListening(false);
              }
            },
            onError: () => {
              accumulatedRef.current = transcriptRef.current;
              setIsListening(false);
              stopRef.current = null;
            },
          });
          if (retry) {
            stopRef.current = retry;
          } else {
            setIsListening(false);
          }
        } else {
          setIsListening(false);
        }
      },
      onError: () => {
        accumulatedRef.current = transcriptRef.current;
        setIsListening(false);
        stopRef.current = null;
      },
    });
    if (cleanup) {
      setIsListening(true);
      stopRef.current = cleanup;
    }
  }, []);

  const toggleMic = () => {
    if (isListening) {
      manualStopRef.current = true;
      // Don't update accumulatedRef here — recognition.stop() fires a final
      // onresult with the full finalTranscript. If we set accumulatedRef to
      // the current transcript now, that final onresult callback would prepend
      // it again, causing duplication. The onEnd handler sets accumulatedRef.
      stopRef.current?.();
      stopRef.current = null;
      setIsListening(false);
    } else {
      accumulatedRef.current = transcriptRef.current;
      startMic();
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

    classifyCapture(transcript).then(async (result: CaptureResult) => {
      const todayStr = toLocalDateStr(new Date());

      // ── Plans → planStore (localStorage + Supabase) ──
      if (result.plans && result.plans.length > 0) {
        try {
          for (const plan of result.plans) {
            const resolvedDate = resolveWhen(plan.when, todayStr);
            const existingRaw = localStorage.getItem('plans_' + resolvedDate);
            const existing: PlanEvent[] = existingRaw ? JSON.parse(existingRaw) : [];
            const newPlan: PlanEvent = {
              id: crypto.randomUUID(),
              title: plan.title,
              time: plan.time,
              location: plan.location,
              subtasks: plan.subtasks.map((st) => ({ id: crypto.randomUUID(), text: st, completed: false })),
              completed: false,
              sort_order: existing.length,
            };
            await usePlanStore.getState().savePlans(resolvedDate, [...existing, newPlan]);
          }
        } catch {}
      }

      // ── Priorities → priorityStore (Supabase) ──
      if (result.priorities.length > 0) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            for (const task of result.priorities) {
              const resolvedDate = resolveWhen(task.when, todayStr);
              const { data } = await supabase.from('daily_priorities')
                .select('items').eq('user_id', user.id).eq('date', resolvedDate).maybeSingle();
              const existingItems = (data?.items as PriorityItem[]) ?? [];
              const ni: PriorityItem = {
                id: crypto.randomUUID(), text: task.text, completed: false, sort_order: existingItems.length,
              };
              await usePriorityStore.getState().savePriorities(resolvedDate, [...existingItems, ni]);
            }
          }
        } catch {}
      }

      // ── Groceries → priorityStore (Supabase) ──
      if (result.groceries && result.groceries.length > 0) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data } = await supabase.from('daily_priorities')
              .select('groceries').eq('user_id', user.id).eq('date', todayStr).maybeSingle();
            const existingGroups: GroceryGroup[] = (data?.groceries as GroceryGroup[]) ?? [];
            const merged = [...existingGroups];
            for (const newGroup of result.groceries) {
              const match = merged.find((g) => g.store.toLowerCase() === newGroup.store.toLowerCase());
              if (match) {
                const newItems = newGroup.items.filter(
                  (item) => !match.items.some((ei: GroceryItem) => ei.name.toLowerCase() === item.toLowerCase()),
                );
                match.items.push(...newItems.map((name) => ({ id: crypto.randomUUID(), name, completed: false })));
              } else {
                merged.push({
                  id: crypto.randomUUID(),
                  store: newGroup.store,
                  items: newGroup.items.map((name) => ({ id: crypto.randomUUID(), name, completed: false })),
                });
              }
            }
            await usePriorityStore.getState().saveGroceries(todayStr, merged);
          }
        } catch {}
      }

      // ── Ideas → localStorage ──
      if (result.ideas.length > 0) {
        try {
          const existing = JSON.parse(localStorage.getItem('journal_ideas') || '[]');
          const newItems = result.ideas.map((txt) => ({ id: crypto.randomUUID(), text: txt, createdAt: new Date().toISOString() }));
          localStorage.setItem('journal_ideas', JSON.stringify([...newItems, ...existing]));
        } catch {}
      }

      // ── Gratitude → localStorage ──
      if (result.gratitude.length > 0) {
        try {
          const existing = JSON.parse(localStorage.getItem('journal_gratitude') || '[]');
          const newItems = result.gratitude.map((txt) => ({ id: crypto.randomUUID(), text: txt, createdAt: new Date().toISOString() }));
          localStorage.setItem('journal_gratitude', JSON.stringify([...newItems, ...existing]));
        } catch {}
      }

      // ── Intentions → user profile ──
      if (result.intentions.length > 0) {
        const profile = useAuthStore.getState().profile;
        const currentIntentions = profile?.intentions || [];
        const newIntentions = result.intentions.filter((i) => !currentIntentions.includes(i));
        if (newIntentions.length > 0) {
          useAuthStore.getState().updateProfile({ intentions: [...currentIntentions, ...newIntentions] });
        }
      }

      // ── Habits → localStorage (as idea) ──
      if (result.habits.length > 0) {
        try {
          const existing = JSON.parse(localStorage.getItem('journal_ideas') || '[]');
          const newItems = result.habits.map((txt) => ({ id: crypto.randomUUID(), text: `Habit idea: ${txt}`, createdAt: new Date().toISOString() }));
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
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border flex-shrink-0">
        <button onClick={() => router.push('/home')} className="text-text-secondary text-lg">&#10005;</button>
        <span className="text-sm font-semibold text-text-primary">{t('home.freeThought')}</span>
        <div className="w-10" />
      </div>

      {/* Textarea — capped height, scrolls internally */}
      <div className="px-5 pt-4 flex-shrink-0" style={{ height: '26vh' }}>
        {!speechSupported && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 mb-3">
            <p className="text-xs text-warning">{t('voice.browserWarning')}</p>
          </div>
        )}
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
          className={`w-full h-full text-text-primary text-[15px] leading-relaxed bg-transparent outline-none resize-none overflow-y-auto placeholder:text-text-tertiary ${
            isListening ? 'caret-transparent' : ''
          }`}
          placeholder={t('write.placeholder')}
        />
      </div>

      {/* Bottom section — mood, save, mic — sits right below textarea */}
      <div className="flex-shrink-0 flex flex-col items-center px-5 pt-3 pb-4 space-y-3">
        {/* Mood + Save — always rendered to keep mic position fixed, hidden when no text */}
        <div className={`w-full space-y-3 flex flex-col items-center transition-opacity ${
          transcript.trim() && !isListening ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}>
          <MoodSelector value={moodScore} onChange={(score, label) => { setMoodScore(score); setMoodLabel(label); }} />
          <button
            onClick={handleSave}
            className="w-full py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors"
          >
            {t('voice.save')}
          </button>
        </div>

        {/* Mic button — always visible */}
        {speechSupported && (
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
        )}
      </div>
    </div>
  );
}
