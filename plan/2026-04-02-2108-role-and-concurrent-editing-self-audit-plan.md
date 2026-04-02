# Role And Concurrent Editing Self-Audit Plan

## Mục tiêu

Tạo một checklist audit có thể dùng để:

- tự kiểm tra phần `role / permission` trong code
- tự kiểm tra phần `nhiều người edit cùng lúc / conflict handling`
- xác định rõ chỗ nào đã được bảo vệ tốt
- tìm ra lỗ hổng còn sót trước khi tiếp tục mở rộng collaboration

Plan này không nhằm thay đổi UI mới.
Nó nhằm giúp review lại code hiện tại một cách có hệ thống.

## Phạm vi audit

### Nhóm A - Auth và role resolution

Tập trung vào:

- xác thực user từ Google/Supabase session
- map user -> `team_members`
- phân biệt `admin`, `manager`, `viewer`
- phân biệt `admin-level team` và `roadmap team`

### Nhóm B - Permission gating

Tập trung vào:

- quyền cấp document
- quyền cấp item
- manager chỉ sửa được item đúng team
- manager chỉ sửa đúng field được phép
- admin mới được full-save, patch metadata, upload/delete image, git push, create/delete roadmap

### Nhóm C - Concurrent editing

Tập trung vào:

- stale save bị chặn bằng `baseVersion`
- client conflict UX
- dirty tracking
- refresh/navigation safety
- same-user cross-tab awareness
- realtime invalidation

### Nhóm D - Row-based normalized sync

Tập trung vào:

- dual-write từ `roadmap_data` sang row tables
- backfill consistency
- mismatch detection giữa JSON blob và normalized tables

## File cần audit

### Auth / role

- [serverTeamAuth.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/lib/serverTeamAuth.ts)
- [auth.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/types/auth.ts)
- [useGoogleAuth.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/hooks/useGoogleAuth.ts)

### Permission logic

- [permissions.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/permissions.ts)
- [permissionCheck.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/permissionCheck.ts)
- [SpreadsheetGrid.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/components/SpreadsheetGrid.tsx)
- [page.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/app/roadmap/[id]/page.tsx)

### Save / conflict

- [roadmapSaveFlow.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/roadmapSaveFlow.ts)
- [roadmapConcurrency.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/roadmapConcurrency.ts)
- [roadmapSaveTelemetry.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/roadmapSaveTelemetry.ts)
- [save route](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/app/api/roadmap/[id]/save/route.ts)
- [manager-save route](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/app/api/roadmap/[id]/manager-save/route.ts)
- [roadmap patch route](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/app/api/roadmap/[id]/route.ts)
- [legacy save route](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/app/api/roadmap/save/route.ts)

### Tests hiện có

- [permissions.test.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/permissions.test.ts)
- [permissionCheck.test.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/permissionCheck.test.ts)
- [roadmapConcurrency.test.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/roadmapConcurrency.test.ts)
- [roadmapSaveFlow.test.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/roadmapSaveFlow.test.ts)
- [save.route.test.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/app/api/roadmap/save.route.test.ts)

### Normalized row sync

- [roadmapRows.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/roadmapRows.ts)
- [roadmapRows.test.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/roadmapRows.test.ts)
- [create normalized tables migration](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/supabase/migrations/20260402210500_create_normalized_roadmap_tables.sql)
- [dual-write migration](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/supabase/migrations/20260402214500_enable_normalized_roadmap_dual_write.sql)
- [backfill script](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/scripts/backfill-roadmap-rows.mjs)

## Audit theo phase

## Phase 1 - Read audit cho auth và role

### Câu hỏi cần trả lời

- user email được lấy từ đâu ở browser và ở API?
- server có lookup lại `team_members` độc lập hay tin vào client?
- `isAdminLevel()` có đúng semantics business hiện tại không?
- `manager` team có đang bị lẫn với `SepVinh / PM` hay không?

### Checklist

- đọc [serverTeamAuth.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/lib/serverTeamAuth.ts)
- đọc [auth.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/types/auth.ts)
- xác nhận mọi route nhạy cảm đều dùng `authenticateAdminRequest()` hoặc `authenticateTeamRequest()`
- liệt kê route nào vẫn thiếu auth guard nếu có

### Done when

- có bảng mapping rõ:
  - route nào yêu cầu admin
  - route nào cho manager
  - route nào public read

## Phase 2 - Read audit cho permission

### Câu hỏi cần trả lời

- manager có bị edit item ngoài team không?
- manager có bị edit structure không?
- manager có bị edit milestone / release meta / upload image / git push không?
- permission ở UI có khớp permission ở server không?

### Checklist

- audit [permissions.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/permissions.ts)
- audit [permissionCheck.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/permissionCheck.ts)
- đối chiếu với các control trong [SpreadsheetGrid.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/components/SpreadsheetGrid.tsx)
- đối chiếu với save path trong [page.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/app/roadmap/[id]/page.tsx)

### Done when

- có danh sách rõ:
  - permission nào được enforce ở UI
  - permission nào được enforce ở API
  - permission nào đang chỉ là “ẩn nút” nhưng chưa có server enforcement

## Phase 3 - Static audit cho concurrent editing

### Câu hỏi cần trả lời

- tất cả save path đã gửi `baseVersion` chưa?
- route nào vẫn có nguy cơ stale write?
- dirty tracking có bị sót ở mutation nào không?
- local draft backup có được giữ khi conflict / refresh / logout / back-to-home không?

### Checklist

- đọc các route save/patch
- đối chiếu các mutation path trong [page.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/app/roadmap/[id]/page.tsx):
  - full save
  - manager patch save
  - milestone patch save
  - release-meta patch save
  - apply phase dates
  - load JSON
  - refresh latest
- đánh dấu mutation nào set `hasUnsavedSharedChanges`
- đánh dấu mutation nào clear dirty state

### Done when

- có danh sách “save path matrix” gồm:
  - endpoint
  - payload
  - version check
  - dirty handling
  - conflict handling

## Phase 4 - Dynamic test matrix cho role

### Môi trường

- 1 admin account
- 2 manager account khác team
- nếu có thể thêm 1 viewer account

### Case cần test

1. admin mở roadmap, tạo/sửa/xoá/reorder item -> phải pass
2. manager FE sửa status/date/note item FE -> phải pass
3. manager FE sửa item BE -> phải fail
4. manager FE sửa structure -> phải fail
5. manager FE sửa milestone -> phải fail
6. manager FE đổi release name -> phải fail
7. manager FE upload/delete image -> phải fail
8. manager FE git push / create roadmap / delete roadmap -> phải fail

### Evidence cần ghi

- response status
- toast/message hiển thị
- log server nếu có
- screenshot khi case fail/pass quan trọng

### Done when

- mọi role-sensitive action đều được xác nhận cả ở UI lẫn API

## Phase 5 - Dynamic test matrix cho concurrent editing

### Môi trường

- 2 browser session độc lập
- 2 tab cùng user
- 1 admin + 1 manager cùng roadmap

### Case cần test

1. admin A mở roadmap, admin B sửa và lưu trước, admin A lưu stale -> A phải nhận `409`
2. manager A sửa item team mình, manager B sửa trước cùng roadmap -> A stale save phải bị chặn
3. tab 1 lưu thành công, tab 2 cùng user phải thấy stale banner nhanh
4. roadmap bị update từ session khác, local tab đang dirty -> refresh phải cảnh báo và giữ backup local
5. user logout khi dirty -> phải được confirm và giữ draft backup
6. user back home khi dirty -> phải được confirm và giữ draft backup
7. conflict xong tải lại bản mới nhất -> state phải sạch và version phải cập nhật

### Evidence cần ghi

- server response `409`
- `pendingRemoteVersion`
- `conflict draft` trong session storage
- structured log từ [roadmapSaveTelemetry.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/roadmapSaveTelemetry.ts)

### Done when

- không còn case stale save “âm thầm thành công”
- không còn case refresh/logout/home làm mất local changes mà không cảnh báo

## Phase 6 - Verify normalized row sync

### Câu hỏi cần trả lời

- dual-write trigger có chạy thật sau mỗi save không?
- counts giữa JSON blob và row tables có còn khớp sau khi edit không?
- milestone patch và release-meta patch có sync sang row tables đúng không?

### Checklist

- chạy query count theo từng roadmap
- sửa thử:
  - release name
  - milestone
  - manager field patch
  - full-save item structure
- sau mỗi lần sửa, so:
  - `roadmap_data.content`
  - `roadmaps`
  - `roadmap_items`
  - `roadmap_milestones`
  - `roadmap_item_images`

### Done when

- không có mismatch sau các thao tác save chính

## Lệnh nên dùng khi audit

```bash
npm test
npm run build
npx eslint 'src/app/roadmap/[id]/page.tsx' \
  'src/app/api/roadmap/[id]/save/route.ts' \
  'src/app/api/roadmap/[id]/manager-save/route.ts' \
  'src/app/api/roadmap/[id]/route.ts'
```

```bash
set -a; source .env.local >/dev/null 2>&1; set +a; npm run backfill:roadmap-rows
```

## Query verify nên chạy

### 1. So số lượng roadmap

```sql
select
  (select count(*) from roadmap_data) as roadmap_data_count,
  (select count(*) from roadmaps) as roadmaps_count;
```

### 2. So item count theo roadmap

```sql
select roadmap_id, count(*) as item_count
from roadmap_items
group by roadmap_id
order by roadmap_id;
```

### 3. So milestone count theo roadmap

```sql
select roadmap_id, count(*) as milestone_count
from roadmap_milestones
group by roadmap_id
order by roadmap_id;
```

### 4. So image count theo roadmap

```sql
select roadmap_id, count(*) as image_count
from roadmap_item_images
group by roadmap_id
order by roadmap_id;
```

## Output mong muốn sau audit

Sau khi làm plan này, cần tạo được 1 report tổng kết gồm:

- phần role nào pass
- phần role nào còn hở
- conflict path nào pass
- conflict path nào còn rủi ro
- normalized sync có mismatch hay không
- khuyến nghị fix theo severity

## Tiêu chí hoàn tất

Plan này được xem là hoàn tất khi:

- đã chạy hết matrix test cho role
- đã chạy hết matrix test cho concurrent editing
- đã verify normalized sync sau các thao tác save chính
- đã có report cuối cùng đủ để quyết định:
  - có thể tiếp tục bật collaboration rộng hơn hay chưa
  - có thể flip read path sang row tables hay chưa
