-- Sprint 2 schema:
--   * notebooks (user-owned collections)
--   * journal_entries.notebook_id reference
--   * journal_entries Raw / Structured pair (content_structured + meta)
--   * profiles.voice_dictionary for dictation post-pass
--
-- Safe to re-run (`if not exists` + `on conflict do nothing`).

-- ──────────────────────────────────────────────────────────────────
-- 1. notebooks table
-- ──────────────────────────────────────────────────────────────────

create table if not exists public.notebooks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  color text not null default '#C4553D',
  icon text not null default 'book',
  kind text not null default 'project' check (kind in ('system','project')),
  system_key text null check (system_key in ('journal','gratitude','prompts') or system_key is null),
  is_default boolean not null default false,
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug),
  unique (user_id, system_key)
);

create index if not exists notebooks_user_idx
  on public.notebooks(user_id, archived, sort_order);

-- RLS: user owns their notebooks (strict).
alter table public.notebooks enable row level security;

drop policy if exists notebooks_select_own on public.notebooks;
drop policy if exists notebooks_insert_own on public.notebooks;
drop policy if exists notebooks_update_own on public.notebooks;
drop policy if exists notebooks_delete_own on public.notebooks;

create policy notebooks_select_own on public.notebooks
  for select using (user_id = auth.uid());
create policy notebooks_insert_own on public.notebooks
  for insert with check (user_id = auth.uid());
create policy notebooks_update_own on public.notebooks
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notebooks_delete_own on public.notebooks
  for delete using (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────────
-- 2. journal_entries: notebook_id + Raw/Structured pair
-- ──────────────────────────────────────────────────────────────────

alter table public.journal_entries
  add column if not exists notebook_id uuid null
    references public.notebooks(id) on delete set null,
  add column if not exists content_structured text null,
  add column if not exists structured_generated_at timestamptz null,
  add column if not exists structured_gemini_model text null;

create index if not exists journal_entries_notebook_idx
  on public.journal_entries(notebook_id, created_at desc);

-- ──────────────────────────────────────────────────────────────────
-- 3. profiles.voice_dictionary (text[] of phrases to preserve
--    spelling of during the structured post-pass)
-- ──────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists voice_dictionary text[] not null default '{}';

-- ──────────────────────────────────────────────────────────────────
-- 4. Seed the 3 system notebooks for every existing user
--    (idempotent via the unique (user_id, system_key) constraint)
-- ──────────────────────────────────────────────────────────────────

insert into public.notebooks (user_id, name, slug, system_key, kind, is_default, sort_order, icon, color)
select id, 'Journal',   'journal',   'journal',   'system', true,  0, 'book',  '#C4553D' from auth.users
on conflict (user_id, system_key) do nothing;

insert into public.notebooks (user_id, name, slug, system_key, kind, is_default, sort_order, icon, color)
select id, 'Gratitude', 'gratitude', 'gratitude', 'system', false, 1, 'heart', '#7CA585' from auth.users
on conflict (user_id, system_key) do nothing;

insert into public.notebooks (user_id, name, slug, system_key, kind, is_default, sort_order, icon, color)
select id, 'Prompts',   'prompts',   'prompts',   'system', false, 2, 'zap',   '#F5A623' from auth.users
on conflict (user_id, system_key) do nothing;

-- ──────────────────────────────────────────────────────────────────
-- 5. Backfill existing entries → user's Journal notebook
-- ──────────────────────────────────────────────────────────────────

update public.journal_entries je
set notebook_id = n.id
from public.notebooks n
where je.notebook_id is null
  and n.user_id = je.user_id
  and n.system_key = 'journal';

-- ──────────────────────────────────────────────────────────────────
-- 6. Auto-seed on new user signup
-- ──────────────────────────────────────────────────────────────────

create or replace function public.seed_system_notebooks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notebooks (user_id, name, slug, system_key, kind, is_default, sort_order, icon, color)
  values
    (new.id, 'Journal',   'journal',   'journal',   'system', true,  0, 'book',  '#C4553D'),
    (new.id, 'Gratitude', 'gratitude', 'gratitude', 'system', false, 1, 'heart', '#7CA585'),
    (new.id, 'Prompts',   'prompts',   'prompts',   'system', false, 2, 'zap',   '#F5A623')
  on conflict (user_id, system_key) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_seed_system_notebooks on auth.users;
create trigger trg_seed_system_notebooks
  after insert on auth.users
  for each row execute function public.seed_system_notebooks();
