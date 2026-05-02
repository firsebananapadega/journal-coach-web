-- WOOP Plans v1.
--
-- A "plan" is a user-initiated change attempt grounded in the
-- WOOP framework (Wish / Outcome / Obstacle / Plan).
-- Mental Contrasting with Implementation Intentions has the
-- strongest meta-analytic effect size for behavior change in this
-- space (g=0.28 at 4 weeks, g=0.38 at 3 months — Frontiers in
-- Psychology 2021), which is why this is the trigger we use rather
-- than naive goal extraction.
--
-- One active plan per user enforced at the application layer
-- (status='active' lookup) — DB-side constraint avoided so a user
-- can have a single completed/archived plan AND an active one
-- at the same time.

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  -- Auto-derived from wish (truncated). Editable later via the
  -- Optimize flow if we ever expose a rename.
  title text not null,
  -- The four WOOP fields. We store wish + outcome verbatim from the
  -- user; obstacles + if_then_text live on plan_items so a plan
  -- can hold up to 3 (or more, if we ever raise the cap).
  wish text not null,
  outcome text not null,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  -- Optional link back to the journal entry that inspired the plan,
  -- when v2 adds entry-detail-CTA. v1 is user-initiated from /home so
  -- this is always null today.
  source_entry_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plans_user_active_idx
  on public.plans (user_id, status)
  where status = 'active';

-- One row per obstacle. Each obstacle gets one if-then statement —
-- the "Plan" half of WOOP. Cascade delete on plan removal so the
-- card-level delete UX matches what the user expects.
create table if not exists public.plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.plans(id) on delete cascade not null,
  obstacle_text text not null,
  if_then_text text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plan_items_plan_idx
  on public.plan_items (plan_id, sort_order);

-- Per-day completion state. UNIQUE(plan_item_id, date) so a tap
-- toggles instead of stacking rows. Optimize reads aggregate stats
-- from this table (count of completed=true vs completed=false in
-- the last N days).
create table if not exists public.plan_item_completions (
  id uuid primary key default gen_random_uuid(),
  plan_item_id uuid references public.plan_items(id) on delete cascade not null,
  date date not null,
  completed boolean not null,
  created_at timestamptz not null default now(),
  unique (plan_item_id, date)
);

create index if not exists plan_item_completions_lookup_idx
  on public.plan_item_completions (plan_item_id, date desc);

-- ─── RLS ───────────────────────────────────────────────────────
-- All three tables follow the same pattern: row owner = plan owner.
-- plan_items + plan_item_completions reach owner via plan_id.

alter table public.plans enable row level security;

create policy "plans select own"
  on public.plans for select
  using (auth.uid() = user_id);

create policy "plans insert own"
  on public.plans for insert
  with check (auth.uid() = user_id);

create policy "plans update own"
  on public.plans for update
  using (auth.uid() = user_id);

create policy "plans delete own"
  on public.plans for delete
  using (auth.uid() = user_id);

alter table public.plan_items enable row level security;

create policy "plan_items select via plan"
  on public.plan_items for select
  using (exists (
    select 1 from public.plans p
    where p.id = plan_items.plan_id and p.user_id = auth.uid()
  ));

create policy "plan_items insert via plan"
  on public.plan_items for insert
  with check (exists (
    select 1 from public.plans p
    where p.id = plan_items.plan_id and p.user_id = auth.uid()
  ));

create policy "plan_items update via plan"
  on public.plan_items for update
  using (exists (
    select 1 from public.plans p
    where p.id = plan_items.plan_id and p.user_id = auth.uid()
  ));

create policy "plan_items delete via plan"
  on public.plan_items for delete
  using (exists (
    select 1 from public.plans p
    where p.id = plan_items.plan_id and p.user_id = auth.uid()
  ));

alter table public.plan_item_completions enable row level security;

create policy "plan_item_completions select via plan"
  on public.plan_item_completions for select
  using (exists (
    select 1 from public.plan_items pi
    join public.plans p on p.id = pi.plan_id
    where pi.id = plan_item_completions.plan_item_id and p.user_id = auth.uid()
  ));

create policy "plan_item_completions insert via plan"
  on public.plan_item_completions for insert
  with check (exists (
    select 1 from public.plan_items pi
    join public.plans p on p.id = pi.plan_id
    where pi.id = plan_item_completions.plan_item_id and p.user_id = auth.uid()
  ));

create policy "plan_item_completions update via plan"
  on public.plan_item_completions for update
  using (exists (
    select 1 from public.plan_items pi
    join public.plans p on p.id = pi.plan_id
    where pi.id = plan_item_completions.plan_item_id and p.user_id = auth.uid()
  ));

create policy "plan_item_completions delete via plan"
  on public.plan_item_completions for delete
  using (exists (
    select 1 from public.plan_items pi
    join public.plans p on p.id = pi.plan_id
    where pi.id = plan_item_completions.plan_item_id and p.user_id = auth.uid()
  ));
