-- Lists + Tasks tables for the Tasks-wall restructure.
--
-- Lists are project containers; Inbox is the system list (one per
-- user, is_inbox=true, never deletable). Tasks belong to a list and
-- carry an optional due_date for the Upcoming view + optional
-- urgent/important flags for the Eisenhower matrix view.
--
-- Existing daily_priorities table is unchanged. Today still reads
-- from priorityStore.items (legacy). New project/scheduled tasks
-- live here. A future migration can backfill legacy items into this
-- table once the new flow has soaked.

-- ─── lists ───
create table if not exists public.lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  color       text,
  icon        text,
  sort_order  integer not null default 0,
  is_inbox    boolean not null default false,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists lists_user_id_idx on public.lists (user_id);
create index if not exists lists_user_id_sort_idx on public.lists (user_id, sort_order);

-- One Inbox per user, enforced at the DB level.
create unique index if not exists lists_one_inbox_per_user
  on public.lists (user_id) where is_inbox;

-- ─── tasks ───
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  list_id     uuid references public.lists(id) on delete set null,
  text        text not null,
  due_date    date,
  time        text,             -- "09:00" or "morning" | "afternoon" | "evening"
  urgent      boolean not null default false,
  important   boolean not null default false,
  completed   boolean not null default false,
  sort_order  integer not null default 0,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists tasks_user_id_idx on public.tasks (user_id);
create index if not exists tasks_user_due_idx on public.tasks (user_id, due_date);
create index if not exists tasks_user_list_idx on public.tasks (user_id, list_id);
create index if not exists tasks_user_completed_idx on public.tasks (user_id, completed);

-- ─── RLS ───
alter table public.lists enable row level security;
alter table public.tasks enable row level security;

drop policy if exists "lists owner select" on public.lists;
drop policy if exists "lists owner insert" on public.lists;
drop policy if exists "lists owner update" on public.lists;
drop policy if exists "lists owner delete" on public.lists;

create policy "lists owner select" on public.lists
  for select using (auth.uid() = user_id);
create policy "lists owner insert" on public.lists
  for insert with check (auth.uid() = user_id);
create policy "lists owner update" on public.lists
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lists owner delete" on public.lists
  for delete using (auth.uid() = user_id);

drop policy if exists "tasks owner select" on public.tasks;
drop policy if exists "tasks owner insert" on public.tasks;
drop policy if exists "tasks owner update" on public.tasks;
drop policy if exists "tasks owner delete" on public.tasks;

create policy "tasks owner select" on public.tasks
  for select using (auth.uid() = user_id);
create policy "tasks owner insert" on public.tasks
  for insert with check (auth.uid() = user_id);
create policy "tasks owner update" on public.tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tasks owner delete" on public.tasks
  for delete using (auth.uid() = user_id);

-- ─── updated_at triggers ───
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists lists_touch_updated_at on public.lists;
create trigger lists_touch_updated_at
  before update on public.lists
  for each row execute function public.touch_updated_at();

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();
