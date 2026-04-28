-- Mid-day Presence pause reminder dedup column.
-- Mirrors last_morning_pulse_reminder_at / last_evening_pulse_reminder_at.
-- Used by /api/cron/send-pulse-reminders to ensure at most one
-- presence push per pulse-day per user.

alter table public.profiles
  add column if not exists last_presence_pulse_reminder_at timestamptz;
