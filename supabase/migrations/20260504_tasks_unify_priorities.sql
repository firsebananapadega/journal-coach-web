-- Collapse loose priorities into the tasks table.
-- Adds category + subgroup columns to tasks (so chips work on every
-- row), then backfills existing daily_priorities items into tasks
-- routed to each user's Inbox list. After this migration, the app
-- writes only to tasks; daily_priorities is left in place as cold
-- storage and can be dropped in a follow-up once the user confirms
-- nothing was lost.

-- ─── new columns on tasks ───
alter table public.tasks
  add column if not exists category text null,
  add column if not exists subgroup text null;

-- ─── ensure every priorities-using user has an Inbox ───
-- The (user_id) where is_inbox unique partial index prevents duplicate
-- inboxes; on conflict do nothing absorbs that. Falls through if the
-- user already has any list named "Inbox" via the (user_id, name)
-- unique constraint as well.
insert into public.lists (user_id, name, is_inbox, sort_order, icon)
select distinct dp.user_id, 'Inbox', true, 0, '📥'
from public.daily_priorities dp
where not exists (
  select 1 from public.lists l
  where l.user_id = dp.user_id and l.is_inbox = true
)
on conflict do nothing;

-- ─── backfill daily_priorities → tasks ───
-- Expand each row's items JSONB array into one tasks row per item.
-- Every backfilled row lands in the user's Inbox with due_date set to
-- the priority's day so it shows on /today on the same date as before.
-- today_sort_order is seeded from sort_order so the relative order on
-- /today is preserved without requiring a drag.
--
-- Legacy items used non-UUID ids (e.g. p_1775355839618_0). To stay
-- idempotent without depending on the legacy id format, we derive a
-- stable UUID from (user_id, date, legacy_id, text) via md5. Re-running
-- the migration produces the same task ids, so existing rows are
-- skipped via NOT EXISTS.
insert into public.tasks (
  id,
  user_id,
  list_id,
  text,
  due_date,
  completed,
  sort_order,
  today_sort_order,
  category,
  subgroup,
  urgent,
  important,
  triaged,
  created_at
)
select
  md5(
    dp.user_id::text
    || '|' || dp.date::text
    || '|' || coalesce(item->>'id', '')
    || '|' || coalesce(item->>'text', '')
  )::uuid                                          as id,
  dp.user_id                                       as user_id,
  inbox.id                                         as list_id,
  coalesce(item->>'text', '')                      as text,
  dp.date                                          as due_date,
  coalesce((item->>'completed')::boolean, false)   as completed,
  coalesce((item->>'sort_order')::int, 0)          as sort_order,
  coalesce((item->>'sort_order')::int, 0)          as today_sort_order,
  nullif(item->>'category', '')                    as category,
  nullif(item->>'subgroup', '')                    as subgroup,
  coalesce((item->>'urgent')::boolean, false)      as urgent,
  coalesce((item->>'important')::boolean, false)   as important,
  coalesce((item->>'triaged')::boolean, false)     as triaged,
  dp.created_at                                    as created_at
from public.daily_priorities dp
cross join lateral jsonb_array_elements(dp.items) as item
join public.lists inbox
  on inbox.user_id = dp.user_id and inbox.is_inbox = true
where coalesce(item->>'text', '') <> ''
  and not exists (
    select 1 from public.tasks t
    where t.id = md5(
      dp.user_id::text
      || '|' || dp.date::text
      || '|' || coalesce(item->>'id', '')
      || '|' || coalesce(item->>'text', '')
    )::uuid
  );
