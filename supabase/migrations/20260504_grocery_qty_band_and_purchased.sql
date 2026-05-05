-- Grocery items: visible quantity band + sticky purchase timestamp.
--
-- qty_band: 'low' | 'medium' | 'high' | null. User-visible chip on
-- the row (replaces the prior internal-only perishable chip).
-- Persisted from the have-flow when the user volunteered band
-- language ("plenty of X", "running low", "one X" with auto-derived
-- 'low") and from the in-row Edit-mode chip cycle.
--
-- last_purchased_at: sticky timestamp of the last completed=true
-- transition. Set every time the item flips false → true (manual
-- toggle, voice check-off, addCompletedItems). NEVER cleared on
-- uncheck. Drives the "Possibly running low" suggestion at the
-- top of /groceries via time-elapsed + qty_band='low'.
--
-- Backfill: existing checked rows seed last_purchased_at from
-- completed_at so the new feature works on day one for legacy
-- data. Idempotent on re-run (skips rows that already have a
-- value).

alter table public.grocery_items
  add column if not exists qty_band text;

alter table public.grocery_items
  add column if not exists last_purchased_at timestamptz;

update public.grocery_items
  set last_purchased_at = completed_at
  where completed = true
    and last_purchased_at is null
    and completed_at is not null;
