-- Auto-gratitude detection feature flags.
--
-- gratitude_auto_detect_enabled — when true, the structureEntry
-- pass also returns gratitude_excerpts and the journal pages show
-- a suggestion sheet asking the user to save them to the Gratitude
-- notebook. When false, no sheet ever appears (the user opted out
-- via Settings → Auto-detect gratitude).
--
-- gratitude_intro_seen — flips to true the first time the user
-- sees the suggestion sheet, so the one-time explainer card only
-- shows once. Independent of gratitude_auto_detect_enabled (a user
-- who disables and re-enables doesn't get the intro again).

alter table public.profiles
  add column if not exists gratitude_auto_detect_enabled boolean not null default true;

alter table public.profiles
  add column if not exists gratitude_intro_seen boolean not null default false;
