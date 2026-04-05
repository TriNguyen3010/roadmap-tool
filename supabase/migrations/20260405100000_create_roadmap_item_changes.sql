-- Change tracking (audit log) for roadmap items
-- Records field-level changes: who changed what, when, old→new value

CREATE TABLE IF NOT EXISTS public.roadmap_item_changes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    roadmap_id  text NOT NULL REFERENCES public.roadmaps(id) ON DELETE CASCADE,
    item_id     text NOT NULL,
    team        text,                   -- team role (BA, FE, BE, etc.) for grouping
    field       text NOT NULL,          -- 'status', 'startDate', 'endDate', 'quickNote', etc.
    old_value   text,
    new_value   text,
    changed_by  text NOT NULL,          -- email of the person who made the change
    changed_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for loading all changes of an item (full history)
CREATE INDEX idx_ric_item
    ON public.roadmap_item_changes(roadmap_id, item_id, changed_at DESC);

-- Index for loading latest change per (team, field) — default compact view
CREATE INDEX idx_ric_latest
    ON public.roadmap_item_changes(roadmap_id, item_id, team, field, changed_at DESC);

-- Add updated_by to roadmap_items for tracking last editor
ALTER TABLE public.roadmap_items
    ADD COLUMN IF NOT EXISTS updated_by text;
