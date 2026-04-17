'use client';

import { useState, useEffect } from 'react';
import { ScrollWheelPicker } from './ScrollWheelPicker';
import { t } from '@/lib/translations';
import type { PlanEvent, PlanSubtask } from '@/stores/planStore';

interface PlanEditSheetProps {
  plan: PlanEvent;
  onSave: (updates: Partial<PlanEvent>) => void;
  onClose: () => void;
}

// ── Time helpers ──

const HOURS = ['—', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const MINUTES = ['00', '15', '30', '45'];
const AMPM = ['AM', 'PM'];

type NamedTime = 'morning' | 'afternoon' | 'evening' | null;

function parseTime(time: string | null): {
  namedTime: NamedTime;
  hourIndex: number;
  minuteIndex: number;
  ampmIndex: number;
} {
  if (!time) return { namedTime: null, hourIndex: 0, minuteIndex: 0, ampmIndex: 0 };

  const lower = time.toLowerCase();
  if (lower === 'morning') return { namedTime: 'morning', hourIndex: 0, minuteIndex: 0, ampmIndex: 0 };
  if (lower === 'afternoon') return { namedTime: 'afternoon', hourIndex: 0, minuteIndex: 0, ampmIndex: 1 };
  if (lower === 'evening') return { namedTime: 'evening', hourIndex: 0, minuteIndex: 0, ampmIndex: 1 };

  if (/^\d{1,2}:\d{2}$/.test(time)) {
    const [h24, m] = time.split(':').map(Number);
    const isPM = h24 >= 12;
    const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
    const hourIndex = HOURS.indexOf(String(h12));
    const minuteIndex = MINUTES.indexOf(m.toString().padStart(2, '0'));
    return {
      namedTime: null,
      hourIndex: hourIndex >= 0 ? hourIndex : 0,
      minuteIndex: minuteIndex >= 0 ? minuteIndex : 0,
      ampmIndex: isPM ? 1 : 0,
    };
  }

  return { namedTime: null, hourIndex: 0, minuteIndex: 0, ampmIndex: 0 };
}

function buildTimeString(
  namedTime: NamedTime,
  hourIndex: number,
  minuteIndex: number,
  ampmIndex: number,
): string | null {
  if (namedTime) return namedTime;
  if (hourIndex === 0) return null; // "—" selected = no time

  const h12 = parseInt(HOURS[hourIndex]);
  const minutes = MINUTES[minuteIndex];
  const isPM = ampmIndex === 1;

  let h24: number;
  if (h12 === 12) {
    h24 = isPM ? 12 : 0;
  } else {
    h24 = isPM ? h12 + 12 : h12;
  }

  return `${h24.toString().padStart(2, '0')}:${minutes}`;
}

// ── Component ──

export function PlanEditSheet({ plan, onSave, onClose }: PlanEditSheetProps) {
  const parsed = parseTime(plan.time);

  const [title, setTitle] = useState(plan.title);
  const [location, setLocation] = useState(plan.location || '');
  const [subtasks, setSubtasks] = useState<PlanSubtask[]>(
    plan.subtasks.map((st) => ({ ...st })),
  );
  const [namedTime, setNamedTime] = useState<NamedTime>(parsed.namedTime);
  const [hourIndex, setHourIndex] = useState(parsed.hourIndex);
  const [minuteIndex, setMinuteIndex] = useState(parsed.minuteIndex);
  const [ampmIndex, setAmpmIndex] = useState(parsed.ampmIndex);
  const [showWheels, setShowWheels] = useState(!parsed.namedTime && parsed.hourIndex > 0);

  // Prevent body scroll when sheet is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleNamedTime = (nt: NamedTime) => {
    if (namedTime === nt && nt !== null) {
      // Deselect
      setNamedTime(null);
      setShowWheels(false);
    } else {
      setNamedTime(nt);
      setShowWheels(false);
      setHourIndex(0);
    }
  };

  const handleWheelChange = (setter: (v: number) => void) => (index: number) => {
    setter(index);
    setNamedTime(null); // Deselect named time when using wheels
    if (!showWheels) setShowWheels(true);
  };

  const handleSubtaskChange = (id: string, text: string) => {
    setSubtasks((prev) => prev.map((st) => (st.id === id ? { ...st, text } : st)));
  };

  const handleRemoveSubtask = (id: string) => {
    setSubtasks((prev) => prev.filter((st) => st.id !== id));
  };

  const handleAddSubtask = () => {
    setSubtasks((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: '', completed: false },
    ]);
  };

  const handleSave = () => {
    const time = buildTimeString(namedTime, hourIndex, minuteIndex, ampmIndex);
    onSave({
      title: title.trim() || plan.title,
      time,
      location: location.trim() || null,
      subtasks: subtasks.filter((st) => st.text.trim()),
    });
  };

  const namedOptions: { key: NamedTime; label: string; icon: string }[] = [
    { key: 'morning', label: t('common.morning'), icon: '🌅' },
    { key: 'afternoon', label: t('common.afternoon'), icon: '☀️' },
    { key: 'evening', label: t('common.evening'), icon: '🌙' },
    { key: null, label: t('plans.noTimeSet'), icon: '—' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 animate-fade-in"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative w-full max-w-lg bg-surface rounded-t-3xl animate-sheet-up max-h-[85vh] flex flex-col">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-text-tertiary/40" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="text-lg font-bold text-text-primary">{t('plans.editPlan')}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-elevated text-text-secondary"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-5">
          {/* Time section */}
          <div>
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              {t('plans.time')}
            </label>

            {/* Named time pills */}
            <div className="flex gap-2 mt-2">
              {namedOptions.map((opt) => (
                <button
                  key={opt.key ?? 'none'}
                  onClick={() => handleNamedTime(opt.key)}
                  className={`flex-1 py-2 px-1 rounded-xl text-xs font-semibold text-center transition-colors ${
                    namedTime === opt.key && (opt.key !== null || (!namedTime && !showWheels && hourIndex === 0))
                      ? 'bg-primary/20 text-primary ring-1 ring-primary/30'
                      : 'bg-surface-elevated text-text-secondary'
                  }`}
                >
                  <span className="block text-base">{opt.icon}</span>
                  <span className="block mt-0.5 leading-tight">{opt.label}</span>
                </button>
              ))}
            </div>

            {/* Custom time toggle */}
            <button
              onClick={() => {
                setShowWheels(!showWheels);
                if (!showWheels) {
                  setNamedTime(null);
                  if (hourIndex === 0) setHourIndex(9); // Default to 9
                }
              }}
              className="mt-3 text-xs font-semibold text-primary"
            >
              {showWheels ? 'Hide custom time' : 'Set specific time'}
            </button>

            {/* Scroll wheel pickers */}
            {showWheels && (
              <div className="flex gap-2 mt-3 bg-surface-elevated rounded-2xl p-3">
                <div className="flex-1">
                  <p className="text-[10px] text-text-tertiary text-center mb-1 uppercase">Hour</p>
                  <ScrollWheelPicker
                    items={HOURS}
                    selectedIndex={hourIndex}
                    onChange={handleWheelChange(setHourIndex)}
                    visibleItems={5}
                  />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] text-text-tertiary text-center mb-1 uppercase">Min</p>
                  <ScrollWheelPicker
                    items={MINUTES}
                    selectedIndex={minuteIndex}
                    onChange={handleWheelChange(setMinuteIndex)}
                    visibleItems={5}
                  />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] text-text-tertiary text-center mb-1 uppercase">AM/PM</p>
                  <ScrollWheelPicker
                    items={AMPM}
                    selectedIndex={ampmIndex}
                    onChange={handleWheelChange(setAmpmIndex)}
                    visibleItems={3}
                    itemHeight={44}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              {t('plans.titleLabel')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5 w-full px-4 py-3 bg-surface-elevated rounded-xl text-text-primary text-sm outline-none ring-1 ring-border focus:ring-primary transition-colors"
            />
          </div>

          {/* Location */}
          <div>
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              {t('plans.locationLabel')}
            </label>
            <div className="relative mt-1.5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs">📍</span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Add location..."
                className="w-full pl-8 pr-4 py-3 bg-surface-elevated rounded-xl text-text-primary text-sm outline-none ring-1 ring-border focus:ring-primary transition-colors placeholder:text-text-tertiary"
              />
            </div>
          </div>

          {/* Subtasks */}
          <div>
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              {t('plans.subtasks')}
            </label>
            <div className="mt-1.5 space-y-2">
              {subtasks.map((st) => (
                <div key={st.id} className="flex gap-2 items-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-text-tertiary flex-shrink-0" />
                  <input
                    type="text"
                    value={st.text}
                    onChange={(e) => handleSubtaskChange(st.id, e.target.value)}
                    placeholder={t('plans.subtaskPlaceholder')}
                    className="flex-1 px-3 py-2 bg-surface-elevated rounded-lg text-text-primary text-sm outline-none ring-1 ring-border focus:ring-primary transition-colors placeholder:text-text-tertiary"
                  />
                  <button
                    onClick={() => handleRemoveSubtask(st.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-text-tertiary hover:text-error hover:bg-error/10 transition-colors flex-shrink-0"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}

              <button
                onClick={handleAddSubtask}
                className="flex items-center gap-2 text-sm text-primary font-medium py-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {t('plans.addSubtask')}
              </button>
            </div>
          </div>
        </div>

        {/* Save button — fixed at bottom */}
        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 border-t border-border">
          <button
            onClick={handleSave}
            className="w-full py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors text-sm"
          >
            {t('plans.saveChanges')}
          </button>
        </div>
      </div>
    </div>
  );
}
