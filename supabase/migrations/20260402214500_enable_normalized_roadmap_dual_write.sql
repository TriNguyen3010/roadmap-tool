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
        updated_at
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
        nullif(item_tree.node ->> 'updated_at', '')::timestamptz
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

create or replace function public.sync_roadmap_data_to_normalized_tables()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public.apply_normalized_roadmap_from_content(new.id, new.content, new.updated_at);
    return new;
end;
$$;

create or replace function public.delete_normalized_roadmap_from_roadmap_data()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    delete from public.roadmaps where id = old.id;
    return old;
end;
$$;

drop trigger if exists roadmap_data_dual_write_trigger on public.roadmap_data;
create trigger roadmap_data_dual_write_trigger
after insert or update of content, updated_at on public.roadmap_data
for each row
execute function public.sync_roadmap_data_to_normalized_tables();

drop trigger if exists roadmap_data_dual_delete_trigger on public.roadmap_data;
create trigger roadmap_data_dual_delete_trigger
after delete on public.roadmap_data
for each row
execute function public.delete_normalized_roadmap_from_roadmap_data();

create or replace function public.backfill_normalized_roadmaps()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    roadmap_row record;
    processed_count integer := 0;
begin
    for roadmap_row in
        select id, content, updated_at
        from public.roadmap_data
        order by updated_at asc nulls first, id asc
    loop
        perform public.apply_normalized_roadmap_from_content(roadmap_row.id, roadmap_row.content, roadmap_row.updated_at);
        processed_count := processed_count + 1;
    end loop;

    return jsonb_build_object(
        'processed', processed_count,
        'completedAt', now()
    );
end;
$$;
