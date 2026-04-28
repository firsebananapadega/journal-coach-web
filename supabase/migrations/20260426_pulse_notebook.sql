-- Add a dedicated 'Pulse' system notebook so morning/evening pulse
-- entries live in their own, non-deletable collection instead of the
-- default Journal notebook. Safe to re-run: constraint swap is
-- idempotent (drop if exists + add), seed uses on-conflict-do-nothing.

-- ──────────────────────────────────────────────────────────────────
-- 1. Extend the system_key check constraint to include 'pulse'.
--    The original constraint name from 20260424_notebooks.sql is
--    `notebooks_system_key_check` (Postgres auto-named from the
--    column-level `check`). Drop-if-exists covers both auto-named
--    and manually-named cases.
-- ──────────────────────────────────────────────────────────────────

alter table public.notebooks
  drop constraint if exists notebooks_system_key_check;

alter table public.notebooks
  add constraint notebooks_system_key_check
  check (
    system_key in ('journal','gratitude','prompts','pulse')
    or system_key is null
  );

-- ──────────────────────────────────────────────────────────────────
-- 2. Seed a 'Pulse' system notebook for every existing user.
--    Idempotent via unique (user_id, system_key).
-- ──────────────────────────────────────────────────────────────────

insert into public.notebooks (user_id, name, slug, system_key, kind, is_default, sort_order, icon, color)
select id, 'Pulse', 'pulse', 'pulse', 'system', false, 3, 'heart', '#D87B3D' from auth.users
on conflict (user_id, system_key) do nothing;

-- ──────────────────────────────────────────────────────────────────
-- 3. Update the signup trigger so new users get Pulse automatically.
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
    (new.id, 'Prompts',   'prompts',   'prompts',   'system', false, 2, 'zap',   '#F5A623'),
    (new.id, 'Pulse',     'pulse',     'pulse',     'system', false, 3, 'heart', '#D87B3D')
  on conflict (user_id, system_key) do nothing;
  return new;
end;
$$;

-- Trigger itself already exists from 20260424_notebooks.sql; the
-- create-or-replace of the function above refreshes its body without
-- needing to recreate the trigger.

-- ──────────────────────────────────────────────────────────────────
-- 4. Backfill existing pulse entries into the Pulse notebook.
--    Previously they landed in each user's default Journal notebook.
-- ──────────────────────────────────────────────────────────────────

update public.journal_entries je
set notebook_id = n.id,
    updated_at = now()
from public.notebooks n
where je.entry_type = 'pulse'
  and n.user_id = je.user_id
  and n.system_key = 'pulse'
  and (je.notebook_id is null or je.notebook_id <> n.id);
