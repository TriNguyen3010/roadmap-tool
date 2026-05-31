# Backup All Table-Mode Roadmaps — Design

**Date:** 2026-05-26
**Status:** Approved
**Author:** TriNguyen (with Claude)

## Problem

Hệ thống backup hiện tại (`data/dump-prod-scheduled.sh`, chạy daily 6 AM qua launchd) chỉ dump **một** roadmap có ID hardcoded (`a8335e0e-55ec-42c9-920f-d64c32825cc8`). Các roadmap khác ở mode `table` không có local backup, dẫn đến rủi ro mất dữ liệu nếu production gặp sự cố hoặc cần rollback.

Mục tiêu: extend backup chạy cho **tất cả** roadmap có `storage_mode = 'table'` trong production, mỗi roadmap có file SQL riêng, archive theo ngày, và có UI hiển thị trạng thái aggregate cộng với chi tiết per-roadmap.

## Goals

- Backup tất cả table-mode roadmap mỗi ngày, không phụ thuộc hardcoded ID.
- Mỗi roadmap có file SQL riêng để dễ restore từng cái độc lập.
- 1 roadmap fail không làm gãy job — các roadmap khác vẫn được backup.
- UI:
  - Banner global (mọi trang khi chạy localhost): aggregate "X/Y OK" + timestamp.
  - Trang `/roadmap/[id]`: hiển thị thông tin backup của roadmap đó (timestamp, file size, status).
- Backup bao gồm cả audit log (`roadmap_item_changes`) để khôi phục đầy đủ lịch sử thay đổi.

## Non-Goals

- Không retry tự động khi fail (chỉ log + đánh dấu trong `last-dump.json`).
- Không alert ra ngoài (Slack/email). Chỉ banner UI.
- Không thay đổi schedule launchd (giữ 6 AM hằng ngày).
- Không cleanup file dump cũ (vẫn giữ forever như hiện tại).
- Không backup roadmap mode `json` (đã được dump qua route khác, ngoài scope).
- Không thay đổi luồng backup cho production (chỉ là client-side mirror về local).

## Current State

### Scripts
- `data/dump-prod.sh <roadmap_id>` — Fetch 1 roadmap qua Supabase REST API, gen file SQL `data/dump-${roadmap_id}.sql`. Dump 6 bảng:
  1. `roadmaps` (metadata, filter `id=eq.<roadmap_id>`)
  2. `roadmap_items` (paginated, filter `roadmap_id=eq.<roadmap_id>`)
  3. `roadmap_milestones`
  4. `roadmap_item_images`
  5. `roadmap_user_settings`
  6. `team_members` (full table, không filter)
- `data/dump-prod-scheduled.sh` — Wrapper chạy bởi launchd. Hardcoded `ROADMAP_ID`. Call `dump-prod.sh`, archive vào `data/dumps/${TODAY}.sql`, import vào local Docker Supabase, ghi `data/last-dump.json`.

### Schedule
- `data/com.roadmap.dump-prod.plist` — launchd plist, trigger 6 AM hằng ngày.

### UI
- `src/components/LocalBackupBanner.tsx` — Poll `/api/last-dump` mỗi load page (chỉ render khi `window.location.hostname === 'localhost'`). Hiện 1 dòng compact: timestamp + fileSize + elapsed + status.
- `src/app/api/last-dump/route.ts` — Đọc và trả `data/last-dump.json`.

### last-dump.json (current shape)
```json
{
  "timestamp": "2026-05-25T23:03:51Z",
  "timestampLocal": "2026-05-26 06:03:51",
  "roadmapId": "a8335e0e-55ec-42c9-920f-d64c32825cc8",
  "status": "success",
  "fileSize": "368K",
  "elapsed": "45s"
}
```

## Design

### 1. Discovery — Query danh sách table-mode roadmap

Trong `data/dump-prod-scheduled.sh`, trước khi loop:

```bash
DISCOVER_FILE="${TMPDIR}/roadmap-ids.json"
curl -s \
  "${PROD_URL}/rest/v1/roadmaps?storage_mode=eq.table&select=id,release_name" \
  -H "apikey: ${PROD_SERVICE_KEY}" \
  -H "Authorization: Bearer ${PROD_SERVICE_KEY}" \
  > "$DISCOVER_FILE"
```

Parse JSON ra array `(id, release_name)` bằng Python inline. Log số lượng tìm được.

Lưu ý:
- Nếu discovery fail (HTTP error, JSON parse error) → exit job với `status: "discovery_failed"` trong `last-dump.json`, vì không biết list để loop.
- Nếu list rỗng → exit OK, ghi `summary: {total: 0, success: 0, failed: 0}`.

### 2. Loop per roadmap

```bash
mkdir -p "$DUMPS_DIR/$TODAY"  # data/dumps/2026-05-26/

SUCCESS_LIST=()  # mỗi entry: id|release_name|fileSize|elapsed
FAILED_LIST=()   # mỗi entry: id|release_name|error

for RID in $ROADMAP_IDS; do
    RELEASE=...  # lookup từ discovery
    START=$(date +%s)
    if bash data/dump-prod.sh "$RID" >> "$LOG_FILE" 2>&1; then
        SRC="data/dump-${RID}.sql"
        ARCHIVE="$DUMPS_DIR/$TODAY/${RID}.sql"
        cp "$SRC" "$ARCHIVE"
        SIZE=$(du -h "$ARCHIVE" | cut -f1)
        # Import vào local
        if "$DOCKER_PATH" exec -i "$LOCAL_CONTAINER" psql -U postgres -d postgres < "$SRC" >> "$LOG_FILE" 2>&1; then
            ELAPSED=$(($(date +%s) - START))
            SUCCESS_LIST+=("$RID|$RELEASE|$SIZE|${ELAPSED}s")
        else
            FAILED_LIST+=("$RID|$RELEASE|import_failed")
        fi
    else
        FAILED_LIST+=("$RID|$RELEASE|dump_failed")
    fi
done
```

**Error isolation:** mỗi roadmap chạy trong sub-shell qua `bash data/dump-prod.sh`. Lỗi trong 1 roadmap không gãy loop. `set -euo pipefail` ở top-level chỉ áp dụng cho scheduled.sh, không cho child bash.

**Concurrency:** chạy tuần tự (serial). Đơn giản, ổn định, tổng thời gian = sum × ~30-60s mỗi roadmap. Với <20 roadmap thì OK.

### 3. Extend `dump-prod.sh` để dump `roadmap_item_changes`

Trong `dump-prod.sh`, thêm:

**Fetch (step 3):**
```bash
fetch_paginated "roadmap_item_changes" "roadmap_id=eq.${ROADMAP_ID}" "${TMPDIR_DUMP}/changes.json"
```
(Dùng paginated vì audit log có thể nhiều rows. Order theo `id` ASC để stable pagination — tránh new inserts làm shift offset.)

**SQL gen (Python block):**
- Load `changes.json`.
- Thêm `DELETE FROM public.roadmap_item_changes WHERE roadmap_id = ...;` (đặt trước DELETE roadmap_items để tránh FK issue, nếu có FK).
- INSERT từng row với toàn bộ cột: `id, roadmap_id, item_id, change_type, field_name, old_value, new_value, changed_by, changed_by_label, changed_at, snapshot`.
- Quyết định columns dựa trên schema migration `20260405100000_create_roadmap_item_changes.sql` và `20260405110000_add_changed_by_label.sql`.

**FK order:** `roadmap_item_changes` reference `roadmap_id`. Vì script đã `SET CONSTRAINTS ALL DEFERRED` trong transaction, thứ tự DELETE/INSERT giữa các bảng không quan trọng — Postgres check FK ở COMMIT.

### 4. Archive layout

```
data/dumps/
  2026-05-25/
    a8335e0e-55ec-42c9-920f-d64c32825cc8.sql
    b9117a00-....sql
    c022bf00-....sql
  2026-05-26/
    a8335e0e-55ec-42c9-920f-d64c32825cc8.sql
    b9117a00-....sql
    c022bf00-....sql
```

File flat cũ (`data/dumps/2026-04-09.sql` etc.) **không được migrate**. Vẫn để nguyên dưới `data/dumps/` cho human reference. Logic chỉ ghi mới vào subdir theo ngày.

### 5. New `last-dump.json` shape

```json
{
  "timestamp": "2026-05-26T23:03:51Z",
  "timestampLocal": "2026-05-26 06:03:51",
  "elapsed": "180s",
  "summary": {
    "total": 5,
    "success": 5,
    "failed": 0
  },
  "roadmaps": [
    {
      "roadmapId": "a8335e0e-55ec-42c9-920f-d64c32825cc8",
      "releaseName": "AI Roadmap Q2",
      "status": "success",
      "fileSize": "368K",
      "elapsed": "45s"
    },
    {
      "roadmapId": "b9117a00-...",
      "releaseName": "Demo",
      "status": "failed",
      "error": "dump_failed"
    }
  ]
}
```

Trường hợp discovery fail:
```json
{
  "timestamp": "...",
  "timestampLocal": "...",
  "elapsed": "5s",
  "status": "discovery_failed",
  "error": "Could not fetch roadmap list from production",
  "summary": { "total": 0, "success": 0, "failed": 0 },
  "roadmaps": []
}
```

### 6. UI Changes

**`/api/last-dump/route.ts`** — handler không đổi (vẫn đọc nguyên file JSON).

**`LocalBackupBanner.tsx` (global)** — Update interface và render:

```ts
interface RoadmapBackup {
  roadmapId: string;
  releaseName: string;
  status: 'success' | 'failed';
  fileSize?: string;
  elapsed?: string;
  error?: string;
}

interface DumpInfo {
  timestamp: string;
  timestampLocal: string;
  elapsed: string;
  summary: { total: number; success: number; failed: number };
  roadmaps: RoadmapBackup[];
  status?: string; // 'discovery_failed' nếu có
  error?: string;
}
```

Render:
- Nếu `status === 'discovery_failed'` → đỏ, "Backup discovery failed: <error>".
- Nếu `summary.total === 0` → ẩn (hoặc neutral note).
- Nếu `summary.failed === 0` → green: `Local Backup: 2026-05-26 06:03 · ${summary.success}/${summary.total} OK · ${elapsed}`.
- Nếu `summary.failed > 0` → red: `Local Backup: 2026-05-26 06:03 · ${summary.success}/${summary.total} OK · ${summary.failed} failed`.

**Backward compat (legacy shape):** nếu response thiếu `summary` nhưng có `roadmapId` (old shape) → render như cũ (single roadmap status). Tránh crash giữa lúc transition.

**`RoadmapBackupInfo.tsx` (new component)** — Hiển thị trên trang `/roadmap/[id]`:

```tsx
'use client';
import { useEffect, useState } from 'react';

interface Props { roadmapId: string }

export function RoadmapBackupInfo({ roadmapId }: Props) {
  // chỉ render localhost
  // fetch /api/last-dump, filter roadmaps[].roadmapId === roadmapId
  // nếu không tìm thấy → ẩn
  // render compact line: timestamp + size + status
}
```

Mount trong `src/app/roadmap/[id]/page.tsx` ở header area, sau `LocalBackupBanner` (banner aggregate ở trên cùng, info per-roadmap ngay dưới).

### 7. Update `package.json` scripts (optional)

Nếu hiện có `npm run dump:prod`, giữ nguyên (vẫn pass single ID). Thêm:
- `dump:all` → `bash data/dump-prod-scheduled.sh` (chạy manual full backup).

### 8. Files Changed

| File | Type | Change |
|---|---|---|
| `data/dump-prod.sh` | modified | Add fetch + SQL gen cho `roadmap_item_changes` |
| `data/dump-prod-scheduled.sh` | modified | Discovery query + loop, per-roadmap archive subdir, aggregate `last-dump.json` |
| `src/components/LocalBackupBanner.tsx` | modified | Render aggregate summary, backward-compat với legacy shape |
| `src/components/RoadmapBackupInfo.tsx` | new | Per-roadmap backup status, dùng trên trang roadmap |
| `src/app/roadmap/[id]/page.tsx` | modified | Mount `RoadmapBackupInfo` |
| `src/app/api/last-dump/route.ts` | unchanged | Handler trả nguyên JSON |
| `data/last-dump.json` | overwritten on next run | New shape |

### 9. Schema dependencies

Verify trước khi triển khai:
- Schema `roadmap_item_changes` có cột nào (read migration files).
- Có FK nào từ `roadmap_item_changes` đến `roadmap_items.id` không — quyết định thứ tự DELETE.
- Có cột `id` PRIMARY KEY trong `roadmap_item_changes` không (cần cho INSERT nếu non-default).

### 10. Testing Plan

**Manual:**
1. Chạy `bash data/dump-prod-scheduled.sh` local. Verify:
   - Discovery query trả list roadmap có `storage_mode = 'table'`.
   - Tạo `data/dumps/<TODAY>/<roadmap_id>.sql` cho từng roadmap.
   - `data/last-dump.json` có shape mới.
   - Import vào local Docker Supabase OK (`docker exec ... psql ...`).
2. Chạy local dev server, mở 2 trang:
   - Trang `/` (hoặc home) → `LocalBackupBanner` hiển thị aggregate "X/Y OK".
   - Trang `/roadmap/<id>` → thấy thêm `RoadmapBackupInfo` cho roadmap đó.
3. Test failure isolation: tạm thời break 1 roadmap (vd. dùng invalid filter trong dump-prod.sh) → verify các roadmap khác vẫn dump OK, banner hiện "X/Y OK · 1 failed" màu đỏ.

**Edge cases:**
- 0 table-mode roadmap → banner ẩn hoặc neutral.
- Discovery query fail (network) → banner đỏ "discovery_failed".
- Legacy `last-dump.json` còn ở local → UI không crash (backward compat).

## Rollout

1. Implement & test local.
2. Run `bash data/dump-prod-scheduled.sh` 1 lần manually để generate new `last-dump.json` shape.
3. Verify UI hiển thị đúng.
4. Để launchd tự chạy 6 AM ngày tiếp theo, verify log.

Không cần coordinate với teammate vì script chỉ chạy trên máy local của tri.nguyen@classicspins.com.

## Open Questions

Không có. Tất cả decision đã chốt trong brainstorming.
