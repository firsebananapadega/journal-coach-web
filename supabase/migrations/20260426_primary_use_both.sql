-- primary_use gains a 'both' state so the onboarding flow can ask
-- whether the user came here for tasks, journaling, or both. Each
-- value drives wall visibility, settings UI, and cron eligibility.
--
-- Migration of existing rows: anyone currently on 'journal' (the
-- prior default) had access to BOTH walls in practice — they never
-- explicitly opted out of tasks. Flip them to 'both' so this
-- release doesn't silently strip the tasks wall. Users who
-- explicitly picked 'tasks' via the new onboarding step keep their
-- choice.

alter table public.profiles drop constraint if exists profiles_primary_use_check;
alter table public.profiles add constraint profiles_primary_use_check
  check (primary_use in ('journal', 'tasks', 'both'));

update public.profiles set primary_use = 'both' where primary_use = 'journal';

alter table public.profiles alter column primary_use set default 'both';
