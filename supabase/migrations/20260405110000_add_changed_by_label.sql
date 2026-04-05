-- Add changed_by_label to store the user's display label at time of change
ALTER TABLE public.roadmap_item_changes
    ADD COLUMN IF NOT EXISTS changed_by_label text;
