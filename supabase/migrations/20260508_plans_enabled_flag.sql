-- WOOP Plans v1.2 — explicit Settings toggle.
--
-- Decouples "do I want this feature at all?" from "let me make a plan
-- right now." Today the Plans system notebook is created lazily on
-- first plan save; after this migration it's gated by a profile flag
-- that the user controls in Settings.
--
-- Default OFF for new users (low-surface; opt-in feature).
-- Existing users with an active plan are auto-flipped to ON so their
-- data stays visible after deploy. Users with no plans stay OFF.

alter table public.profiles
  add column if not exists plans_enabled boolean not null default false;

update public.profiles p
set plans_enabled = true
where exists (
  select 1 from public.plans
  where user_id = p.id and status = 'active'
);
