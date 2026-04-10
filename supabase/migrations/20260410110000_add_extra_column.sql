-- Add extra JSONB column for custom per-roadmap fields on items.
-- Items on roadmaps without custom columns will have extra = '{}' (no impact).
ALTER TABLE public.roadmap_items
  ADD COLUMN IF NOT EXISTS extra JSONB DEFAULT '{}';
