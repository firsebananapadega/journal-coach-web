-- Demote 'Prompts' from a system notebook to a regular project
-- notebook, and drop it from the new-user seed.
--
-- Per user 2026-04-24: "Prompts should not be a system journal; it is
-- there, I like it, but I should be able to change the name of it.
-- When a new user comes, they should only have journal, gratitude,
-- and pulse notebooks."
--
-- We keep existing users' Prompts row because they've been using it —
-- just flip kind to 'project' and clear system_key so it behaves like
-- a user-created notebook (renameable, archivable, no SYSTEM badge).
-- New signups skip it entirely.
--
-- Safe to re-run: UPDATE is idempotent, seed function is
-- create-or-replace, the constraint already permits 'prompts' as a
-- legal system_key so we don't need to touch it.

-- ──────────────────────────────────────────────────────────────────
-- 1. Convert every existing user's 'Prompts' notebook from system to
--    project. Clearing system_key removes the uniqueness lock so the
--    user can freely rename/recolor/archive it like any other
--    notebook.
-- ──────────────────────────────────────────────────────────────────

update public.notebooks
set kind       = 'project',
    system_key = null,
    updated_at = now()
where system_key = 'prompts';

-- ──────────────────────────────────────────────────────────────────
-- 2. Refresh the signup trigger so it seeds only Journal / Gratitude
--    / Pulse. Prompts is no longer an auto-provisioned notebook —
--    users who want a prompts collection create it themselves.
-- ──────────────────────────────────────────────────────────────────

create or replace function public.seed_system_notebooks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notebooks (user_id, name, slug, system_key, kind, is_default, sort_order, icon, color)
  values
    (new.id, 'Journal',   'journal',   'journal',   'system', true,  0, 'book',  '#C4553D'),
    (new.id, 'Gratitude', 'gratitude', 'gratitude', 'system', false, 1, 'heart', '#7CA585'),
    (new.id, 'Pulse',     'pulse',     'pulse',     'system', false, 2, 'heart', '#D87B3D')
  on conflict (user_id, system_key) do nothing;
  return new;
end;
$$;

-- Trigger `trg_seed_system_notebooks` was installed by the Sprint 2
-- migration; the create-or-replace above swaps the function body it
-- invokes, so no DROP/CREATE TRIGGER is required.
