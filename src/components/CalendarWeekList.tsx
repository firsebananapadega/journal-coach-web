'use client';

// Week view for the Upcoming tab. Vertical list of the next 7 days
// starting from today. Each day is a card showing its tasks (if any).
// Tapping a task opens it; tapping the date header opens the
// add-task sheet pre-filled with that date.

import type { Task } from '@/stores/taskStore';
import { TaskCard } from '@/components/TaskCard';
import { toLocalDateStr } from '@/lib/dateUtils';
import { getLanguage } from '@/lib/language';

interface Props {
  tasks: Task[];
  onToggle: (id: string) => void;
  /** Tap on the body of a task row. Pages typically wire this to
   *  the same toggle handler so tapping the text marks done/undone. */
  onTap: (task: Task) => void;
  /** Pencil-icon trailing button. Opens the caller's edit sheet. */
  onEdit: (task: Task) => void;
  onAddForDate: (yyyymmdd: string) => void;
}

// Build the next N days STARTING FROM TOMORROW. The Upcoming tab is
// explicitly a forward-looking view — today's agenda lives on the
// Today tab, which pulls from both priorityStore.items AND
// taskStore.tasks where due_date === today. Including today here too
// would duplicate the same row across both tabs.
function buildNextDays(n: number): Date[] {
  const today = new Date();
  const out: Date[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push(d);
  }
  return out;
}

function dayLabel(d: Date, todayStr: string): string {
  const ds = toLocalDateStr(d);
  if (ds === todayStr) return 'Today';
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (ds === toLocalDateStr(tomorrow)) return 'Tomorrow';
  return d.toLocaleDateString(getLanguage(), {
    weekday: 'long',
  });
}

function dateNum(d: Date): string {
  return d.toLocaleDateString(getLanguage(), {
    month: 'short',
    day: 'numeric',
  });
}

export function CalendarWeekList({
  tasks,
  onToggle,
  onTap,
  onEdit,
  onAddForDate,
}: Props) {
  const days = buildNextDays(7);
  const today = new Date();
  const todayStr = toLocalDateStr(today);

  const byDate = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.due_date) continue;
    const list = byDate.get(task.due_date) ?? [];
    list.push(task);
    byDate.set(task.due_date, list);
  }

  return (
    <div className="space-y-3">
      {days.map((d) => {
        const ds = toLocalDateStr(d);
        const dayTasks = byDate.get(ds) ?? [];
        const isToday = ds === todayStr;
        return (
          <div
            key={ds}
            className={`rounded-2xl border p-3 space-y-2 ${
              isToday
                ? 'border-primary/40 bg-primary/5'
                : 'border-border bg-surface'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <p className={`text-sm font-bold ${isToday ? 'text-primary' : 'text-text-primary'}`}>
                  {dayLabel(d, todayStr)}
                </p>
                <p className="text-[11px] text-text-tertiary">{dateNum(d)}</p>
              </div>
              <button
                onClick={() => onAddForDate(ds)}
                className="text-xs text-primary font-medium px-2 py-1 -mr-1"
              >
                + Add
              </button>
            </div>

            {dayTasks.length === 0 ? (
              <p className="text-xs text-text-tertiary italic px-1">
                Nothing scheduled
              </p>
            ) : (
              <div className="space-y-1">
                {dayTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggle={() => onToggle(task.id)}
                    onTap={() => onTap(task)}
                    onEdit={() => onEdit(task)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
