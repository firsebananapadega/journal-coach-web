-- Sprint 4: weekly guide letter delivery.
--
-- Before this migration the weekly reflection existed only as a
-- browser-localStorage artifact. The letter that src/lib/weeklyReflection.ts
-- generated never made it to Supabase, never triggered a push, and was
-- invisible on new devices or after cache clears. That's why the user's
-- feedback was "I never received the letter."
--
-- This migration adds:
--   * public.weekly_letters — the canonical row per (user, ISO-week).
--   * pg_cron job firing every Sunday 23:00 UTC (≈6 PM ET / 3 PM PT)
--     that POSTs to /api/cron/generate-weekly-letters on Vercel.
--
-- Deploy order (if secrets aren't set yet the cron 401s silently and
-- retries next week — no harm):
--   1. Set WEEKLY_LETTER_CRON_SECRET in Vercel env + .env.local.
--   2. Run this migration.
--
-- Safe to re-run — the cron un-schedules the old job first.

-- ──────────────────────────────────────────────────────────────────
-- 1. weekly_letters table
-- ──────────────────────────────────────────────────────────────────

create table if not exists public.weekly_letters (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- ISO-week key like "2026-W17" — keeps Sunday→Sunday delivery
  -- idempotent across retries.
  week_key text not null,
  guide_id text not null,
  letter_text text not null,
  themes text[] not null default '{}',
  model text not null,
  generated_at timestamptz not null default now(),
  -- When the user first opened the letter. null = unread. Drives the
  -- home-screen badge and the "unread" dot on the archive list.
  seen_at timestamptz null,
  -- Which channels actually fired — 'push' | 'email'. Lets the cron
  -- retry delivery on a later run if the initial attempt failed.
  delivered_via text[] not null default '{}',
  unique (user_id, week_key)
);

create index if not exists weekly_letters_user_idx
  on public.weekly_letters (user_id, generated_at desc);

-- Partial index for unread letters — small and hot (the /home card
-- queries for this on every app open).
create index if not exists weekly_letters_unread_idx
  on public.weekly_letters (user_id)
  where seen_at is null;

-- RLS — user owns their rows. Service-role (cron) bypasses RLS.
alter table public.weekly_letters enable row level security;

drop policy if exists weekly_letters_select_own on public.weekly_letters;
drop policy if exists weekly_letters_update_own on public.weekly_letters;

create policy weekly_letters_select_own on public.weekly_letters
  for select using (user_id = auth.uid());
create policy weekly_letters_update_own on public.weekly_letters
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Inserts happen server-side via the cron's service-role client. No
-- insert policy for the user — they never write to this table.

-- ──────────────────────────────────────────────────────────────────
-- 2. pg_cron — Sunday 23:00 UTC
--    Supabase-managed pg_cron + pg_net already enabled by
--    20260425_reminders.sql.
-- ──────────────────────────────────────────────────────────────────

-- Bearer lives in Supabase Vault (cron_weekly_letter_secret) and is
-- read at fire-time. Seed once on a fresh environment via:
--   select vault.create_secret('<new-bearer>', 'cron_weekly_letter_secret',
--     'Bearer for /api/cron/generate-weekly-letters');

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_weekly_letter_secret') then
    raise exception 'Vault secret "cron_weekly_letter_secret" missing. Seed it before applying this migration.';
  end if;
end$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'generate-weekly-letters') then
    perform cron.unschedule('generate-weekly-letters');
  end if;
end$$;

select cron.schedule(
  'generate-weekly-letters',
  '0 23 * * 0',  -- Sun 23:00 UTC — 6 PM ET, 3 PM PT, late afternoon for EU
  $$
  select net.http_post(
    url := 'https://journal-coach-web.vercel.app/api/cron/generate-weekly-letters',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_weekly_letter_secret')
    ),
    body := jsonb_build_object('source', 'pg_cron', 'fired_at', now()::text)
  );
  $$
);
