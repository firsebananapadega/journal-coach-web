-- Phase 5C — quarterly narrative-arc letter.
--
-- The third tier of the letter cadence:
--   * weekly_letters        — short warm letter, every Sunday
--   * monthly_patterns      — 3 themes + 200-word digest, 1st of month
--   * quarterly_letters     — 600-800 word McAdams-style narrative arc,
--                             every 90+ days per user
--
-- McAdams' research on narrative identity ties psychological well-
-- being to the construction of "redemption sequences" — bad-to-good
-- arcs the person tells about their own life. The quarterly prompt
-- asks Gemini to identify those redemptive moments specifically,
-- making the long-form letter feel less like a recap and more like
-- the user reading their own story back at a higher altitude.
--
-- Cadence implementation: cron runs on the 1st of each month at
-- 23:30 UTC (30 min after the monthly cron so they don't fight for
-- the same Gemini RPM window). Per-user gate inside the route skips
-- anyone whose most-recent quarterly letter is <85 days old (so
-- it's effectively per-user-quarterly without rigid Q-boundaries).
--
-- Safe to re-run.

create table if not exists public.quarterly_letters (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- "2026-Q2" — calendar quarter the letter covers. Mostly used for
  -- display + idempotency; the per-user 85-day gate is the real
  -- scheduling rule.
  quarter_key text not null,
  guide_id text not null,
  -- 600-800 word narrative-arc letter. Plain text with paragraph
  -- breaks; no markdown so the existing WeeklyReflectionCard-style
  -- whitespace renderer suffices.
  letter_text text not null,
  -- Ids of redemption / turning-point entries the model identified.
  -- Stored so the UI can later surface "the moments I built this
  -- letter from."
  arc_entry_ids jsonb not null default '[]'::jsonb,
  -- Themes are flat strings, same shape as weekly_letters.themes.
  themes text[] not null default '{}',
  model text not null,
  generated_at timestamptz not null default now(),
  seen_at timestamptz null,
  delivered_via text[] not null default '{}',
  unique (user_id, quarter_key)
);

create index if not exists quarterly_letters_user_idx
  on public.quarterly_letters (user_id, generated_at desc);

create index if not exists quarterly_letters_unread_idx
  on public.quarterly_letters (user_id)
  where seen_at is null;

alter table public.quarterly_letters enable row level security;

drop policy if exists quarterly_letters_select_own on public.quarterly_letters;
drop policy if exists quarterly_letters_update_own on public.quarterly_letters;

create policy quarterly_letters_select_own on public.quarterly_letters
  for select using (user_id = auth.uid());
create policy quarterly_letters_update_own on public.quarterly_letters
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────────
-- pg_cron — 1st of each month at 23:30 UTC
-- ──────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from cron.job where jobname = 'generate-quarterly-letters') then
    perform cron.unschedule('generate-quarterly-letters');
  end if;
end$$;

select cron.schedule(
  'generate-quarterly-letters',
  '30 23 1 * *',
  $$
  select net.http_post(
    url := 'https://journal-coach-web.vercel.app/api/cron/generate-quarterly-letters',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer 59281af3a462da5a4d677b7980130979ae36daae58e99b4fcc3d5450533bda45'
    ),
    body := jsonb_build_object('source', 'pg_cron', 'fired_at', now()::text)
  );
  $$
);
