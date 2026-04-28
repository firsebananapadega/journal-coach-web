'use client';

// Month grid for the Upcoming tab. Calendar layout (5–6 rows × 7
// cols, Sunday-first), with a small dot per day that has tasks.
// Tap a day → onSelectDate(yyyymmdd) (caller opens that day's
// tasks). Prev/next chevrons navigate months.

import { motion } from 'framer-motion';
import { useState } from 'react';
import type { Task } from '@/stores/taskStore';
import { toLocalDateStr } from '@/lib/dateUtils';
import { getLanguage } from '@/lib/language';
import { prefersReducedMotion } from '@/lib/motionVariants';

interface Props {
  tasks: Task[];
  onSelectDate: (yyyymmdd: string) => void;
  selectedDate?: string | null;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function buildGrid(monthStart: Date): Date[] {
  // Always render 6 weeks (42 cells) so layout doesn't jump month-to-month.
  const firstDow = monthStart.getDay(); // 0 = Sun
  const start = new Date(monthStart);
  start.setDate(monthStart.getDate() - firstDow);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

const DOW_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function CalendarMonthGrid({ tasks, onSelectDate, selectedDate }: Props) {
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));
  const cells = buildGrid(monthStart);
  const todayStr = toLocalDateStr(new Date());

  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (!task.due_date) continue;
    counts.set(task.due_date, (counts.get(task.due_date) ?? 0) + 1);
  }

  const monthLabel = monthStart.toLocaleDateString(getLanguage(), {
    month: 'long',
    year: 'numeric',
  });

  const stepMonth = (delta: number) => {
    const next = new Date(monthStart);
    next.setMonth(monthStart.getMonth() + delta);
    setMonthStart(startOfMonth(next));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => stepMonth(-1)}
          className="p-2 -m-2 text-text-tertiary hover:text-text-primary transition-colors"
          aria-label="Previous month"
        >
          ‹
        </button>
        <p className="text-base font-bold text-text-primary capitalize">
          {monthLabel}
        </p>
        <button
          onClick={() => stepMonth(1)}
          className="p-2 -m-2 text-text-tertiary hover:text-text-primary transition-colors"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-[10px] text-text-tertiary text-center font-semibold">
        {DOW_INITIALS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const ds = toLocalDateStr(d);
          const inMonth = d.getMonth() === monthStart.getMonth();
          const isToday = ds === todayStr;
          const isSelected = ds === selectedDate;
          const count = counts.get(ds) ?? 0;
          return (
            <motion.button
              key={ds}
              onClick={() => onSelectDate(ds)}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.92 }}
              className={`relative aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs transition-colors ${
                isSelected
                  ? 'bg-primary text-white'
                  : isToday
                    ? 'bg-primary/10 text-primary font-bold'
                    : inMonth
                      ? 'text-text-primary hover:bg-surface'
                      : 'text-text-tertiary/50 hover:bg-surface'
              }`}
            >
              <span>{d.getDate()}</span>
              {count > 0 && (
                <span
                  className={`w-1 h-1 rounded-full ${
                    isSelected ? 'bg-white' : 'bg-primary'
                  }`}
                  aria-hidden
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
