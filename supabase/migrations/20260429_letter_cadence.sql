-- Phase 3 — letter cadence control.
--
-- Per-user setting: how often the weekly guide letter should fire.
-- Default 'weekly' (current behavior). 'biweekly' / 'monthly' / 'off'
-- let the user dial it down without losing the archive.
--
-- The cron route at /api/cron/generate-weekly-letters checks both
-- this column and the most-recent letter's generated_at to decide
-- whether to skip a given user on this run.
--
-- Safe to re-run.

alter table public.profiles
  add column if not exists letter_cadence text not null default 'weekly';

-- Constraint added separately so re-runs don't conflict on existing
-- 'weekly' rows.
do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'profiles' and constraint_name = 'profiles_letter_cadence_check'
  ) then
    alter table public.profiles
      add constraint profiles_letter_cadence_check
      check (letter_cadence in ('weekly','biweekly','monthly','off'));
  end if;
end$$;
