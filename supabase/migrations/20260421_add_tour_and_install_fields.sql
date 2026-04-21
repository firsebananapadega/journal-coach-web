-- Onboarding rebuild (v3): add fields for tour state + PWA install tracking.
-- Run in Supabase SQL editor. Safe to re-run (uses if not exists).

alter table public.profiles
  add column if not exists tour_completed boolean not null default false,
  add column if not exists install_prompt_dismissed_at timestamptz null,
  add column if not exists pwa_installed boolean not null default false;

-- Existing RLS (user owns own row) covers these columns. No new policy.
