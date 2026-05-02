-- WOOP Plans v1.1 — daily reminders per plan item.
--
-- A plan item like "If it's 9:45 PM, then I'll put my phone in the
-- kitchen" is only useful if the user is actually pinged at 9:45. We
-- piggyback on the existing send-pulse-reminders cron (already runs
-- every 5 min and walks every active user) instead of adding a new
-- pg_cron job. The cron checks plan_items.reminder_time against the
-- user's local clock and fires a push when they match.

-- ──────────────────────────────────────────────────────────────────
-- 1. Columns
--    reminder_time:        "HH:MM" 24-hour string in the user's local
--                          tz, or NULL when no reminder is set.
--    last_reminder_sent_at: stamped each fire so the cron de-dupes
--                          within the same user-local day.
-- ──────────────────────────────────────────────────────────────────

alter table public.plan_items
  add column if not exists reminder_time text null,
  add column if not exists last_reminder_sent_at timestamptz null;

alter table public.plan_items
  drop constraint if exists plan_items_reminder_time_format;

alter table public.plan_items
  add constraint plan_items_reminder_time_format
  check (
    reminder_time is null
    or reminder_time ~ '^[0-2][0-9]:[0-5][0-9]$'
  );

-- Partial index so the cron's "is there anything to fire?" lookup is
-- O(rows-with-reminder), not O(all-plan-items).
create index if not exists plan_items_reminder_due_idx
  on public.plan_items (plan_id, reminder_time)
  where reminder_time is not null;
