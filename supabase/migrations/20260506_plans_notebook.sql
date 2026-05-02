-- WOOP Plans v1 — companion notebook + entry_type.
--
-- Two tiny constraint widenings so the client can lazily create a
-- 'Plans' system notebook on first plan save and write entries with
-- entry_type='plan' into it. Unlike Gratitude / Pulse / Journal, the
-- Plans notebook is NOT pre-seeded at signup — only users who actually
-- create a WOOP plan get the notebook, mirroring how grocery lists
-- materialize lazily.

-- ──────────────────────────────────────────────────────────────────
-- 1. Extend notebooks.system_key check to include 'plans'.
--    Constraint name comes from 20260426_pulse_notebook.sql, which
--    renamed the auto-named constraint to `notebooks_system_key_check`.
-- ──────────────────────────────────────────────────────────────────

alter table public.notebooks
  drop constraint if exists notebooks_system_key_check;

alter table public.notebooks
  add constraint notebooks_system_key_check
  check (
    system_key in ('journal','gratitude','prompts','pulse','plans')
    or system_key is null
  );

-- ──────────────────────────────────────────────────────────────────
-- 2. Extend journal_entries.entry_type to allow 'plan'.
-- ──────────────────────────────────────────────────────────────────

alter table public.journal_entries
  drop constraint if exists journal_entries_entry_type_check;

alter table public.journal_entries
  add constraint journal_entries_entry_type_check
  check (entry_type = any (array[
    'voice', 'template', 'guided', 'freeform',
    'pulse', 'check_in', 'practice', 'plan'
  ]));

-- Deliberately NOT updating seed_system_notebooks() — Plans is lazy,
-- and we don't backfill existing users either. The notebook
-- materializes the moment the user saves their first plan.
