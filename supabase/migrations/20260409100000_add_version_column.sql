-- Add version column to roadmap_items for tracking release/version assignment
ALTER TABLE public.roadmap_items ADD COLUMN IF NOT EXISTS version TEXT DEFAULT NULL;
