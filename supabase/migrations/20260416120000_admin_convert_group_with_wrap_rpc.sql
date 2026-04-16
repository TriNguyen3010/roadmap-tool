-- RPC for converting a group with children to a subcategory in a single
-- transaction. The source group becomes a subcategory at a new location, a
-- fresh wrapper group (same name, inherited group_item_type) is inserted as
-- the sole direct child, and all the source's original children are
-- re-parented under the wrapper.
--
-- Descendant depths are NOT modified: the wrapper occupies the source's old
-- depth slot, so every parent.depth → child.depth relationship is preserved.
-- See spec §4.5.1.
--
-- Inputs
--   p_roadmap_id       — roadmap scope
--   p_item_id          — source group id (will become the subcategory id)
--   p_new_parent_id    — id of the category that will hold the new subcategory
--   p_new_index        — sort_order for the subcategory under the new parent
--   p_wrapper_id       — pre-generated UUID (text) for the wrapper group
--
-- Returns
--   success (bool), error (text). On failure the transaction rolls back.

create or replace function public.admin_convert_group_with_wrap(
    p_roadmap_id text,
    p_item_id text,
    p_new_parent_id text,
    p_new_index integer,
    p_wrapper_id text
) returns table(success boolean, error text)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_source record;
    v_parent record;
    v_new_subcategory_type text;
    v_old_group_item_type text;
    v_now timestamptz := now();
begin
    -- Guard: wrapper id must differ from source id
    if p_wrapper_id = p_item_id then
        return query select false, 'wrapper_id must differ from item_id';
        return;
    end if;

    -- Guard: wrapper id must not already exist in this roadmap
    if exists (
        select 1 from public.roadmap_items
        where roadmap_id = p_roadmap_id and item_id = p_wrapper_id
    ) then
        return query select false, 'wrapper_id already exists';
        return;
    end if;

    -- Load source — must exist and be a group
    select * into v_source
        from public.roadmap_items
        where roadmap_id = p_roadmap_id and item_id = p_item_id;
    if not found then
        return query select false, format('source item "%s" not found', p_item_id);
        return;
    end if;
    if v_source.item_type <> 'group' then
        return query select false, format('source item_type must be group, got %s', v_source.item_type);
        return;
    end if;

    -- Load target parent — must exist and be a category
    select * into v_parent
        from public.roadmap_items
        where roadmap_id = p_roadmap_id and item_id = p_new_parent_id;
    if not found then
        return query select false, format('new parent "%s" not found', p_new_parent_id);
        return;
    end if;
    if v_parent.item_type <> 'category' then
        return query select false, format('new parent type must be category, got %s', v_parent.item_type);
        return;
    end if;

    -- Discriminator mapping: group_item_type → subcategory_type
    -- (Improvement collapses to Feature; other values pass through 1:1.)
    v_old_group_item_type := v_source.group_item_type;
    if v_old_group_item_type = 'Improvement' then
        v_new_subcategory_type := 'Feature';
    else
        v_new_subcategory_type := v_old_group_item_type;
    end if;

    -- Park source at sort_order = -1 so shifts don't collide
    update public.roadmap_items
        set sort_order = -1, updated_at = v_now
        where roadmap_id = p_roadmap_id and item_id = p_item_id;

    -- Shift old-parent siblings down (collapse the gap source leaves behind)
    update public.roadmap_items
        set sort_order = sort_order - 1, updated_at = v_now
        where roadmap_id = p_roadmap_id
            and parent_item_id is not distinct from v_source.parent_item_id
            and sort_order > v_source.sort_order
            and item_id <> p_item_id;

    -- Shift new-parent siblings up (open the slot for source's new subcategory)
    update public.roadmap_items
        set sort_order = sort_order + 1, updated_at = v_now
        where roadmap_id = p_roadmap_id
            and parent_item_id = p_new_parent_id
            and sort_order >= p_new_index
            and item_id <> p_item_id;

    -- Insert wrapper group as a child of the (still-group) source.
    -- Doing this BEFORE the source type change keeps the FK chain valid at
    -- every intermediate step: children point at source (group) until the
    -- very last re-parent step.
    insert into public.roadmap_items (
        roadmap_id, item_id, parent_item_id, sort_order, depth,
        item_type, name, group_item_type, status, status_mode, manual_status,
        progress, phase_ids, created_at, updated_at
    ) values (
        p_roadmap_id, p_wrapper_id, p_item_id, 0, v_source.depth,
        'group', v_source.name, v_old_group_item_type, 'None', 'manual', 'None',
        0, '[]'::jsonb, v_now, v_now
    );

    -- Re-parent the source's original children under the wrapper.
    -- Exclude the wrapper itself (we just inserted it as a child of source).
    update public.roadmap_items
        set parent_item_id = p_wrapper_id, updated_at = v_now
        where roadmap_id = p_roadmap_id
            and parent_item_id = p_item_id
            and item_id <> p_wrapper_id;

    -- Final update on source: retype + new parent + new sort/depth + swap
    -- discriminators + clear group_item_type.
    update public.roadmap_items
        set parent_item_id = p_new_parent_id,
            sort_order = p_new_index,
            depth = (v_parent.depth + 1),
            item_type = 'subcategory',
            subcategory_type = v_new_subcategory_type,
            group_item_type = null,
            updated_at = v_now
        where roadmap_id = p_roadmap_id and item_id = p_item_id;

    return query select true, null::text;
exception
    when others then
        -- The outer transaction will see failure; return structured error so
        -- the caller can log the reason.
        return query select false, sqlerrm;
end;
$$;
