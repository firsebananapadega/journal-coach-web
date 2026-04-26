'use client';

// Shared reminder chip used on TaskCards, inside TaskEditSheet, and
// in CapturePreviewSheet. Renders a small pill with a bell + a
// human-readable time ("Today 5:30 PM" / "Tomorrow 10:00 AM") when
// remind_at is set, or a muted "+ Reminder" add-button when null.
//
// Tap opens a popover with a native <input type="datetime-local">
// picker. Done confirms; Clear removes the reminder.
//
// `onChange` receives a UTC ISO string (or null when cleared). The
// caller is responsible for persisting — and for nulling remind_sent_at
// so pg_cron re-fires at the new time.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  value: string | null | undefined; // UTC ISO
  onChange: (next: string | null) => void;
  // Optional: render with muted "fired" styling when remind_sent_at
  // is set and remind_at is in the past. Caller supplies the flag.
  alreadyFired?: boolean;
  emptyLabel?: string; // defaults to "+ Reminder"
}

export default function TaskReminderChip({
  value,
  onChange,
  alreadyFired = false,
  emptyLabel = '+ Reminder',
}: Props) {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hasValue = !!value;

  // Re-measure the trigger position whenever the popover opens or
  // the viewport scrolls/resizes. The popover is portaled to <body>
  // (so it can render above any clipping ancestor like
  // SwipeToDelete's overflow-hidden container) — which means we
  // need explicit absolute coordinates instead of relying on a
  // CSS-positioned `top-full` child.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (triggerRef.current) {
        setAnchorRect(triggerRef.current.getBoundingClientRect());
      }
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  const isoToLocal = (iso: string): string => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const localToIso = (local: string): string | null => {
    if (!local) return null;
    const d = new Date(local);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  const label = hasValue ? formatLabel(value!) : emptyLabel;

  const chipClass = hasValue
    ? alreadyFired
      ? 'bg-surface-elevated text-text-tertiary'
      : 'bg-warning/15 text-warning'
    : 'bg-surface-elevated text-text-tertiary';

  // Compute the popover position from the trigger's screen rect.
  // Anchored below the trigger by default; flips above when there
  // isn't room below. Uses fixed positioning (the popover is
  // portaled to <body>) so it doesn't inherit the parent's
  // overflow-hidden / transform clipping.
  const popover = (() => {
    if (!open || !anchorRect || typeof document === 'undefined') return null;
    const POPOVER_HEIGHT_ESTIMATE = 160;
    const POPOVER_WIDTH = 240;
    const margin = 8;
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const placeBelow = anchorRect.bottom + POPOVER_HEIGHT_ESTIMATE + margin <= viewportH;
    const top = placeBelow
      ? anchorRect.bottom + margin
      : Math.max(margin, anchorRect.top - POPOVER_HEIGHT_ESTIMATE - margin);
    let left = anchorRect.left;
    if (left + POPOVER_WIDTH + margin > viewportW) {
      left = Math.max(margin, viewportW - POPOVER_WIDTH - margin);
    }
    return createPortal(
      <>
        <div
          className="fixed inset-0 z-[80]"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        />
        <div
          className="fixed z-[81] bg-surface-elevated border border-border rounded-lg shadow-warm-xl p-3 flex flex-col gap-2"
          style={{ top, left, width: POPOVER_WIDTH }}
          onClick={(e) => e.stopPropagation()}
        >
          <label className="text-[10px] uppercase tracking-widest text-text-tertiary px-1">
            Remind me at
          </label>
          <input
            type="datetime-local"
            autoFocus
            value={hasValue ? isoToLocal(value!) : ''}
            onChange={(e) => {
              const nextIso = localToIso(e.target.value);
              onChange(nextIso);
            }}
            className="text-sm px-2 py-2 bg-bg border border-border rounded text-text-primary outline-none"
          />
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              className="text-xs font-semibold text-primary px-2 py-1"
            >
              Done
            </button>
            {hasValue && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                  setOpen(false);
                }}
                className="text-xs text-text-tertiary hover:text-error px-2 py-1"
              >
                Clear reminder
              </button>
            )}
          </div>
        </div>
      </>,
      document.body,
    );
  })();

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full hover:opacity-80 inline-flex items-center gap-1 ${chipClass}`}
        aria-label="Reminder time"
      >
        <span aria-hidden>🔔</span>
        <span>{label}</span>
      </button>
      {popover}
    </div>
  );
}

// Humanize a UTC ISO into "Today 5:03 PM" / "Tomorrow 10:00 AM" /
// "Wed 3:15 PM" for the chip label.
function formatLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Reminder';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Tomorrow ${time}`;
  if (diffDays === -1) return `Yesterday ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
}
