-- Phase 1: Schema Hardening for Table-Based Storage
-- Adds missing columns and prepares normalized tables to be the source of truth.

-- 1. Add assigned_teams and team_statuses columns to roadmap_items
alter table public.roadmap_items
    add column if not exists assigned_teams jsonb,
    add column if not exists team_statuses jsonb;

-- 2. Add updated_at column to roadmap_milestones
alter table public.roadmap_milestones
    add column if not exists updated_at timestamptz not null default now();

-- 3. Add check constraint on item_type
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'roadmap_items_item_type_check'
    ) then
        alter table public.roadmap_items
            add constraint roadmap_items_item_type_check
            check (item_type in ('category', 'subcategory', 'group', 'team', 'item'));
    end if;
end $$;

-- 4. Update apply_normalized_roadmap_from_content() to extract assignedTeams and teamStatuses
create or replace function public.apply_normalized_roadmap_from_content(
    p_roadmap_id text,
    p_content jsonb,
    p_source_version timestamptz default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.roadmaps (
        id,
        release_name,
        start_date,
        end_date,
        source_version,
        updated_at
    )
    values (
        p_roadmap_id,
        coalesce(nullif(trim(p_content ->> 'releaseName'), ''), 'Untitled Roadmap'),
        coalesce(p_content ->> 'startDate', ''),
        coalesce(p_content ->> 'endDate', ''),
        p_source_version,
        now()
    )
    on conflict (id) do update set
        release_name = excluded.release_name,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        source_version = excluded.source_version,
        updated_at = now();

    delete from public.roadmap_item_images where roadmap_id = p_roadmap_id;
    delete from public.roadmap_milestones where roadmap_id = p_roadmap_id;
    delete from public.roadmap_items where roadmap_id = p_roadmap_id;

    with recursive item_tree as (
        select
            root_item.node,
            null::text as parent_item_id,
            (root_item.ordinality - 1)::integer as sort_order,
            0::integer as depth
        from jsonb_array_elements(coalesce(p_content -> 'items', '[]'::jsonb)) with ordinality as root_item(node, ordinality)

        union all

        select
            child_item.node,
            item_tree.node ->> 'id' as parent_item_id,
            (child_item.ordinality - 1)::integer as sort_order,
            item_tree.depth + 1
        from item_tree
        cross join lateral jsonb_array_elements(coalesce(item_tree.node -> 'children', '[]'::jsonb)) with ordinality as child_item(node, ordinality)
    )
    insert into public.roadmap_items (
        roadmap_id,
        item_id,
        parent_item_id,
        sort_order,
        depth,
        item_type,
        name,
        subcategory_type,
        group_item_type,
        team_role,
        status,
        status_mode,
        manual_status,
        progress,
        start_date,
        end_date,
        priority,
        phase_ids,
        quick_note,
        created_at,
        updated_at,
        assigned_teams,
        team_statuses
    )
    select
        p_roadmap_id,
        item_tree.node ->> 'id',
        item_tree.parent_item_id,
        item_tree.sort_order,
        item_tree.depth,
        coalesce(item_tree.node ->> 'type', 'item'),
        coalesce(item_tree.node ->> 'name', ''),
        nullif(item_tree.node ->> 'subcategoryType', ''),
        nullif(item_tree.node ->> 'groupItemType', ''),
        nullif(item_tree.node ->> 'teamRole', ''),
        coalesce(item_tree.node ->> 'status', 'None'),
        nullif(item_tree.node ->> 'statusMode', ''),
        nullif(item_tree.node ->> 'manualStatus', ''),
        case
            when nullif(item_tree.node ->> 'progress', '') is null then 0
            else (item_tree.node ->> 'progress')::numeric
        end,
        nullif(item_tree.node ->> 'startDate', ''),
        nullif(item_tree.node ->> 'endDate', ''),
        nullif(item_tree.node ->> 'priority', ''),
        coalesce(item_tree.node -> 'phaseIds', '[]'::jsonb),
        nullif(item_tree.node ->> 'quickNote', ''),
        nullif(item_tree.node ->> 'created_at', '')::timestamptz,
        nullif(item_tree.node ->> 'updated_at', '')::timestamptz,
        case when item_tree.node -> 'assignedTeams' is not null
             then item_tree.node -> 'assignedTeams'
             else null end,
        case when item_tree.node -> 'teamStatuses' is not null
             then item_tree.node -> 'teamStatuses'
             else null end
    from item_tree
    where coalesce(item_tree.node ->> 'id', '') <> ''
    order by item_tree.depth asc, item_tree.sort_order asc, item_tree.node ->> 'id';

    insert into public.roadmap_milestones (
        roadmap_id,
        milestone_id,
        sort_order,
        label,
        start_date,
        end_date,
        color
    )
    select
        p_roadmap_id,
        coalesce(nullif(milestone.node ->> 'id', ''), 'phase_' || milestone.ordinality::text),
        (milestone.ordinality - 1)::integer,
        coalesce(nullif(milestone.node ->> 'label', ''), 'Week ' || milestone.ordinality::text),
        coalesce(milestone.node ->> 'startDate', ''),
        coalesce(milestone.node ->> 'endDate', ''),
        coalesce(nullif(milestone.node ->> 'color', ''), '#3b82f6')
    from jsonb_array_elements(coalesce(p_content -> 'milestones', '[]'::jsonb)) with ordinality as milestone(node, ordinality);

    with recursive item_tree as (
        select
            root_item.node
        from jsonb_array_elements(coalesce(p_content -> 'items', '[]'::jsonb)) as root_item(node)

        union all

        select
            child_item.node
        from item_tree
        cross join lateral jsonb_array_elements(coalesce(item_tree.node -> 'children', '[]'::jsonb)) as child_item(node)
    ),
    image_rows as (
        select
            p_roadmap_id as roadmap_id,
            item_tree.node ->> 'id' as item_id,
            image.node ->> 'id' as image_id,
            (image.ordinality - 1)::integer as sort_order,
            image.node ->> 'url' as image_url,
            nullif(image.node ->> 'name', '') as image_name,
            nullif(image.node ->> 'provider', '') as provider,
            nullif(image.node ->> 'updatedAt', '')::timestamptz as updated_at
        from item_tree
        cross join lateral jsonb_array_elements(coalesce(item_tree.node -> 'images', '[]'::jsonb)) with ordinality as image(node, ordinality)
        where coalesce(image.node ->> 'id', '') <> ''
          and coalesce(image.node ->> 'url', '') <> ''

        union all

        select
            p_roadmap_id,
            item_tree.node ->> 'id',
            item_tree.node ->> 'imageId',
            0,
            item_tree.node ->> 'imageUrl',
            nullif(item_tree.node ->> 'imageName', ''),
            nullif(item_tree.node ->> 'imageProvider', ''),
            nullif(item_tree.node ->> 'imageUpdatedAt', '')::timestamptz
        from item_tree
        where jsonb_array_length(coalesce(item_tree.node -> 'images', '[]'::jsonb)) = 0
          and coalesce(item_tree.node ->> 'imageId', '') <> ''
          and coalesce(item_tree.node ->> 'imageUrl', '') <> ''
    )
    insert into public.roadmap_item_images (
        roadmap_id,
        item_id,
        image_id,
        sort_order,
        image_url,
        image_name,
        provider,
        updated_at
    )
    select
        image_rows.roadmap_id,
        image_rows.item_id,
        image_rows.image_id,
        image_rows.sort_order,
        image_rows.image_url,
        image_rows.image_name,
        image_rows.provider,
        image_rows.updated_at
    from image_rows;
end;
$$;

-- 5. Add reverse dual-write guard to the forward sync trigger
-- This prevents infinite loop when we write JSON blob back from rows
create or replace function public.sync_roadmap_data_to_normalized_tables()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Skip forward sync when reverse dual-write is in progress
    if current_setting('app.skip_forward_dual_write', true) = 'true' then
        return new;
    end if;
    perform public.apply_normalized_roadmap_from_content(new.id, new.content, new.updated_at);
    return new;
end;
$$;
