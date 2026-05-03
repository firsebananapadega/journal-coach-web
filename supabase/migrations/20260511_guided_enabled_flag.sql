-- PR 2 of the wall removal — Guided sessions become a Settings-toggled
-- feature. Was a journal-wall tab (slot 3); after PR 2 the Settings
-- toggle controls visibility and an entry button inside the Journal
-- system notebook (/notebooks/journal) launches a session.
--
-- Default OFF for everyone — guided sessions are an advanced surface
-- (Naikan / NVC / AAR conversations) that most users won't want by
-- default. Opt-in via Settings, like the Plans + Gratitude toggles.
--
-- No backfill. Existing users keep guided_enabled = false even if
-- they previously visited /guided; the route still works the moment
-- they flip the toggle.

alter table public.profiles
  add column if not exists guided_enabled boolean not null default false;
