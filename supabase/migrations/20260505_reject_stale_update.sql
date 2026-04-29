-- Phase 2 of offline-first: reject_stale_update trigger.
--
-- When the user is offline, mutations queue in the client outbox and
-- replay against the server when connectivity returns. If another
-- device modified the same row in the meantime, the queued mutation
-- carries an older `updated_at` than the row currently on the
-- server. Replaying that mutation would clobber the newer remote
-- edit.
--
-- The trigger compares the incoming `NEW.updated_at` to the existing
-- `OLD.updated_at`. If `NEW.updated_at < OLD.updated_at`, the
-- mutation is silently dropped (RETURN NULL). The client never sees
-- an error: it'll converge on the canonical state via realtime or
-- the next refresh.
--
-- Trigger NAMING: chosen so it sorts BEFORE the existing
-- `<table>_touch_updated_at` triggers (alphabetical order is how
-- Postgres dispatches multiple BEFORE triggers on the same row).
-- That way, the staleness check sees the client's submitted
-- `updated_at` value before `touch_updated_at` overwrites it with
-- `now()` on accept.

create or replace function public.reject_stale_update()
returns trigger as $$
begin
  if new.updated_at is not null
     and old.updated_at is not null
     and new.updated_at < old.updated_at then
    -- Drop the update silently. Returning null aborts the row update.
    return null;
  end if;
  return new;
end;
$$ language plpgsql;

-- tasks (offline writes via taskStore.addTask / updateTask / etc.)
drop trigger if exists a_reject_stale_update on public.tasks;
create trigger a_reject_stale_update
  before update on public.tasks
  for each row execute function public.reject_stale_update();

-- lists (offline writes via listStore.createList / renameList / etc.)
drop trigger if exists a_reject_stale_update on public.lists;
create trigger a_reject_stale_update
  before update on public.lists
  for each row execute function public.reject_stale_update();

-- grocery_items (offline writes + multi-user shared list — biggest LWW
-- consumer because the user shares this list with their wife).
drop trigger if exists a_reject_stale_update on public.grocery_items;
create trigger a_reject_stale_update
  before update on public.grocery_items
  for each row execute function public.reject_stale_update();

-- journal_entries (offline writes via journalStore.createEntry /
-- updateEntry / softDeleteEntry).
drop trigger if exists a_reject_stale_update on public.journal_entries;
create trigger a_reject_stale_update
  before update on public.journal_entries
  for each row execute function public.reject_stale_update();
