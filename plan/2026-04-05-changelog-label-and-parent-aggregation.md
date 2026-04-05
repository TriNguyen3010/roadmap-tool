# Changelog: Show Label + Parent Item Aggregation

## Context

Hiện tại Change History:
- Cột `changed_by` lưu **email** → hiển thị email trên UI
- Khi mở parent item (group) → không thấy history vì changes chỉ lưu cho team children

## Yêu cầu

1. **Show label thay vì email**: Lưu `changed_by_label` vào bảng `roadmap_item_changes` tại thời điểm thay đổi (Option A — snapshot, không join lúc đọc)
2. **Parent aggregation**: Khi mở EditPopup cho parent item (group/subcategory/category), show tổng hợp changes từ tất cả team children bên dưới

## UI mẫu

### Parent group "Login Feature" (có team children BA, FE, QC)
```
── BA ──────────────────────────────────
Status: Not Started → In Progress       2h ago · BA Manager

── FE ──────────────────────────────────
Status: Not Started → Dev In Progress   1h ago · FE Manager
Start Date: — → 2026-04-01              3h ago · FE Manager

── QC ──────────────────────────────────
End Date: 2026-04-20 → 2026-04-25      30m ago · QC Manager

[Show full history]
```

### Full history
```
FE · Status: Dev In Progress → Dev Done        Apr 4, 14:30 · FE Manager
BA · Status: Not Started → In Progress         Apr 2, 16:00 · BA Manager
QC · End Date: 2026-04-20 → 2026-04-25        Apr 1, 08:30 · QC Manager
```

Mỗi dòng: `Field: old → new    time_ago · label`

---

## Implementation Plan

### Task 1: Migration — thêm cột `changed_by_label`

**File**: `supabase/migrations/20260405110000_add_changed_by_label.sql`

```sql
ALTER TABLE public.roadmap_item_changes
    ADD COLUMN IF NOT EXISTS changed_by_label text;
```

### Task 2: Update write pipeline — lưu label khi insert

**Affected files:**

**`src/server/roadmapRowsRepo.ts`**
- `InsertItemChangeInput` thêm field `changedByLabel: string | null`
- `insertItemChange()` và `insertItemChanges()` thêm `changed_by_label` vào insert object
- `fullDocumentSync()` nhận thêm param `changedByLabel?: string`

**`src/app/api/roadmap/[id]/manager-save/route.ts`**
- Table path: truyền `auth.sessionUser.label` vào `insertItemChange()`
- Legacy JSON path: truyền `auth.sessionUser.label` vào `insertItemChanges()`

**`src/app/api/roadmap/[id]/save/route.ts`**
- Table path: truyền `auth.sessionUser.label` vào `fullDocumentSync()`
- Legacy JSON path: truyền `auth.sessionUser.label` vào `diffDocumentTreeForChangelog()` và `insertItemChanges()`

### Task 3: Update read pipeline — trả về label

**`src/server/roadmapRowsRepo.ts`**
- `ItemChangeRecord` thêm field `changedByLabel: string | null`
- `mapDbRowToChange()` map `changed_by_label`

### Task 4: Parent aggregation — load team children IDs

**`src/server/roadmapRowsRepo.ts`**
- Thêm function `loadTeamChildrenIds(roadmapId, itemId)`:
  - Query `roadmap_items` where `parent_item_id = itemId` AND `item_type = 'team'`
  - Return array of `item_id`
- Sửa `loadLatestChanges(roadmapId, itemId)` → `loadLatestChanges(roadmapId, itemIds: string[])`:
  - Nhận array IDs thay vì 1 ID
  - Query `WHERE item_id IN (itemIds)` thay vì `WHERE item_id = itemId`
- Sửa `loadChangeHistory()` tương tự — nhận array IDs

**`src/app/api/roadmap/[id]/items/[itemId]/changes/route.ts`**
- Detect parent: gọi `loadTeamChildrenIds(roadmapId, itemId)`
  - Nếu có children → query changes cho `[...childIds]`
  - Nếu không có children → query changes cho `[itemId]` (như cũ)

### Task 5: UI — hiển thị label thay email

**`src/components/ChangeHistory.tsx`**
- `ChangeRecord` interface thêm `changedByLabel: string | null`
- Compact view: hiển thị `changedByLabel ?? shortEmail(changedBy)` (fallback email nếu label null — cho records cũ)
- Full history view: tương tự

---

## Key Files

| File | Action |
|------|--------|
| `supabase/migrations/20260405110000_add_changed_by_label.sql` | **NEW** |
| `src/server/roadmapRowsRepo.ts` | **MODIFY** — thêm label vào insert/read, thêm `loadTeamChildrenIds`, sửa query nhận array IDs |
| `src/app/api/roadmap/[id]/manager-save/route.ts` | **MODIFY** — truyền label |
| `src/app/api/roadmap/[id]/save/route.ts` | **MODIFY** — truyền label |
| `src/app/api/roadmap/[id]/items/[itemId]/changes/route.ts` | **MODIFY** — detect parent, resolve item IDs |
| `src/components/ChangeHistory.tsx` | **MODIFY** — show label thay email |

## Notes

- Records cũ (chưa có label) sẽ fallback hiển thị email
- Parent aggregation chỉ đi 1 level xuống (direct children type='team'), không recursive
- Không ảnh hưởng đến save flow hiện tại — chỉ thêm 1 field vào insert
