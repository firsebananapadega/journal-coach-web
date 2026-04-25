-- Phase 4C — structure notes (MVP).
--
-- User-nameable themes that link multiple journal_entries together.
-- Inspired by Zettelkasten "structure notes" — meta-notes that group
-- related atomic notes. The MVP is hand-curated: user creates a note,
-- titles it, and adds entries to it. A v2 will add embedding-based
-- suggestions (pgvector + Gemini text-embedding-004) so the app can
-- propose entries that semantically match the structure note.
--
-- Safe to re-run.

create table if not exists public.structure_notes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text null,
  -- Ordered list of journal_entry ids this structure note groups.
  -- Stored as a jsonb array of strings rather than a join table
  -- because the typical access pattern is "show me this note's
  -- entries in order" — a single jsonb fetch beats a join here.
  -- A garbage-collection job (or per-row scrub on read) handles ids
  -- whose entries were deleted; FK-by-app pattern, accepted at MVP.
  entry_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists structure_notes_user_idx
  on public.structure_notes (user_id, updated_at desc);

-- RLS — user owns their notes (strict).
alter table public.structure_notes enable row level security;

drop policy if exists structure_notes_select_own on public.structure_notes;
drop policy if exists structure_notes_insert_own on public.structure_notes;
drop policy if exists structure_notes_update_own on public.structure_notes;
drop policy if exists structure_notes_delete_own on public.structure_notes;

create policy structure_notes_select_own on public.structure_notes
  for select using (user_id = auth.uid());
create policy structure_notes_insert_own on public.structure_notes
  for insert with check (user_id = auth.uid());
create policy structure_notes_update_own on public.structure_notes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy structure_notes_delete_own on public.structure_notes
  for delete using (user_id = auth.uid());
