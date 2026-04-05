# Change Tracking (Audit Log)

## Context

Hiện tại hệ thống không lưu lại lịch sử thay đổi. Khi manager hoặc admin edit item, dữ liệu cũ bị ghi đè mà không biết ai đã đổi, đổi gì, khi nào. Tính năng này sẽ ghi lại toàn bộ thay đổi ở mức field-level.

## DB Schema

### Migration: `roadmap_item_changes`

```sql
CREATE TABLE public.roadmap_item_changes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    roadmap_id  text NOT NULL REFERENCES public.roadmaps(id) ON DELETE CASCADE,
    item_id     text NOT NULL,
    team        text,                 -- team role (BA, FE, BE, etc.) for grouping
    field       text NOT NULL,        -- 'status', 'startDate', 'endDate', 'quickNote', 'name', etc.
    old_value   text,
    new_value   text,
    changed_by  text NOT NULL,        -- email
    changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ric_item ON public.roadmap_item_changes(roadmap_id, item_id, changed_at DESC);
CREATE INDEX idx_ric_latest ON public.roadmap_item_changes(roadmap_id, item_id, team, field, changed_at DESC);
```

### Column addition: `updated_by`

```sql
ALTER TABLE public.roadmap_items ADD COLUMN IF NOT EXISTS updated_by text;
```

## Write Changelog

### Manager Save (`/api/roadmap/[id]/manager-save`)

Already has per-field changes in the request body. After each successful `updateItemFields()`:

```typescript
// In the changes loop, after updateItemFields succeeds:
await insertItemChange(roadmapId, {
    itemId: change.itemId,
    team: managerTeam,
    field: change.field,
    oldValue: String(previousValue),
    newValue: String(change.value),
    changedBy: auth.sessionUser.email,
});
```

- `previousValue` obtained by reading the item row **before** applying the patch.
- `team` = `managerTeam` (auth-verified).

### Admin Save (`/api/roadmap/[id]/save`)

Admin save is full-document sync. Changes are detected during diff:

```typescript
// In fullDocumentSync, when detecting changed fields:
for (const changedField of changedFields) {
    await insertItemChange(roadmapId, {
        itemId: row.id,
        team: resolveItemTeamFromRow(row, existingRows),
        field: changedField,
        oldValue: String(existingRow[changedField]),
        newValue: String(row[changedField]),
        changedBy: email, // passed from route handler
    });
}
```

- `email` parameter added to `fullDocumentSync(roadmapId, document, email)`.
- Team resolved from item's `teamRole` or ancestor chain.

## Repository Functions

**File**: `src/server/roadmapRowsRepo.ts`

```typescript
// Insert a single change record
async function insertItemChange(roadmapId: string, change: {
    itemId: string;
    team: string | null;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    changedBy: string;
}): Promise<void>

// Load latest change per (team, field) for an item — default view
async function loadLatestChanges(roadmapId: string, itemId: string): Promise<ItemChangeRecord[]>
// SQL: DISTINCT ON (team, field) WHERE field IN ('status','startDate','endDate')
//      ORDER BY team, field, changed_at DESC

// Load full paginated history for an item
async function loadChangeHistory(
    roadmapId: string,
    itemId: string,
    options?: { limit?: number; offset?: number; team?: string }
): Promise<{ changes: ItemChangeRecord[]; total: number }>
```

## API Endpoints

### GET `/api/roadmap/[id]/items/[itemId]/changes`

Query params:
- `mode=latest` (default) — latest change per team/field (3 key fields only)
- `mode=full` — full history, supports `limit`, `offset`, `team`

Response (latest mode):
```json
{
    "changes": [
        {
            "team": "FE",
            "field": "status",
            "oldValue": "Not Started",
            "newValue": "In Progress",
            "changedBy": "dev@example.com",
            "changedAt": "2026-04-04T10:30:00Z"
        },
        {
            "team": "FE",
            "field": "startDate",
            "oldValue": null,
            "newValue": "2026-04-01",
            "changedBy": "dev@example.com",
            "changedAt": "2026-04-03T09:00:00Z"
        }
    ]
}
```

Response (full mode):
```json
{
    "changes": [...],
    "total": 42,
    "limit": 20,
    "offset": 0
}
```

## UI Design

**Location**: EditPopup component — new "History" tab or section at bottom.

### Default View (Compact)

Grouped by team. Per team, show only the fields (Status, Start Date, End Date) that have actually been changed. If a field was never changed → hidden entirely.

**Email hiển thị per dòng** — mỗi field có thể do người khác nhau thay đổi, nên luôn show email riêng cho từng dòng, không gộp chung per team block.

```
── FE ──────────────────────────────────
Status: Not Started → In Progress    2h ago · alice@example.com
Start Date: — → 2026-04-01           1d ago · bob@example.com

── BE ──────────────────────────────────
End Date: 2026-04-10 → 2026-04-15    3h ago · pm@example.com
```

- If a team has zero changes across all 3 fields → team block hidden entirely.
- Each row: `field: old → new    time_ago · who` — email per dòng (không gộp chung).
- "Show full history" button at bottom.

### Full History View (Expanded)

Loads on "Show full history" click. Paginated list, all fields, chronological (newest first).

```
FE · Status: Not Started → In Progress    Apr 4, 10:30 · dev@example.com
FE · Start Date: — → 2026-04-01           Apr 3, 09:00 · dev@example.com
BE · End Date: 2026-04-10 → 2026-04-15    Apr 4, 13:15 · pm@example.com
FE · Quick Note: — → "Blocked by API"     Apr 2, 16:00 · dev@example.com
```

- Load 20 per page, "Load more" button.

## Implementation Steps

### Task 1: Migration
**File**: `supabase/migrations/YYYYMMDD_create_roadmap_item_changes.sql`
- Create `roadmap_item_changes` table
- Add `updated_by` to `roadmap_items`
- Create indexes

### Task 2: Repository layer
**File**: `src/server/roadmapRowsRepo.ts`
- `insertItemChange()`
- `loadLatestChanges()`
- `loadChangeHistory()`

### Task 3: Write changelog in manager-save
**File**: `src/app/api/roadmap/[id]/manager-save/route.ts`
- Before `updateItemFields()`: load current item values
- After successful update: call `insertItemChange()` for each changed field
- Pass `auth.sessionUser.email` as `changedBy`

### Task 4: Write changelog in admin save
**File**: `src/server/roadmapRowsRepo.ts` (modify `fullDocumentSync`)
- Add `email` parameter
- During diff detection, call `insertItemChange()` for changed fields
**File**: `src/app/api/roadmap/[id]/save/route.ts`
- Pass `auth.sessionUser.email` to `fullDocumentSync()`

### Task 5: API endpoint for reading changes
**File**: `src/app/api/roadmap/[id]/items/[itemId]/changes/route.ts` (NEW)
- GET handler with `mode` query param
- Auth check (any authenticated user can read)

### Task 6: UI — Change history in EditPopup
**File**: `src/components/EditPopup.tsx` (MODIFY)
- Add history section/tab
- Fetch from changes API on item select
- Render default compact view (grouped by team, only changed fields)
- "Show full history" button → paginated full view

## Key Files

| File | Action |
|------|--------|
| `supabase/migrations/YYYYMMDD_create_roadmap_item_changes.sql` | NEW |
| `src/server/roadmapRowsRepo.ts` | MODIFY — add change functions |
| `src/app/api/roadmap/[id]/manager-save/route.ts` | MODIFY — write changelog |
| `src/app/api/roadmap/[id]/save/route.ts` | MODIFY — pass email |
| `src/app/api/roadmap/[id]/items/[itemId]/changes/route.ts` | NEW |
| `src/components/EditPopup.tsx` | MODIFY — history UI |

## Client Changes

- EditPopup gets a new section for change history
- New API call to fetch changes (lazy loaded on popup open)
- No changes to save flow — changelog is written server-side transparently
