-- Sprint 3: reminders via Web Push.
--   * tasks: four reminder columns + partial index for the cron
--   * push_subscriptions table (with RLS)
--   * pg_cron + pg_net extensions enabled
--   * Cron job left for a follow-up step (needs edge URL + JWT which
--     are set at app runtime, not migration time).
--
-- Safe to re-run.

-- ──────────────────────────────────────────────────────────────────
-- 1. Reminder columns on tasks
-- ──────────────────────────────────────────────────────────────────

alter table public.tasks
  add column if not exists remind_at            timestamptz null,
  add column if not exists remind_sent_at       timestamptz null,
  add column if not exists remind_snoozed_until timestamptz null,
  add column if not exists reminder_message     text null;

-- Fast lookup for the cron: only un-sent, un-completed reminders
-- that are due. Partial index keeps it tiny.
create index if not exists tasks_reminder_due_idx
  on public.tasks (remind_at)
  where remind_at is not null
    and remind_sent_at is null
    and completed = false;

-- ──────────────────────────────────────────────────────────────────
-- 2. push_subscriptions
-- ──────────────────────────────────────────────────────────────────

create table if not exists public.push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text null,
  user_tz text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_active_idx
  on public.push_subscriptions (user_id, active);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_sub_select_own on public.push_subscriptions;
drop policy if exists push_sub_insert_own on public.push_subscriptions;
drop policy if exists push_sub_update_own on public.push_subscriptions;
drop policy if exists push_sub_delete_own on public.push_subscriptions;

create policy push_sub_select_own on public.push_subscriptions
  for select using (user_id = auth.uid());
create policy push_sub_insert_own on public.push_subscriptions
  for insert with check (user_id = auth.uid());
create policy push_sub_update_own on public.push_subscriptions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_sub_delete_own on public.push_subscriptions
  for delete using (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────────
-- 3. Enable pg_cron + pg_net (no-op if already enabled)
-- ──────────────────────────────────────────────────────────────────

create extension if not exists pg_cron  with schema extensions;
create extension if not exists pg_net   with schema extensions;
