-- Daily gratitude ritual — extend journal_entries.entry_type to allow
-- 'gratitude'. The structured-daily-card UI inside /notebooks/gratitude
-- writes one entry per user-local day with the items in
-- metadata.gratitude_items. Mirrors the symmetric extension we did
-- for 'plan' in 20260506_plans_notebook.sql.
--
-- No unique constraint on (user, day) at the DB level: client-side
-- upsert keys on metadata.gratitude_date (user-local YYYY-MM-DD) so
-- midnight + timezone math doesn't lie. UTC-vs-local ambiguity makes
-- a partial index on created_at::date wrong for users near midnight.

alter table public.journal_entries
  drop constraint if exists journal_entries_entry_type_check;

alter table public.journal_entries
  add constraint journal_entries_entry_type_check
  check (entry_type = any (array[
    'voice', 'template', 'guided', 'freeform',
    'pulse', 'check_in', 'practice', 'plan', 'gratitude'
  ]));
