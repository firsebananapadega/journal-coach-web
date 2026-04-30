-- Per-tab first-visit popup tracking. The new onboarding system
-- shows a small one-line popup the first time the user lands on
-- secondary tabs (Notebooks / Patterns / Guided / Lists / Upcoming /
-- Groceries) — once dismissed, the tab's path is appended here so
-- it never fires again. Toggling Settings → "Show onboarding guide"
-- resets this column to '{}' so the tour AND popups replay together.

alter table public.profiles
  add column if not exists tour_seen_tabs text[] not null default '{}';
