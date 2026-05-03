-- Onboarding v2 — personalization fields collected during the new
-- 5-screen flow.
--
--   brought_you_here          : multi-select chip selections from
--                               Screen 2. Drives feature-flag auto-
--                               flips (plans_enabled, guided_enabled,
--                               ensureGratitudeNotebook) at signup
--                               time so the user lands on a
--                               personalized home screen.
--
--   preferred_reflection_time : single-select chip from Screen 3
--                               (morning / midday / evening / anytime).
--                               Pre-fills the matching pulse-reminder
--                               toggle + reminder_time when the user
--                               grants notifications on Screen 5.
--
-- Both default to a sensible empty state so existing users (who
-- never see the new flow) continue to load. Re-running the migration
-- is safe — `add column if not exists` + the explicit default
-- handle that.

alter table public.profiles
  add column if not exists brought_you_here text[] not null default '{}';

alter table public.profiles
  add column if not exists preferred_reflection_time text not null default 'anytime';

alter table public.profiles
  drop constraint if exists profiles_preferred_reflection_time_check;

alter table public.profiles
  add constraint profiles_preferred_reflection_time_check
  check (preferred_reflection_time in ('morning', 'midday', 'evening', 'anytime'));
