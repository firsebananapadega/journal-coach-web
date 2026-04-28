-- In-app pending invites for grocery list sharing.
--
-- Replaces the email round-trip for *existing* users. Owner enters a
-- recipient's email; if that email resolves to an existing auth.users
-- row, the API route inserts a row here, and the recipient's
-- /groceries page surfaces a banner ("X wants to share their list —
-- Accept / Decline"). No email is sent in that case.
--
-- Email magic-link invites (current v2 flow) still apply for
-- recipients who don't yet have an account.

create table if not exists public.grocery_list_pending_invites (
  id                    uuid primary key default gen_random_uuid(),
  list_id               uuid not null references public.grocery_lists(id) on delete cascade,
  recipient_user_id     uuid not null references auth.users(id) on delete cascade,
  inviter_user_id       uuid not null references auth.users(id) on delete cascade,
  inviter_name_snapshot text,
  list_name_snapshot    text,
  created_at            timestamptz not null default now(),
  expires_at            timestamptz not null default (now() + interval '30 days'),
  unique (list_id, recipient_user_id)
);
create index if not exists grocery_pending_recipient_idx
  on public.grocery_list_pending_invites (recipient_user_id);

-- ── RLS ─────────────────────────────────────────────────────
alter table public.grocery_list_pending_invites enable row level security;

drop policy if exists "pending read"   on public.grocery_list_pending_invites;
drop policy if exists "pending insert" on public.grocery_list_pending_invites;
drop policy if exists "pending delete" on public.grocery_list_pending_invites;

-- Recipient + inviter can both see the row. Recipient sees so the
-- banner can render; inviter sees so the share sheet could surface
-- "you've already invited this person."
create policy "pending read" on public.grocery_list_pending_invites
  for select using (
    auth.uid() = recipient_user_id or auth.uid() = inviter_user_id
  );

-- Only members of the list can insert. Inviter must be the auth user
-- (no third-party impersonation).
create policy "pending insert" on public.grocery_list_pending_invites
  for insert with check (
    auth.uid() = inviter_user_id
    and public.is_grocery_list_member(list_id)
  );

-- Either party can delete: recipient declines, inviter cancels.
create policy "pending delete" on public.grocery_list_pending_invites
  for delete using (
    auth.uid() = recipient_user_id or auth.uid() = inviter_user_id
  );

-- UPDATE not allowed by RLS — re-inviting goes through the unique
-- index conflict path on the API side.

-- ── Accept RPC ──────────────────────────────────────────────
-- SECURITY DEFINER because the recipient ISN'T yet a list member,
-- so the members-table RLS would block a direct insert. Mirrors the
-- accept_grocery_invite pattern from the v1 token flow.
create or replace function public.accept_pending_invite(p_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row public.grocery_list_pending_invites;
  v_uid uuid := auth.uid();
  v_display text;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  select * into v_row from public.grocery_list_pending_invites
    where id = p_id for update;

  if not found or v_row.recipient_user_id <> v_uid then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;
  if v_row.expires_at < now() then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;

  select display_name into v_display from public.profiles where id = v_uid;

  insert into public.grocery_list_members (list_id, user_id, role, display_name_snapshot)
    values (v_row.list_id, v_uid, 'member', v_display)
    on conflict (list_id, user_id) do nothing;

  update public.profiles set active_grocery_list_id = v_row.list_id where id = v_uid;
  delete from public.grocery_list_pending_invites where id = p_id;

  return v_row.list_id;
end;
$$;

revoke execute on function public.accept_pending_invite(uuid) from public;
grant  execute on function public.accept_pending_invite(uuid) to authenticated;

-- ── Realtime ────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.grocery_list_pending_invites; exception when duplicate_object then null; end;
  end if;
end $$;

alter table public.grocery_list_pending_invites replica identity full;
