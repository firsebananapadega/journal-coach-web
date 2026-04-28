-- Relax the journal_entries.entry_type CHECK constraint to allow
-- 'practice' and 'check_in' — both are written by the app (practice
-- completions and daily Body & Mind check-ins) but were silently
-- rejected by the original constraint, leaving zero rows for each.
--
-- Safe to re-run: `drop constraint if exists` + add.

alter table public.journal_entries
  drop constraint if exists journal_entries_entry_type_check;

alter table public.journal_entries
  add constraint journal_entries_entry_type_check
  check (entry_type = any (array[
    'voice', 'template', 'guided', 'freeform',
    'pulse', 'check_in', 'practice'
  ]));
