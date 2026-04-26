-- Eisenhower matrix needs a way to distinguish "explicitly placed in
-- Q4 (Drop)" from "not yet triaged (Unsorted)." Both states had
-- urgent=false AND important=false, which collapsed Q4 onto Unsorted
-- — drops into Q4 silently routed back to Unsorted on render.
--
-- New column `triaged` flips false → true the moment the user places
-- a task into ANY quadrant via the matrix. Q1/Q2/Q3/Q4 = triaged.
-- Unsorted = not triaged.
--
-- Backfill: any task that ALREADY has a non-default urgent/important
-- was explicitly triaged at some prior point — preserve its placement
-- by stamping triaged=true. Untouched tasks (default false/false)
-- remain in Unsorted.

alter table public.tasks
  add column if not exists triaged boolean not null default false;

update public.tasks
   set triaged = true
 where urgent = true
    or important = true;
