-- /today-only sort field for tasks.
-- The tasks table already has sort_order which drives /lists/[id] order.
-- The unified /today view needs its own ordering so that a user-driven
-- daily prioritization doesn't reshuffle the project list page.
-- NULL = use sort_order as fallback (legacy / never-prioritized rows).
alter table public.tasks
  add column if not exists today_sort_order integer null;
