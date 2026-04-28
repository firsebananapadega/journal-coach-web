-- One-time backfill: convert the JSONB `daily_priorities.groceries`
-- blob into the normalized grocery_lists / grocery_groups / grocery_items
-- tables. Mirrors the carry-forward semantics in priorityStore.fetchPriorities
-- (take each user's most-recent date with a non-empty groceries array).
--
-- Idempotent: re-running is a no-op for any user who already has an
-- active_grocery_list_id pointing at a backfilled list.

do $$
declare
  r record;
  v_list_id uuid;
  v_group jsonb;
  v_item  jsonb;
  v_group_id uuid;
  v_sort int;
begin
  for r in
    select distinct on (dp.user_id)
      dp.user_id,
      dp.groceries,
      p.display_name
    from public.daily_priorities dp
    join public.profiles p on p.id = dp.user_id
    where dp.groceries is not null
      and jsonb_typeof(dp.groceries) = 'array'
      and jsonb_array_length(dp.groceries) > 0
      and (p.active_grocery_list_id is null)
    order by dp.user_id, dp.date desc
  loop
    -- Create the list (trigger auto-adds the owner as a member).
    insert into public.grocery_lists (owner_id, name)
      values (r.user_id, 'Groceries')
      returning id into v_list_id;

    update public.profiles set active_grocery_list_id = v_list_id where id = r.user_id;

    -- Each blob entry: { id, store, items: [{ id, name, completed }] }
    v_sort := 0;
    for v_group in select * from jsonb_array_elements(r.groceries)
    loop
      insert into public.grocery_groups (list_id, store, sort_order)
        values (v_list_id, coalesce(v_group->>'store', 'General'), v_sort)
        returning id into v_group_id;
      v_sort := v_sort + 1;

      if v_group ? 'items' and jsonb_typeof(v_group->'items') = 'array' then
        for v_item in select * from jsonb_array_elements(v_group->'items')
        loop
          insert into public.grocery_items
            (id, list_id, group_id, name, completed, added_by, sort_order)
          values
            (gen_random_uuid(),
             v_list_id,
             v_group_id,
             coalesce(v_item->>'name', '(unnamed)'),
             coalesce((v_item->>'completed')::boolean, false),
             r.user_id,
             0)
          on conflict (group_id, lower(name)) where completed = false do nothing;
        end loop;
      end if;
    end loop;
  end loop;
end $$;
