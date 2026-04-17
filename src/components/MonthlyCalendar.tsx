'use client';

import { useState, useMemo } from 'react';
import { toLocalDateStr } from '@/lib/dateUtils';
import { getLanguage } from '@/lib/language';

interface MonthlyCalendarProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  datesWithPlans: Set<string>;
  todayDateStr: string;
}

function getCalendarGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  const startDayOfWeek = firstDay.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const grid: (Date | null)[][] = [];
  let currentDay = 1;
  let nextMonthDay = 1;

  for (let week = 0; week < 6; week++) {
    const row: (Date | null)[] = [];
    for (let col = 0; col < 7; col++) {
      const cellIndex = week * 7 + col;
      if (cellIndex < startDayOfWeek) {
        // Previous month
        const prevDate = new Date(year, month, -(startDayOfWeek - col - 1));
        row.push(prevDate);
      } else if (currentDay <= daysInMonth) {
        row.push(new Date(year, month, currentDay));
        currentDay++;
      } else {
        // Next month
        row.push(new Date(year, month + 1, nextMonthDay));
        nextMonthDay++;
      }
    }
    grid.push(row);
    // Stop if all days are placed and we've completed at least 4 rows
    if (currentDay > daysInMonth && week >= 3) break;
  }
  return grid;
}

export function MonthlyCalendar({
  selectedDate,
  onSelectDate,
  datesWithPlans,
  todayDateStr,
}: MonthlyCalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    return d.getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    return d.getMonth();
  });

  const lang = getLanguage();

  // Navigation limits: 2 months back, 3 months forward from today
  const minDate = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  const maxDate = new Date(today.getFullYear(), today.getMonth() + 3, 1);
  const canGoBack = new Date(viewYear, viewMonth - 1, 1) >= minDate;
  const canGoForward = new Date(viewYear, viewMonth + 1, 1) <= maxDate;

  const goBack = () => {
    if (!canGoBack) return;
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goForward = () => {
    if (!canGoForward) return;
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const grid = useMemo(() => getCalendarGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  // Weekday headers
  const weekdays = useMemo(() => {
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      // Jan 4 2026 is a Sunday
      const d = new Date(2026, 0, 4 + i);
      days.push(d.toLocaleDateString(lang, { weekday: 'narrow' }));
    }
    return days;
  }, [lang]);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(lang, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-3">
      {/* Month header with arrows */}
      <div className="flex items-center justify-between">
        <button
          onClick={goBack}
          disabled={!canGoBack}
          className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors ${
            canGoBack ? 'text-text-primary hover:bg-surface-elevated' : 'text-text-tertiary/30'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-base font-semibold text-text-primary capitalize">{monthLabel}</span>
        <button
          onClick={goForward}
          disabled={!canGoForward}
          className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors ${
            canGoForward ? 'text-text-primary hover:bg-surface-elevated' : 'text-text-tertiary/30'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0">
        {weekdays.map((day, i) => (
          <div key={i} className="text-center text-[10px] uppercase font-semibold text-text-tertiary py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Date grid */}
      <div className="space-y-0.5">
        {grid.map((row, rowIdx) => (
          <div key={rowIdx} className="grid grid-cols-7 gap-0">
            {row.map((date, colIdx) => {
              if (!date) return <div key={colIdx} />;

              const dateStr = toLocalDateStr(date);
              const isCurrentMonth = date.getMonth() === viewMonth;
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === todayDateStr;
              const hasPlans = datesWithPlans.has(dateStr);

              return (
                <button
                  key={colIdx}
                  onClick={() => onSelectDate(dateStr)}
                  className={`flex flex-col items-center justify-center py-1.5 mx-auto rounded-xl transition-all ${
                    isCurrentMonth ? '' : 'opacity-25'
                  }`}
                  style={{ minHeight: 44 }}
                >
                  <span
                    className={`w-9 h-9 flex items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                      isSelected
                        ? 'bg-text-primary text-bg'
                        : isToday
                          ? 'ring-1.5 ring-primary text-primary'
                          : 'text-text-secondary'
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  {/* Plan indicator dot */}
                  <div
                    className={`w-1 h-1 rounded-full mt-0.5 transition-colors ${
                      hasPlans ? 'bg-primary' : 'bg-transparent'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
