create table if not exists public.roadmaps (
    id text primary key,
    release_name text not null,
    start_date text not null default '',
    end_date text not null default '',
    source_version timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.roadmap_items (
    roadmap_id text not null references public.roadmaps(id) on delete cascade,
    item_id text not null,
    parent_item_id text,
    sort_order integer not null default 0,
    depth integer not null default 0,
    item_type text not null,
    name text not null,
    subcategory_type text,
    group_item_type text,
    team_role text,
    status text not null,
    status_mode text,
    manual_status text,
    progress numeric not null default 0,
    start_date text,
    end_date text,
    priority text,
    phase_ids jsonb not null default '[]'::jsonb,
    quick_note text,
    created_at timestamptz,
    updated_at timestamptz,
    primary key (roadmap_id, item_id),
    constraint roadmap_items_parent_fkey
        foreign key (roadmap_id, parent_item_id)
        references public.roadmap_items(roadmap_id, item_id)
        on delete cascade
        deferrable initially deferred
);

create index if not exists roadmap_items_parent_idx
    on public.roadmap_items (roadmap_id, parent_item_id, sort_order);

create index if not exists roadmap_items_updated_idx
    on public.roadmap_items (roadmap_id, updated_at desc nulls last);

create table if not exists public.roadmap_milestones (
    roadmap_id text not null references public.roadmaps(id) on delete cascade,
    milestone_id text not null,
    sort_order integer not null default 0,
    label text not null,
    start_date text not null default '',
    end_date text not null default '',
    color text not null default '#3b82f6',
    primary key (roadmap_id, milestone_id)
);

create index if not exists roadmap_milestones_order_idx
    on public.roadmap_milestones (roadmap_id, sort_order);

create table if not exists public.roadmap_item_images (
    roadmap_id text not null,
    item_id text not null,
    image_id text not null,
    sort_order integer not null default 0,
    image_url text not null,
    image_name text,
    provider text,
    updated_at timestamptz,
    primary key (roadmap_id, item_id, image_id),
    constraint roadmap_item_images_item_fkey
        foreign key (roadmap_id, item_id)
        references public.roadmap_items(roadmap_id, item_id)
        on delete cascade
);

create index if not exists roadmap_item_images_order_idx
    on public.roadmap_item_images (roadmap_id, item_id, sort_order);

create table if not exists public.roadmap_user_settings (
    roadmap_id text not null references public.roadmaps(id) on delete cascade,
    user_scope text not null,
    settings jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    primary key (roadmap_id, user_scope)
);
