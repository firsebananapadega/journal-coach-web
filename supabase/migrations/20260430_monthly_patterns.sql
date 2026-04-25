-- Phase 4A — monthly pattern digest.
--
-- Same delivery shape as weekly_letters (RLS, push fan-out from the
-- cron route) but at a different cadence + a richer payload: instead
-- of one warm letter the cron clusters the user's last ~30 days into
-- 3 named themes, each with a short summary and a list of example
-- journal_entry ids that gave rise to it. Surfaces in /letters
-- alongside weekly letters; the home-screen card path is shared.

-- ──────────────────────────────────────────────────────────────────
-- 1. monthly_patterns table
-- ──────────────────────────────────────────────────────────────────

create table if not exists public.monthly_patterns (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- "2026-04" — calendar month, NOT pulse-day-shifted. Keeps the cron
  -- idempotent across retries.
  month_key text not null,
  guide_id text not null,
  -- 200-word "what I noticed about you this month" narrative.
  narrative text not null,
  -- Array of { name: string, summary: string, entry_ids: string[] }.
  -- Stored as jsonb so we can render theme cards without joining.
  -- Entry ids let the UI fetch the cited entries on demand for
  -- "examples like…" tooltips.
  themes jsonb not null default '[]'::jsonb,
  model text not null,
  generated_at timestamptz not null default now(),
  seen_at timestamptz null,
  delivered_via text[] not null default '{}',
  unique (user_id, month_key)
);

create index if not exists monthly_patterns_user_idx
  on public.monthly_patterns (user_id, generated_at desc);

create index if not exists monthly_patterns_unread_idx
  on public.monthly_patterns (user_id)
  where seen_at is null;

-- RLS — user owns their rows. Service-role (cron) bypasses RLS.
alter table public.monthly_patterns enable row level security;

drop policy if exists monthly_patterns_select_own on public.monthly_patterns;
drop policy if exists monthly_patterns_update_own on public.monthly_patterns;

create policy monthly_patterns_select_own on public.monthly_patterns
  for select using (user_id = auth.uid());
create policy monthly_patterns_update_own on public.monthly_patterns
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Inserts only via the cron's service-role client.

-- ──────────────────────────────────────────────────────────────────
-- 2. pg_cron — 1st of each month at 23:00 UTC
--    (≈ 6 PM ET, 3 PM PT, late afternoon Europe).
-- ──────────────────────────────────────────────────────────────────

-- Bearer lives in Supabase Vault (cron_monthly_pattern_secret) and is
-- read at fire-time. Seed once on a fresh environment via:
--   select vault.create_secret('<new-bearer>', 'cron_monthly_pattern_secret',
--     'Bearer for /api/cron/generate-monthly-patterns');

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_monthly_pattern_secret') then
    raise exception 'Vault secret "cron_monthly_pattern_secret" missing. Seed it before applying this migration.';
  end if;
end$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'generate-monthly-patterns') then
    perform cron.unschedule('generate-monthly-patterns');
  end if;
end$$;

select cron.schedule(
  'generate-monthly-patterns',
  '0 23 1 * *',  -- minute 0, hour 23, day-of-month 1, any month, any DOW
  $$
  select net.http_post(
    url := 'https://journal-coach-web.vercel.app/api/cron/generate-monthly-patterns',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_monthly_pattern_secret')
    ),
    body := jsonb_build_object('source', 'pg_cron', 'fired_at', now()::text)
  );
  $$
);
