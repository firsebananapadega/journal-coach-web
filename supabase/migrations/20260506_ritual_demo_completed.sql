-- Add a flag for the post-onboarding "daily ritual" demo (the 3-card
-- walkthrough that shows new users their morning Pulse → tasks →
-- evening Pulse rhythm). Mirrors the existing tour_completed flag in
-- shape: a boolean on the profile row that survives reinstalls and
-- localStorage clears. Onboarding sets a localStorage `ritual_demo_pending`
-- on completion; the demo, once dismissed or finished, flips this column
-- to true so it never re-fires for that user even if their browser data
-- is wiped.

alter table public.profiles
  add column if not exists ritual_demo_completed boolean not null default false;
