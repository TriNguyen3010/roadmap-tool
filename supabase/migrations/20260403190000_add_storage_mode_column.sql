-- Add storage_mode column to roadmaps table.
-- 'json'  = legacy roadmaps, read/write from roadmap_data.content
-- 'table' = new roadmaps, read/write from normalized tables
--
-- Existing roadmaps default to 'json' (no behavior change).
-- New roadmaps created after this migration will use 'table'.

alter table public.roadmaps
    add column if not exists storage_mode text not null default 'json'
    constraint roadmaps_storage_mode_check check (storage_mode in ('json', 'table'));

-- Also add to roadmap_data for easy lookup without JOIN
alter table public.roadmap_data
    add column if not exists storage_mode text not null default 'json'
    constraint roadmap_data_storage_mode_check check (storage_mode in ('json', 'table'));
