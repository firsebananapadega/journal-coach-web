-- Soft-archive for tasks. Used by the new overdue UI to let users
-- bulk-archive items they no longer want to act on (the "Still
-- relevant?" stale prompt + the 30+ overdue bankruptcy escape).
--
-- Distinction from `completed`:
--   - completed = "I did this"
--   - archived_at IS NOT NULL = "this is no longer relevant; hide it"
-- Both flags hide the row from /today, but archived_at preserves the
-- truthful semantics so future analytics / reflection can tell the
-- difference between "got it done" and "let it go."
--
-- Rows with archived_at set are silently filtered from the tasks
-- slice at fetch time (taskStore), so consumers don't need to add
-- a filter clause everywhere.

alter table public.tasks
  add column if not exists archived_at timestamptz;

create index if not exists tasks_archived_at_null_idx
  on public.tasks (user_id, archived_at)
  where archived_at is null;
