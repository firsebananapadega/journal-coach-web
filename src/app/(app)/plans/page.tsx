'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
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
import { MonthlyCalendar } from '@/components/MonthlyCalendar';
import { t } from '@/lib/translations';

// ── Helpers ──

function getLocalPlansForDate(date: string): PlanEvent[] {
  try {
    const raw = localStorage.getItem('plans_' + date);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

// ── Date helpers ──

function buildWeekDates(): Date[] {
  const today = new Date();
  const dates: Date[] = [];
  for (let offset = -3; offset <= 10; offset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    dates.push(d);
  }
  return dates;
}

function formatTime(time: string | null): string {
  if (!time) return '';
  const named: Record<string, string> = {
    morning: t('common.morning'),
    afternoon: t('common.afternoon'),
    evening: t('common.evening'),
  };
  if (named[time.toLowerCase()]) return named[time.toLowerCase()];
  if (/^\d{1,2}:\d{2}$/.test(time)) {
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  }
  return time;
}

function getTimeIcon(time: string | null): string {
  if (!time) return '📌';
  const lower = time.toLowerCase();
  if (lower === 'morning') return '🌅';
  if (lower === 'afternoon') return '☀️';
  if (lower === 'evening') return '🌙';
  if (/^\d{1,2}:\d{2}$/.test(time)) {
    const h = parseInt(time.split(':')[0]);
    if (h < 12) return '🌅';
    if (h < 17) return '☀️';
    return '🌙';
  }
  return '🕐';
}

// ── Main page ──

export default function PlansPage() {
  const todayDateStr = useMemo(() => toLocalDateStr(new Date()), []);
  const weekDates = useMemo(() => buildWeekDates(), []);
  const [selectedDate, setSelectedDate] = useState(todayDateStr);

  const { plans, fetchPlans, savePlans, togglePlan, toggleSubtask, removePlan, updatePlan, loading } = usePlanStore();
  const [newItem, setNewItem] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [editingPlan, setEditingPlan] = useState<PlanEvent | null>(null);
  const [showMonthly, setShowMonthly] = useState(false);
  const [speechSupported] = useState(() => typeof window !== 'undefined' && isSpeechRecognitionSupported());

  const liveText = useRef('');
  const accumulatedTextRef = useRef('');
  const plansRef = useRef(plans);
  plansRef.current = plans;

  useEffect(() => {
    fetchPlans(selectedDate);
  }, [fetchPlans, selectedDate]);

  // ── Input handlers ──

  const [processingText, setProcessingText] = useState('');

  const handleAddItem = () => {
    if (!newItem.trim()) return;
    const text = newItem.trim();
    setProcessingText(text);
    setNewItem('');
    accumulatedTextRef.current = '';
    liveText.current = '';
    setError('');
    setProcessing(true);

    // Save raw text to journal Plans tab immediately (before AI processing)
    try {
      const existing = JSON.parse(localStorage.getItem('journal_plans') || '[]');
      const entry = { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() };
      localStorage.setItem('journal_plans', JSON.stringify([entry, ...existing]));
    } catch {}

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
    if (!text) { setProcessing(false); return; }
    if (isListening) { stopListening(); setIsListening(false); }
    setProcessing(true);
    setError('');
    const currentPlans = plansRef.current;

    // Helper: save raw text as a plain plan (fallback)
    const saveFallback = async () => {
      const fb: PlanEvent = {
        id: crypto.randomUUID(), title: text, time: null, location: null,
        subtasks: [], completed: false, sort_order: currentPlans.length,
      };
      await savePlans(selectedDate, [...currentPlans, fb]);
    };

    // Hard 15-second timeout — if AI takes too long, save raw text
    const timeoutId = setTimeout(async () => {
      setError('');
      await saveFallback();
      setProcessing(false);
      setProcessingText('');
      setNewItem(''); liveText.current = ''; accumulatedTextRef.current = '';
    }, 15000);

    try {
      const result = await classifyCapture(text);
      clearTimeout(timeoutId);

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
            existingPlans = getLocalPlansForDate(dateStr);
          }
          const newPlans: PlanEvent[] = datePlans.map((p, i) => ({
            id: crypto.randomUUID(),
            title: p.title,
            time: p.time,
            location: p.location,
            subtasks: p.subtasks.map((st) => ({ id: crypto.randomUUID(), text: st, completed: false })),
            completed: false,
            sort_order: existingPlans.length + i,
          }));
          await savePlans(dateStr, [...existingPlans, ...newPlans]);
        }
      }

      // If AI found nothing useful, save raw text as a plan
      if ((!result.plans || result.plans.length === 0) && result.priorities.length === 0) {
        await saveFallback();
      }

      // Cross-route priorities
      if (result.priorities.length > 0) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            for (const task of result.priorities) {
              const resolvedDate = resolveWhen(task.when, selectedDate);
              const { data } = await supabase.from('daily_priorities').select('items').eq('user_id', user.id).eq('date', resolvedDate).maybeSingle();
              const existingItems = (data?.items as PriorityItem[]) ?? [];
              const ni: PriorityItem = { id: crypto.randomUUID(), text: task.text, completed: false, sort_order: existingItems.length };
              await usePriorityStore.getState().savePriorities(resolvedDate, [...existingItems, ni]);
            }
          }
        } catch {} // Cross-routing failure is non-critical
      }

      setNewItem(''); liveText.current = ''; accumulatedTextRef.current = '';
    } catch (err) {
      clearTimeout(timeoutId);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      try { await saveFallback(); } catch {}
      setNewItem(''); liveText.current = ''; accumulatedTextRef.current = '';
    }
    setProcessing(false);
    setProcessingText('');
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

  // Dates with plans for monthly calendar dot indicators
  const datesWithPlans = useMemo(() => {
    if (!showMonthly) return new Set<string>();
    const set = new Set<string>();
    // Scan the visible month in localStorage
    const selDate = new Date(selectedDate + 'T12:00:00');
    const year = selDate.getFullYear();
    const month = selDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = toLocalDateStr(new Date(year, month, d));
      try {
        const raw = localStorage.getItem('plans_' + dateStr);
        if (raw) {
          const p = JSON.parse(raw);
          if (Array.isArray(p) && p.length > 0) set.add(dateStr);
        }
      } catch {}
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMonthly, selectedDate, plans]);

  // Selected date info for display
  const selectedDateObj = new Date(selectedDate + 'T12:00:00');
  const isToday = selectedDate === todayDateStr;

  return (
    <div className="max-w-lg mx-auto px-5 pt-14 pb-24 space-y-5">
      {/* Header — month + year + view toggle */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('plans.title')}</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {selectedDateObj.toLocaleDateString(getLanguage(), {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
            {isToday ? '' : ` · ${selectedDateObj.toLocaleDateString(getLanguage(), { year: 'numeric' })}`}
          </p>
        </div>
        <button
          onClick={() => setShowMonthly(!showMonthly)}
          className="mt-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-surface-elevated text-text-secondary hover:text-text-primary transition-colors"
        >
          {showMonthly ? t('plans.weekView') : t('plans.monthView')}
        </button>
      </div>

      {/* Date picker — weekly strip or monthly calendar */}
      {showMonthly ? (
        <MonthlyCalendar
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          datesWithPlans={datesWithPlans}
          todayDateStr={todayDateStr}
        />
      ) : (
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-hide">
          {weekDates.map((date) => {
            const dateStr = toLocalDateStr(date);
            const dateNum = date.getDate();
            const isSelected = dateStr === selectedDate;
            const isTodayDate = dateStr === todayDateStr;
            const dayName = date.toLocaleDateString(getLanguage(), { weekday: 'short' });

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className="flex flex-col items-center min-w-[46px] py-2 px-1 rounded-2xl transition-all"
              >
                <span className={`text-[10px] uppercase font-medium ${
                  isSelected ? 'text-text-primary' : 'text-text-tertiary'
                }`}>
                  {isTodayDate ? t('plans.today') : dayName}
                </span>
                <span className={`text-lg font-bold mt-0.5 w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
                  isSelected
                    ? 'bg-text-primary text-bg'
                    : 'text-text-secondary'
                }`}>
                  {dateNum}
                </span>
                {/* Dot indicator — shows for today and selected */}
                <div className={`w-1 h-1 rounded-full mt-1 transition-colors ${
                  isSelected ? 'bg-primary' : isTodayDate ? 'bg-text-tertiary' : 'bg-transparent'
                }`} />
              </button>
            );
          })}
        </div>
      )}

      {/* Input — clean rounded white surface */}
      <div className="space-y-2">
        <div className="flex gap-2 items-end">
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
            rows={isListening && newItem.length > 40 ? Math.min(5, Math.ceil(newItem.length / 35)) : 1}
            className={`flex-1 px-4 py-3 bg-surface-elevated rounded-2xl text-text-primary outline-none text-sm resize-none transition-all placeholder:text-text-tertiary ${
              isListening ? 'ring-2 ring-error/50' : 'ring-1 ring-border focus:ring-primary'
            }`}
            style={{ height: isListening && newItem.length > 40 ? 'auto' : '44px' }}
          />
          {speechSupported && (
            <button
              onClick={toggleMic}
              disabled={processing}
              className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all ${
                isListening
                  ? 'bg-error shadow-lg shadow-error/20'
                  : 'bg-surface-elevated ring-1 ring-border hover:ring-primary'
              } ${processing ? 'opacity-40' : ''}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isListening ? 'white' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              </svg>
            </button>
          )}
        </div>

        {newItem.trim() && !isListening && !processing && (
          <button
            onClick={handleAddItem}
            className="w-full py-2.5 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors text-sm"
          >
            {t('plans.addPlans')}
          </button>
        )}

        {/* Processing indicator — shows after input is cleared */}
        {processing && (
          <div className="bg-surface rounded-2xl p-3 flex items-center gap-3">
            <div className="animate-pulse text-primary text-sm">●</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-secondary">{t('plans.processing')}</p>
              <p className="text-sm text-text-primary truncate">{processingText}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-error/10 rounded-2xl p-3">
            <p className="text-sm text-error">{error}</p>
          </div>
        )}
      </div>

      {/* Plans list */}
      {sortedPlans.length > 0 && (
        <div className="space-y-3">
          {sortedPlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isEditing={editingPlan?.id === plan.id}
              onTap={() => setEditingPlan(plan)}
              onSave={(updates) => { updatePlan(plan.id, updates); setEditingPlan(null); }}
              onDiscard={() => setEditingPlan(null)}
              onToggle={() => togglePlan(plan.id)}
              onToggleSubtask={(stId) => toggleSubtask(plan.id, stId)}
              onDelete={() => removePlan(plan.id)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {plans.length === 0 && !loading && !processing && (
        <div className="text-center py-16 space-y-3">
          <p className="text-5xl">📅</p>
          <p className="text-text-secondary text-sm">{t('plans.empty')}</p>
        </div>
      )}
    </div>
  );
}

// ── Inline-editable plan card ──

function PlanCard({
  plan,
  isEditing,
  onTap,
  onSave,
  onDiscard,
  onToggle,
  onToggleSubtask,
  onDelete,
}: {
  plan: PlanEvent;
  isEditing: boolean;
  onTap: () => void;
  onSave: (updates: Partial<PlanEvent>) => void;
  onDiscard: () => void;
  onToggle: () => void;
  onToggleSubtask: (stId: string) => void;
  onDelete: () => void;
}) {
  // Local edit state — only used when isEditing
  const [editTitle, setEditTitle] = useState(plan.title);
  const [editTime, setEditTime] = useState(plan.time);
  const [editSubtasks, setEditSubtasks] = useState<PlanSubtask[]>(plan.subtasks);

  // Reset edit state when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setEditTitle(plan.title);
      setEditTime(plan.time);
      setEditSubtasks(plan.subtasks.map(st => ({ ...st })));
    }
  }, [isEditing, plan]);

  const handleSave = () => {
    onSave({
      title: editTitle.trim() || plan.title,
      time: editTime,
      subtasks: editSubtasks.filter(st => st.text.trim()),
    });
  };

  // Convert 24h time to input value
  const timeInputValue = (() => {
    if (!editTime || !(/^\d{1,2}:\d{2}$/.test(editTime))) return '';
    return editTime.padStart(5, '0'); // "9:00" -> "09:00"
  })();

  const handleTimeInput = (val: string) => {
    if (!val) { setEditTime(null); return; }
    // val comes as "HH:MM" from input[type=time]
    setEditTime(val);
  };

  // ── Read-only card (normal view) ──
  if (!isEditing) {
    return (
      <SwipeToDelete onDelete={onDelete} onTap={onTap}>
        <div className={`bg-surface rounded-2xl p-4 transition-opacity ${plan.completed ? 'opacity-40' : ''}`}>
          <div className="flex items-start gap-3">
            {/* Time badge */}
            <div className="flex flex-col items-center min-w-[42px] pt-0.5">
              <span className="text-lg">{getTimeIcon(plan.time)}</span>
              <span className="text-[10px] text-text-tertiary font-medium mt-0.5 text-center leading-tight">
                {formatTime(plan.time) || t('plans.noTime')}
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className={`text-[15px] font-semibold leading-snug ${
                plan.completed ? 'text-text-tertiary line-through' : 'text-text-primary'
              }`}>
                {plan.title}
              </p>

              {/* Subtasks */}
              {plan.subtasks.length > 0 && (
                <div className="mt-2.5 space-y-0.5">
                  {plan.subtasks.map((st) => (
                    <button
                      key={st.id}
                      data-checkbox
                      onClick={(e) => { e.stopPropagation(); onToggleSubtask(st.id); }}
                      className="flex items-center gap-2 w-full text-left py-1.5 -my-0.5"
                    >
                      <div className={`w-4 h-4 rounded-md border-[1.5px] flex items-center justify-center flex-shrink-0 transition-colors ${
                        st.completed ? 'bg-primary border-primary' : 'border-text-tertiary'
                      }`}>
                        {st.completed && (
                          <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="2,6 5,9 10,3" />
                          </svg>
                        )}
                      </div>
                      <span className={`text-sm ${st.completed ? 'text-text-tertiary line-through' : 'text-text-secondary'}`}>
                        {st.text}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Plan checkbox — large tap target */}
            <button
              data-checkbox
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className="p-3 -m-2 flex-shrink-0"
            >
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                plan.completed ? 'bg-primary border-primary' : 'border-text-tertiary/40 hover:border-primary'
              }`}>
                {plan.completed && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="2,6 5,9 10,3" />
                  </svg>
                )}
              </div>
            </button>
          </div>
        </div>
      </SwipeToDelete>
    );
  }

  // ── Edit mode (same layout, fields become inputs) ──
  return (
    <div className="bg-surface rounded-2xl p-5 ring-1 ring-border">
      {/* Close button */}
      <div className="flex justify-end -mt-1 -mr-1 mb-3">
        <button
          onClick={onDiscard}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-surface-elevated text-text-secondary"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex items-start gap-4">
        {/* Time — editable */}
        <div className="flex flex-col items-center min-w-[62px] pt-0.5">
          <input
            type="time"
            value={timeInputValue}
            onChange={(e) => handleTimeInput(e.target.value)}
            className="w-[62px] text-center text-sm font-semibold text-primary bg-surface-elevated rounded-lg px-1.5 py-2 outline-none"
          />
        </div>

        {/* Content — editable */}
        <div className="flex-1 min-w-0 space-y-3">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full text-[15px] font-semibold text-text-primary bg-transparent outline-none border-b border-border pb-1"
            autoFocus
          />
          {/* Subtasks — editable */}
          <div className="space-y-1.5">
            {editSubtasks.map((st, idx) => (
              <div key={st.id} className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-md border-[1.5px] border-text-tertiary flex-shrink-0" />
                <input
                  type="text"
                  value={st.text}
                  onChange={(e) => {
                    const updated = [...editSubtasks];
                    updated[idx] = { ...st, text: e.target.value };
                    setEditSubtasks(updated);
                  }}
                  placeholder={t('plans.subtaskPlaceholder')}
                  className="flex-1 text-sm text-text-secondary bg-transparent outline-none border-b border-border pb-0.5 placeholder:text-text-tertiary"
                />
                <button
                  onClick={() => setEditSubtasks(editSubtasks.filter((_, i) => i !== idx))}
                  className="text-text-tertiary hover:text-error flex-shrink-0"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              onClick={() => setEditSubtasks([...editSubtasks, { id: crypto.randomUUID(), text: '', completed: false }])}
              className="text-xs text-primary font-medium flex items-center gap-1 pt-1"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t('plans.addSubtask')}
            </button>
          </div>
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        className="mt-4 w-full py-2.5 bg-primary text-white font-semibold rounded-xl text-sm hover:bg-primary-dark transition-colors"
      >
        {t('plans.saveChanges')}
      </button>
    </div>
  );
}
