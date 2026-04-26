-- profiles.primary_use — set during onboarding to determine the
-- initial wall. After first launch, wallState localStorage takes over;
-- this column only seeds the very first redirect post-onboarding.

alter table public.profiles
  add column if not exists primary_use text
  check (primary_use in ('journal', 'tasks'))
  default 'journal';
