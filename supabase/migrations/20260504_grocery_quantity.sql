-- Grocery items: optional integer quantity column.
--
-- Captured by the voice have-flow / need-flow when the user
-- volunteers a number ("I have three onions"), by the
-- AddGrocerySheet's optional Qty input, and editable inline in
-- per-store Edit mode.
--
-- NULL means "no quantity specified" (most items). The UI hides
-- the inline `× N` tag when null.
--
-- Idempotent — re-running this migration is safe.

alter table public.grocery_items
  add column if not exists quantity integer;
