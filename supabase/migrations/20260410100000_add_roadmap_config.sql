-- Add per-roadmap configuration (team roles, statuses, etc.)
-- Only used by table-mode roadmaps. JSON-mode roadmaps ignore this.
ALTER TABLE public.roadmaps
  ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';

-- Seed default config for existing table-mode roadmaps
-- so they behave exactly as before (no breaking change).
UPDATE public.roadmaps
SET config = '{
  "teamRoles": ["BA", "Growth", "PD", "BE", "FE", "QC", "DevOps"],
  "teamStatuses": {
    "BA": ["BA Handle", "BA in progress", "BA Done"],
    "PD": ["PD Handle", "PD in progress UI/UX", "PD in progress Visual", "PD Done UI/UX", "PD Done Visual"],
    "FE": ["FE Handle", "FE in progress", "FE Done"],
    "BE": ["BE Handle", "BE in progress", "BE Done"],
    "QC": ["QC Handle", "QC in progress", "QC Done - Staging", "QC Done - Pro"],
    "DevOps": ["DevOps Handle", "DevOps in progress", "DevOps Done"],
    "Growth": ["Growth Handle", "Growth in progress", "Growth Done"]
  },
  "taskStatuses": ["Not Started", "Sếp Vinh", "Task To do", "Task In progress", "Task Pending", "Task Done"]
}'::jsonb
WHERE storage_mode = 'table' AND (config IS NULL OR config = '{}'::jsonb);
