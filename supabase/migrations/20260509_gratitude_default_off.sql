-- Gratitude auto-detect: default OFF + downgrade to project notebook.
--
-- The auto-detect feature shipped with two real bugs (duplicate-fire
-- recursion + Spanish→English translation) and a structural mismatch
-- (Gratitude was a non-deletable system notebook seeded for everyone,
-- whether they used the feature or not). This migration flips both:
--
--   1. Column default false going forward, AND clean-slate every
--      existing profile to false. Users can re-enable in Settings.
--   2. Every existing gratitude notebook gets demoted to a regular
--      project notebook so users can rename / delete / manage it like
--      any other notebook. Existing journal_entries.notebook_id keep
--      pointing to the same row — only kind + system_key flip.
--   3. The seed_system_notebooks() signup trigger is rewritten to
--      stop creating a gratitude row for new users. Mirrors the
--      20260427_prompts_not_system.sql pattern.
--
-- When a user toggles auto-detect ON in Settings, the app's
-- ensureGratitudeNotebook('system') promotes the row back. So the
-- system_key='gratitude' constraint stays in place; we just don't
-- materialize it by default.

-- 1. Flip the column default.
alter table public.profiles
  alter column gratitude_auto_detect_enabled set default false;

-- 2. Clean-slate existing profiles to off.
update public.profiles
set gratitude_auto_detect_enabled = false
where gratitude_auto_detect_enabled is distinct from false;

-- 3. Demote every existing gratitude system notebook to project.
--    on delete set null on the FK from journal_entries means existing
--    entries continue to point at this same row — they survive the
--    kind/system_key flip without any further work.
update public.notebooks
set kind = 'project',
    system_key = null,
    updated_at = now()
where system_key = 'gratitude';

-- 4. Rewrite the signup trigger to drop gratitude (and stay aligned
--    with 20260427_prompts_not_system.sql, which already retired
--    Prompts). Journal + Pulse remain system notebooks.
create or replace function public.seed_system_notebooks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notebooks
    (user_id, name, slug, system_key, kind, is_default, sort_order, icon, color)
  values
    (new.id, 'Journal', 'journal', 'journal', 'system', true,  0, 'book',  '#C4553D'),
    (new.id, 'Pulse',   'pulse',   'pulse',   'system', false, 3, 'heart', '#D87B3D')
  on conflict (user_id, system_key) do nothing;
  return new;
end;
$$;
