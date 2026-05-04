-- Grocery items: per-item perishable override.
--
-- Lazy-classification pattern. The column stores ONLY user
-- overrides (true/false). NULL means "use the auto-classify
-- dictionary in src/lib/groceryClassify.ts at evaluation time."
-- This keeps the migration trivial (no backfill) and lets the
-- dictionary evolve without rewriting persisted rows.
--
-- Consumed by: CapturePreviewSheet's pantry-sync uncheck filter
-- (the "I have …" voice flow). Items are eligible for the
-- "Will uncheck (you didn't mention)" bucket only when their
-- effective perishable === true. Defaulting unknowns to non-
-- perishable is the safe direction — eliminates the false-uncheck
-- failure mode the user flagged.
--
-- Idempotent — re-running this migration is safe.

alter table public.grocery_items
  add column if not exists perishable boolean;
