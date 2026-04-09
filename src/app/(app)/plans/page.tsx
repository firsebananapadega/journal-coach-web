'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { usePlanStore, type PlanEvent, type PlanSubtask } from '@/stores/planStore';
import { usePriorityStore, type PriorityItem } from '@/stores/priorityStore';
import { toLocalDateStr } from '@/lib/dateUtils';
import {
  isSpeechRecognitionSupported,
  startListening,
  stopListening,
} from '@/lib/speechRecognition';
import { getLanguage } from '@/lib/language';
import { classifyCapture, resolveWhen, type PlanEventParsed } from '@/lib/captureEngine';
import { supabase } from '@/lib/supabase';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import { t } from '@/lib/translations';

function buildWeekDates(): Date[] {
  const today = new Date();
  const dates: Date[] = [];
  for (let offset = -3; offset <= 3; offset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    dates.push(d);
  }
  return dates;
}

function formatDateBubble(date: Date, todayStr: string): { label: string; dateNum: number } {
  const dateStr = toLocalDateStr(date);
  const dateNum = date.getDate();
  if (dateStr === todayStr) {
    return { label: t('plans.today'), dateNum };
  }
  const dayName = date.toLocaleDateString(getLanguage(), { weekday: 'short' });
  return { label: dayName, dateNum };
}

function formatTime(time: string | null): string {
  if (!time) return t('plans.noTime');
  // Handle named times
  const named: Record<string, string> = {
    morning: '🌅 ' + t('common.morning'),
    afternoon: '☀️ ' + t('common.afternoon'),
    evening: '🌙 ' + t('common.evening'),
  };
  if (named[time.toLowerCase()]) return named[time.toLowerCase()];
  // Handle HH:MM format
  if (/^\d{1,2}:\d{2}$/.test(time)) {
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `🕐 ${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  }
  return `🕐 ${time}`;
}

export default function PlansPage() {
  const router = useRouter();
  const todayDateStr = useMemo(() => toLocalDateStr(new Date()), []);
  const weekDates = useMemo(() => buildWeekDates(), []);
  const [selectedDate, setSelectedDate] = useState(todayDateStr);

  const { plans, fetchPlans, savePlans, togglePlan, toggleSubtask, removePlan, loading } = usePlanStore();
  const [newItem, setNewItem] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [speechSupported] = useState(() => typeof window !== 'undefined' && isSpeechRecognitionSupported());

  const liveText = useRef('');
  const accumulatedTextRef = useRef('');
  const plansRef = useRef(plans);
  plansRef.current = plans;

  useEffect(() => {
    fetchPlans(selectedDate);
  }, [fetchPlans, selectedDate]);

  const handleAddItem = () => {
    if (!newItem.trim()) return;
    const text = newItem.trim();
    setNewItem('');
    accumulatedTextRef.current = '';
    liveText.current = '';
    setError('');
    setProcessing(true);
    handleAddPlans(text);
  };

  const toggleMic = async () => {
    if (isListening) {
      stopListening();
      setIsListening(false);
      accumulatedTextRef.current = newItem;
    } else {
      accumulatedTextRef.current = newItem;
      setIsListening(true);
      startListening({
        continuous: true,
        language: getLanguage(),
        onResult: (text) => {
          const prefix = accumulatedTextRef.current;
          const combined = prefix ? prefix + ' ' + text : text;
          liveText.current = combined;
          setNewItem(combined);
        },
        onEnd: () => {
          setIsListening(false);
          if (liveText.current.trim()) {
            accumulatedTextRef.current = liveText.current.trim();
            setNewItem(liveText.current.trim());
          }
        },
        onError: (err) => {
          setIsListening(false);
          setError(`Mic error: ${err}`);
        },
      });
    }
  };

  const handleAddPlans = async (inputText?: string) => {
    const text = (inputText || newItem).trim();
    if (!text) {
      setProcessing(false);
      return;
    }

    if (isListening) {
      stopListening();
      setIsListening(false);
    }

    setProcessing(true);
    setError('');

    const currentPlans = plansRef.current;

    try {
      const result = await classifyCapture(text);

      // Process plans
      if (result.plans && result.plans.length > 0) {
        const plansByDate = new Map<string, PlanEventParsed[]>();
        for (const plan of result.plans) {
          const resolvedDate = resolveWhen(plan.when, selectedDate);
          if (!plansByDate.has(resolvedDate)) plansByDate.set(resolvedDate, []);
          plansByDate.get(resolvedDate)!.push(plan);
        }

        for (const [dateStr, datePlans] of plansByDate) {
          let existingPlans: PlanEvent[] = [];

          if (dateStr === selectedDate) {
            existingPlans = currentPlans;
          } else {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const { data } = await supabase
                .from('daily_priorities')
                .select('plans')
                .eq('user_id', user.id)
                .eq('date', dateStr)
                .maybeSingle();
              existingPlans = (data?.plans as PlanEvent[]) ?? [];
            }
          }

          const newPlans: PlanEvent[] = datePlans.map((p, i) => ({
            id: crypto.randomUUID(),
            title: p.title,
            time: p.time,
            location: p.location,
            subtasks: p.subtasks.map((st) => ({
              id: crypto.randomUUID(),
              text: st,
              completed: false,
            })),
            completed: false,
            sort_order: existingPlans.length + i,
          }));

          const merged = [...existingPlans, ...newPlans];
          await savePlans(dateStr, merged);
        }
      }

      // If no plans detected, save as a single plan for selected date
      if ((!result.plans || result.plans.length === 0) && result.priorities.length === 0) {
        const fallbackPlan: PlanEvent = {
          id: crypto.randomUUID(),
          title: text,
          time: null,
          location: null,
          subtasks: [],
          completed: false,
          sort_order: currentPlans.length,
        };
        await savePlans(selectedDate, [...currentPlans, fallbackPlan]);
      }

      // Cross-route priorities to priority store
      if (result.priorities.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          for (const task of result.priorities) {
            const resolvedDate = resolveWhen(task.when, selectedDate);
            const { data } = await supabase
              .from('daily_priorities')
              .select('items')
              .eq('user_id', user.id)
              .eq('date', resolvedDate)
              .maybeSingle();
            const existingItems = (data?.items as PriorityItem[]) ?? [];
            const newItem: PriorityItem = {
              id: crypto.randomUUID(),
              text: task.text,
              completed: false,
              sort_order: existingItems.length,
            };
            await usePriorityStore.getState().savePriorities(resolvedDate, [...existingItems, newItem]);
          }
        }
      }

      // Re-fetch current date
      await fetchPlans(selectedDate);

      setNewItem('');
      liveText.current = '';
      accumulatedTextRef.current = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);

      // Fallback: save raw text as a plan
      try {
        const fallbackPlan: PlanEvent = {
          id: crypto.randomUUID(),
          title: text,
          time: null,
          location: null,
          subtasks: [],
          completed: false,
          sort_order: currentPlans.length,
        };
        await savePlans(selectedDate, [...currentPlans, fallbackPlan]);
        setNewItem('');
        liveText.current = '';
        accumulatedTextRef.current = '';
      } catch {}
    }

    setProcessing(false);
  };

  // Sort plans by time
  const sortedPlans = useMemo(() => {
    return [...plans].sort((a, b) => {
      const timeOrder = (time: string | null): number => {
        if (!time) return 999;
        if (time === 'morning') return 1;
        if (time === 'afternoon') return 2;
        if (time === 'evening') return 3;
        if (/^\d{1,2}:\d{2}$/.test(time)) {
          const [h, m] = time.split(':').map(Number);
          return h * 60 + m;
        }
        return 500;
      };
      return timeOrder(a.time) - timeOrder(b.time);
    });
  }, [plans]);

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('plans.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">
            {new Date().toLocaleDateString(getLanguage(), { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Date picker strip */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {weekDates.map((date) => {
          const dateStr = toLocalDateStr(date);
          const { label, dateNum } = formatDateBubble(date, todayDateStr);
          const isSelected = dateStr === selectedDate;
          return (
            <button
              key={dateStr}
              onClick={() => setSelectedDate(dateStr)}
              className={`flex flex-col items-center min-w-[52px] py-2 px-2 rounded-xl text-xs font-medium transition-colors ${
                isSelected
                  ? 'bg-primary text-white'
                  : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              <span className="text-[10px] uppercase">{label}</span>
              <span className="text-lg font-bold">{dateNum}</span>
            </button>
          );
        })}
      </div>

      {/* Add plan — input + mic */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <textarea
            value={newItem}
            onChange={(e) => { if (!isListening) setNewItem(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (newItem.trim()) handleAddItem();
              }
            }}
            placeholder={isListening ? t('guided.listeningPlaceholder') : t('plans.placeholder')}
            readOnly={isListening}
            rows={isListening && newItem.length > 40 ? Math.min(6, Math.ceil(newItem.length / 35)) : 1}
            className={`flex-1 px-4 py-3 bg-surface border rounded-xl text-text-primary outline-none text-sm resize-none transition-all ${
              isListening ? 'border-error min-h-[44px]' : 'border-border focus:border-primary'
            }`}
            style={{ height: isListening && newItem.length > 40 ? 'auto' : '44px' }}
          />
          {speechSupported && (
            <button
              onClick={toggleMic}
              disabled={processing}
              className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors self-end ${
                isListening ? 'bg-error' : 'bg-surface border border-border hover:border-primary'
              } ${processing ? 'opacity-40' : ''}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isListening ? 'white' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              </svg>
            </button>
          )}
        </div>

        {newItem.trim() && !isListening && (
          <button
            onClick={handleAddItem}
            disabled={processing}
            className="w-full py-2.5 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50 text-sm"
          >
            {processing ? t('plans.processing') : t('plans.addPlans')}
          </button>
        )}

        {error && (
          <div className="bg-error/10 border border-error/30 rounded-xl p-3">
            <p className="text-sm text-error">{error}</p>
          </div>
        )}
      </div>

      {/* Plans list */}
      {sortedPlans.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('plans.plans')}</h2>
          {sortedPlans.map((plan) => (
            <SwipeToDelete key={plan.id} onDelete={() => removePlan(plan.id)}>
              <div className={`bg-surface rounded-xl border border-border p-4 space-y-2 ${plan.completed ? 'opacity-50' : ''}`}>
                {/* Plan header: time + title + checkbox */}
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => togglePlan(plan.id)}
                    className="p-1 -m-1 flex-shrink-0 mt-0.5"
                  >
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      plan.completed ? 'bg-success border-success' : 'border-border hover:border-primary'
                    }`}>
                      {plan.completed && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-base font-semibold ${plan.completed ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
                      {plan.title}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-text-secondary">{formatTime(plan.time)}</span>
                      {plan.location && (
                        <span className="text-xs text-text-tertiary">📍 {plan.location}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Subtasks */}
                {plan.subtasks.length > 0 && (
                  <div className="ml-8 space-y-1.5 pt-1 border-t border-border/50">
                    {plan.subtasks.map((st) => (
                      <div key={st.id} className="flex items-center gap-2.5">
                        <button
                          onClick={() => toggleSubtask(plan.id, st.id)}
                          className="p-0.5 flex-shrink-0"
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            st.completed ? 'bg-success border-success' : 'border-border hover:border-primary'
                          }`}>
                            {st.completed && <span className="text-white text-[10px] font-bold">✓</span>}
                          </div>
                        </button>
                        <span className={`text-sm ${st.completed ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
                          {st.text}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SwipeToDelete>
          ))}
        </div>
      )}

      {/* Empty state */}
      {plans.length === 0 && !loading && !processing && (
        <div className="text-center py-12 space-y-2">
          <p className="text-4xl">📅</p>
          <p className="text-text-secondary text-sm">{t('plans.empty')}</p>
        </div>
      )}
    </div>
  );
}
