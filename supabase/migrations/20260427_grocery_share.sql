-- Shared, real-time grocery lists.
--
-- Replaces the JSONB blob in `daily_priorities.groceries` with normalized
-- tables so multiple users can edit the same list with row-level realtime
-- sync. The old column stays in place for one release as a read fallback;
-- a follow-up migration drops it after a soak window.
--
-- Tables: grocery_lists / grocery_list_members / grocery_groups /
-- grocery_items / grocery_list_invites. Access is gated through the
-- `is_grocery_list_member(list_id)` SECURITY DEFINER helper. Non-members
-- become members only via the `accept_grocery_invite(token)` RPC, which
-- is the chicken-and-egg solver for "INSERT INTO members where you are
-- not yet a member."

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.grocery_lists (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id),
  name        text not null default 'Groceries',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists grocery_lists_owner_idx on public.grocery_lists (owner_id);

create table if not exists public.grocery_list_members (
  list_id               uuid not null references public.grocery_lists(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  role                  text not null default 'member' check (role in ('owner','member')),
  display_name_snapshot text,
  joined_at             timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index if not exists grocery_list_members_user_idx
  on public.grocery_list_members (user_id, list_id);

create table if not exists public.grocery_groups (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.grocery_lists(id) on delete cascade,
  store       text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists grocery_groups_list_idx on public.grocery_groups (list_id);

create table if not exists public.grocery_items (
  id            uuid primary key,
  list_id       uuid not null references public.grocery_lists(id) on delete cascade,
  group_id      uuid not null references public.grocery_groups(id) on delete cascade,
  name          text not null,
  completed     boolean not null default false,
  completed_at  timestamptz,
  completed_by  uuid references auth.users(id) on delete set null,
  added_by      uuid references auth.users(id) on delete set null,
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists grocery_items_list_idx  on public.grocery_items (list_id);
create index if not exists grocery_items_group_idx on public.grocery_items (group_id);
-- Soft-dedup: only one active (un-checked) row per (group, lower-cased name).
create unique index if not exists grocery_items_no_dup_active
  on public.grocery_items (group_id, lower(name)) where completed = false;

create table if not exists public.grocery_list_invites (
  token       uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.grocery_lists(id) on delete cascade,
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  max_uses    int  not null default 10,
  uses        int  not null default 0,
  revoked_at  timestamptz
);
create index if not exists grocery_list_invites_list_idx on public.grocery_list_invites (list_id);

alter table public.profiles
  add column if not exists active_grocery_list_id uuid
  references public.grocery_lists(id) on delete set null;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Reuse the touch_updated_at function from 20260419_lists_and_tasks.sql
-- (CREATE OR REPLACE in case a fresh DB hasn't run that migration yet).
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists grocery_lists_touch on public.grocery_lists;
create trigger grocery_lists_touch
  before update on public.grocery_lists
  for each row execute function public.touch_updated_at();

drop trigger if exists grocery_items_touch on public.grocery_items;
create trigger grocery_items_touch
  before update on public.grocery_items
  for each row execute function public.touch_updated_at();

-- Enforce list_id on grocery_items always matches list_id of its group,
-- so a buggy client can't desync the denormalized column.
create or replace function public.enforce_grocery_item_list_matches_group()
returns trigger language plpgsql as $$
declare v_list uuid;
begin
  select list_id into v_list from public.grocery_groups where id = new.group_id;
  if v_list is null then
    raise exception 'grocery_items.group_id (%) does not exist', new.group_id;
  end if;
  if new.list_id is null then
    new.list_id := v_list;
  elsif new.list_id <> v_list then
    raise exception 'grocery_items.list_id (%) does not match group.list_id (%)', new.list_id, v_list;
  end if;
  return new;
end;
$$;

drop trigger if exists grocery_items_enforce_list on public.grocery_items;
create trigger grocery_items_enforce_list
  before insert or update on public.grocery_items
  for each row execute function public.enforce_grocery_item_list_matches_group();

-- Auto-add the owner as a member when a grocery_list is created.
-- SECURITY DEFINER + locked search_path so the trigger can write into
-- grocery_list_members regardless of the calling user's RLS context.
create or replace function public.add_owner_as_member()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_display text;
begin
  select display_name into v_display from public.profiles where id = new.owner_id;
  insert into public.grocery_list_members (list_id, user_id, role, display_name_snapshot)
  values (new.id, new.owner_id, 'owner', v_display)
  on conflict (list_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists grocery_lists_add_owner on public.grocery_lists;
create trigger grocery_lists_add_owner
  after insert on public.grocery_lists
  for each row execute function public.add_owner_as_member();

-- When the owner leaves (or is deleted), promote the longest-tenure
-- remaining member to owner. If none remain, the list is cascade-deleted
-- via the FK on owner_id (which we leave as the default RESTRICT to
-- block accidental account deletion when others depend on the list).
-- We achieve this by handling the "owner intentionally leaves" path
-- in the leave-list flow and by explicit transfer in app code; this
-- function exists for completeness if someone deletes the membership row.
create or replace function public.promote_owner_after_leave()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_new_owner uuid;
begin
  if old.role <> 'owner' then
    return old;
  end if;
  select user_id into v_new_owner
  from public.grocery_list_members
  where list_id = old.list_id and user_id <> old.user_id
  order by joined_at asc
  limit 1;
  if v_new_owner is not null then
    update public.grocery_lists set owner_id = v_new_owner where id = old.list_id;
    update public.grocery_list_members set role = 'owner'
      where list_id = old.list_id and user_id = v_new_owner;
  else
    delete from public.grocery_lists where id = old.list_id;
  end if;
  return old;
end;
$$;

drop trigger if exists grocery_members_promote_owner on public.grocery_list_members;
create trigger grocery_members_promote_owner
  after delete on public.grocery_list_members
  for each row execute function public.promote_owner_after_leave();

-- ============================================================
-- MEMBERSHIP HELPER (used by every RLS policy below)
-- ============================================================

create or replace function public.is_grocery_list_member(p_list_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.grocery_list_members
    where list_id = p_list_id and user_id = auth.uid()
  );
$$;

revoke execute on function public.is_grocery_list_member(uuid) from public;
grant  execute on function public.is_grocery_list_member(uuid) to authenticated;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.grocery_lists         enable row level security;
alter table public.grocery_list_members  enable row level security;
alter table public.grocery_groups        enable row level security;
alter table public.grocery_items         enable row level security;
alter table public.grocery_list_invites  enable row level security;

-- ── grocery_lists ──
drop policy if exists "lists members read"   on public.grocery_lists;
drop policy if exists "lists owner insert"   on public.grocery_lists;
drop policy if exists "lists owner update"   on public.grocery_lists;
drop policy if exists "lists owner delete"   on public.grocery_lists;
create policy "lists members read" on public.grocery_lists
  for select using (public.is_grocery_list_member(id));
create policy "lists owner insert" on public.grocery_lists
  for insert with check (auth.uid() = owner_id);
create policy "lists owner update" on public.grocery_lists
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "lists owner delete" on public.grocery_lists
  for delete using (auth.uid() = owner_id);

-- ── grocery_groups ──
drop policy if exists "groups members read"   on public.grocery_groups;
drop policy if exists "groups members insert" on public.grocery_groups;
drop policy if exists "groups members update" on public.grocery_groups;
drop policy if exists "groups members delete" on public.grocery_groups;
create policy "groups members read" on public.grocery_groups
  for select using (public.is_grocery_list_member(list_id));
create policy "groups members insert" on public.grocery_groups
  for insert with check (public.is_grocery_list_member(list_id));
create policy "groups members update" on public.grocery_groups
  for update using (public.is_grocery_list_member(list_id))
  with check (public.is_grocery_list_member(list_id));
create policy "groups members delete" on public.grocery_groups
  for delete using (public.is_grocery_list_member(list_id));

-- ── grocery_items ──
drop policy if exists "items members read"   on public.grocery_items;
drop policy if exists "items members insert" on public.grocery_items;
drop policy if exists "items members update" on public.grocery_items;
drop policy if exists "items members delete" on public.grocery_items;
create policy "items members read" on public.grocery_items
  for select using (public.is_grocery_list_member(list_id));
create policy "items members insert" on public.grocery_items
  for insert with check (public.is_grocery_list_member(list_id));
create policy "items members update" on public.grocery_items
  for update using (public.is_grocery_list_member(list_id))
  with check (public.is_grocery_list_member(list_id));
create policy "items members delete" on public.grocery_items
  for delete using (public.is_grocery_list_member(list_id));

-- ── grocery_list_members ──
-- Members can see fellow members. Owner can add/remove others. Anyone
-- can leave (delete their own row). New-member INSERT happens via the
-- accept_grocery_invite RPC; this policy allows the owner-add path
-- and the owner-as-member trigger.
drop policy if exists "members read"   on public.grocery_list_members;
drop policy if exists "members insert" on public.grocery_list_members;
drop policy if exists "members delete" on public.grocery_list_members;
create policy "members read" on public.grocery_list_members
  for select using (public.is_grocery_list_member(list_id));
create policy "members insert" on public.grocery_list_members
  for insert with check (
    auth.uid() = (select owner_id from public.grocery_lists where id = list_id)
  );
create policy "members delete" on public.grocery_list_members
  for delete using (
    auth.uid() = user_id
    or auth.uid() = (select owner_id from public.grocery_lists where id = list_id)
  );

-- ── grocery_list_invites ──
drop policy if exists "invites members read"   on public.grocery_list_invites;
drop policy if exists "invites members insert" on public.grocery_list_invites;
drop policy if exists "invites members update" on public.grocery_list_invites;
create policy "invites members read" on public.grocery_list_invites
  for select using (public.is_grocery_list_member(list_id));
create policy "invites members insert" on public.grocery_list_invites
  for insert with check (
    public.is_grocery_list_member(list_id) and auth.uid() = created_by
  );
create policy "invites members update" on public.grocery_list_invites
  for update using (public.is_grocery_list_member(list_id))
  with check (public.is_grocery_list_member(list_id));

-- ============================================================
-- ACCEPT-INVITE RPC
-- ============================================================

create or replace function public.accept_grocery_invite(p_token uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_invite public.grocery_list_invites;
  v_uid uuid := auth.uid();
  v_display text;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  select * into v_invite from public.grocery_list_invites
    where token = p_token for update;

  if not found
     or v_invite.revoked_at is not null
     or v_invite.expires_at < now()
     or v_invite.uses >= v_invite.max_uses then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;

  select display_name into v_display from public.profiles where id = v_uid;

  insert into public.grocery_list_members (list_id, user_id, role, display_name_snapshot)
    values (v_invite.list_id, v_uid, 'member', v_display)
    on conflict (list_id, user_id) do nothing;

  update public.grocery_list_invites set uses = uses + 1 where token = p_token;
  update public.profiles set active_grocery_list_id = v_invite.list_id where id = v_uid;

  return v_invite.list_id;
end;
$$;

revoke execute on function public.accept_grocery_invite(uuid) from public;
grant  execute on function public.accept_grocery_invite(uuid) to authenticated;

-- ============================================================
-- REALTIME PUBLICATION
-- ============================================================
-- Without ADD TABLE, the channel SUBSCRIBES green and silently delivers
-- zero events. Without REPLICA IDENTITY FULL, UPDATE/DELETE payloads
-- only carry the PK, which breaks client merge logic for nested state.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- Add tables to the publication if not already members. Wrapping in a
    -- DO block + EXCEPTION since `ALTER PUBLICATION ... ADD TABLE` errors
    -- if the table is already published.
    begin alter publication supabase_realtime add table public.grocery_items; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.grocery_groups; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.grocery_lists; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.grocery_list_members; exception when duplicate_object then null; end;
  end if;
end $$;

alter table public.grocery_items         replica identity full;
alter table public.grocery_groups        replica identity full;
alter table public.grocery_list_members  replica identity full;
