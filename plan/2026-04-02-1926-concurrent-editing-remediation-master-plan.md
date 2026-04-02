# Concurrent Editing Remediation Master Plan

## Mục tiêu

Xử lý **toàn bộ các vấn đề chính** đã nêu trong:

- `plan/2026-04-02-1803-concurrent-editing-risk-report.md`
- `plan/2026-04-02-1920-table-vs-json-concurrent-safety-report.md`

Bao gồm:

- chống mất dữ liệu khi nhiều người cùng save
- giảm conflict giữa admin và manager
- tách shared UI state khỏi business data
- cải thiện UX khi có conflict
- thêm test và quan sát hệ thống
- xác định lộ trình nâng cấp từ JSON blob sang row-based tables

## Kết luận chiến lược

Không nên làm một big-bang rewrite ngay.

Hướng thực dụng nhất là đi theo **2 tầng**:

### Tầng 1 - Stabilize mô hình hiện tại

Vẫn giữ `roadmap_data.content` dạng JSON trong ngắn hạn, nhưng thêm:

- optimistic concurrency
- conflict handling
- tách user settings
- cross-tab / realtime awareness cơ bản
- test coverage

Mục tiêu là giảm rủi ro mất dữ liệu **ngay lập tức** mà không cần migrate schema lớn.

### Tầng 2 - Chuyển dần sang row-based architecture

Khi tầng 1 đã ổn, migrate sang:

- `roadmaps`
- `roadmap_items`
- `roadmap_milestones`
- `roadmap_item_images`
- `roadmap_user_settings`

Mục tiêu là giải quyết tận gốc vấn đề concurrent editing và mở đường cho collaboration tốt hơn.

## Vấn đề cần xử lý

### Nhóm A - Data loss / conflict

- admin full-save đè document cũ
- manager-save vẫn có race condition
- save API không kiểm tra `baseVersion`

### Nhóm B - Shared state bị đè nhau

- filter
- timeline mode
- timeline only
- expanded rows
- hidden rows
- column widths

### Nhóm C - UX conflict còn yếu

- banner chỉ là cảnh báo mềm
- refresh hiện tại làm mất local edit chưa lưu
- không có diff / reload flow rõ ràng

### Nhóm D - Awareness / sync còn yếu

- không có cross-tab sync
- không có realtime invalidation tốt

### Nhóm E - Test / observability còn thiếu

- chưa có test conflict
- chưa có telemetry rõ cho save conflict

### Nhóm F - Kiến trúc lưu trữ dài hạn chưa phù hợp multi-user

- JSON blob quá lớn
- write scope quá rộng
- khó row-level concurrency

## End State mong muốn

Khi hoàn tất plan này, hệ thống cần đạt:

1. stale save bị chặn ở server bằng `409 Conflict`
2. client không thể âm thầm ghi đè bản mới hơn
3. user settings không còn lưu chung với shared roadmap business data
4. cùng một user mở nhiều tab không tự đè dữ liệu của mình
5. server có test cho conflict paths
6. kiến trúc có đường chuyển rõ sang row-based tables

## Phase 0 - Baseline và chuẩn bị

### Mục tiêu

Đóng đinh lại semantics của save hiện tại và chuẩn bị nền để thêm concurrency control.

### Việc cần làm

- định nghĩa chuẩn `DocumentVersion = roadmap_data.updated_at`
- xác định mọi điểm gọi save:
  - admin full save
  - manager field save
  - save view
  - save milestones
  - apply phase dates
  - edit item
  - reorder
- thống nhất response save:
  - `200 success`
  - `401`
  - `403`
  - `409 conflict`
  - `500`

### File dự kiến chạm

- `src/app/roadmap/[id]/page.tsx`
- `src/app/api/roadmap/[id]/save/route.ts`
- `src/app/api/roadmap/[id]/manager-save/route.ts`

### Done when

- có contract rõ cho save/version/conflict
- không còn endpoint save nào “ngoại lệ” không đi qua version logic

## Phase 1 - Optimistic concurrency cho mô hình JSON hiện tại

### Mục tiêu

Ngăn stale write trong mô hình hiện tại mà chưa cần migrate schema.

### Việc cần làm

#### 1. Client gửi `baseVersion`

Mỗi save request phải gửi thêm:

- `baseVersion = currentVersionRef.current`

Áp dụng cho:

- `/save`
- `/manager-save`

#### 2. Server chỉ cho save nếu version còn khớp

Server cần:

1. đọc `updated_at` hiện tại
2. so với `baseVersion`
3. nếu lệch -> trả `409 Conflict`

Hướng nên dùng:

- `update ... where id = ? and updated_at = ?`
- không dùng upsert mù cho các route chỉnh sửa

#### 3. Chuẩn hóa payload conflict

Server trả:

```json
{
  "error": "Conflict",
  "code": "VERSION_MISMATCH",
  "serverVersion": "...",
  "message": "Roadmap đã được cập nhật bởi người khác."
}
```

### Vấn đề được xử lý

- admin full-save đè mất thay đổi người khác
- manager race condition dạng stale overwrite
- banner warning không còn là tuyến phòng thủ duy nhất

### Rủi ro

- vẫn chưa merge tự động
- user sẽ gặp `409` thường xuyên hơn nếu nhiều người cùng sửa

### Done when

- stale admin save bị reject
- stale manager save bị reject
- không còn case save snapshot cũ thành công âm thầm

## Phase 2 - Conflict UX an toàn hơn

### Mục tiêu

Khi conflict xảy ra, user không bị mất local work một cách mù mờ.

### Việc cần làm

#### 1. Thay `window.location.reload()` bằng conflict dialog

Dialog cần có ít nhất:

- `Tải bản mới nhất`
- `Sao chép nội dung local`
- `Đóng`

Nếu local đang dirty:

- cảnh báo rõ là refresh sẽ bỏ local changes chưa lưu

#### 2. Dirty tracking rõ ràng

Track:

- `hasUnsavedChanges`
- `hasConflict`
- `lastSuccessfulVersion`

#### 3. Chặn save khi đang có conflict chưa resolve

Nếu client đã biết `pendingRemoteVersion` mới hơn `currentVersionRef.current`:

- disable save
- hoặc buộc resolve conflict trước

#### 4. Local safety backup

Khi gặp `409`, lưu tạm local draft vào:

- `sessionStorage`
- hoặc memory snapshot có thể recover

### Vấn đề được xử lý

- refresh làm mất local edit chưa lưu
- conflict UX khó hiểu
- user vẫn save tiếp dù đã biết remote mới hơn

### Done when

- không còn hard reload mù
- user hiểu rõ đang conflict và có đường an toàn để tiếp tục

## Phase 3 - Tách user settings khỏi shared roadmap document

### Mục tiêu

Loại bỏ loại conflict “vớ vẩn nhưng đau” do layout/filter bị ghi đè lẫn nhau.

### Việc cần làm

#### 1. Chia rõ 2 nhóm dữ liệu

##### Shared business data

- release name
- items
- milestones

##### User preference

- filter
- timeline mode
- timeline only
- beforeWeeks / afterMonths
- expandedIds
- hiddenRowIds
- column widths

#### 2. Chọn nơi lưu

Ưu tiên:

- giai đoạn đầu: `localStorage`
- giai đoạn sau: `roadmap_user_settings`

#### 3. Bỏ save settings khỏi full document save

`buildDocumentSnapshot()` không nên tiếp tục nhét toàn bộ view settings vào shared document.

#### 4. Migrate backward compatibility

Khi load:

- nếu document cũ còn có `settings`
- map sang local/user settings một lần
- sau đó không dùng shared settings cũ nữa

### Vấn đề được xử lý

- admin A và admin B đè filter/layout của nhau
- same roadmap nhưng mỗi người cần một view riêng

### Done when

- business data save không còn kéo theo view settings
- 2 user có thể dùng 2 view khác nhau mà không phá nhau

## Phase 4 - Củng cố save model trên JSON trước khi migrate

### Mục tiêu

Thu nhỏ write scope tối đa trong kiến trúc hiện tại.

### Việc cần làm

#### 1. Giảm bớt full-save nơi không cần thiết

Tách admin save theo intent:

- `saveStructure`
- `saveMilestones`
- `saveReleaseMeta`
- `saveBulkItemChanges`

Không phải mọi thao tác đều nên đi qua 1 full document snapshot.

#### 2. Với manager-save, vẫn giữ patch hẹp

Nhưng chuẩn hóa:

- validate field
- apply changes
- version-check
- save conditionally

#### 3. Với các thao tác bulk

Ví dụ:

- reorder
- apply phase dates
- delete subtree

cần có:

- payload rõ ràng
- baseVersion rõ ràng
- transaction / save unit rõ ràng

### Vấn đề được xử lý

- write scope quá rộng
- khó reasoning conflict

### Done when

- save model không còn phụ thuộc quá nhiều vào “full snapshot”

## Phase 5 - Cross-tab sync và realtime invalidation

### Mục tiêu

Giảm khả năng user làm việc trên state cũ quá lâu.

### Việc cần làm

#### 1. Cross-tab sync bằng `BroadcastChannel`

Khi một tab save thành công:

- broadcast `roadmap-updated`
- tab khác cùng roadmap nhận được và cập nhật banner ngay

#### 2. Realtime invalidation qua Supabase

Không nhất thiết phải realtime collaborative editing đầy đủ ngay.

Mức tối thiểu:

- subscribe thay đổi `roadmap_data.updated_at`
- nếu row roadmap hiện tại đổi -> mark stale ngay

#### 3. Giảm phụ thuộc vào poll 20 giây

Poll có thể giữ làm fallback, nhưng không nên là cơ chế chính duy nhất.

### Vấn đề được xử lý

- 2 tab của cùng user tự đè nhau
- awareness quá chậm
- poll 20s quá thô

### Done when

- tab khác biết có bản mới gần như ngay
- poll chỉ còn là fallback

## Phase 6 - Test và quan sát hệ thống

### Mục tiêu

Biến concurrent editing từ “niềm tin” thành behavior có test.

### Việc cần làm

#### 1. Unit/integration test cho save conflict

Case tối thiểu:

1. admin save với `baseVersion` cũ -> `409`
2. manager save với `baseVersion` cũ -> `409`
3. save đúng version -> `200`
4. conflict payload có `serverVersion`

#### 2. Test cho shared settings separation

Case:

- user A đổi filter
- shared roadmap data không bị thay đổi

#### 3. E2E multi-session cơ bản

Nếu thêm Playwright:

- session A sửa
- session B sửa stale snapshot
- B bị conflict

#### 4. Logging / telemetry

Track:

- số lần conflict
- endpoint nào conflict nhiều nhất
- thời gian từ load đến conflict

### Done when

- conflict flow có test
- có dữ liệu để biết hệ thống có đang ổn hơn không

## Phase 7 - Thiết kế normalized row-based schema

### Mục tiêu

Chuẩn bị end-state phù hợp multi-user hơn mô hình JSON blob.

### Bảng đích

#### `roadmaps`

- metadata cấp roadmap

#### `roadmap_items`

- mỗi task / category / group / team / item là 1 row
- có `parent_id`
- có `sort_order`
- có `updated_at`
- có `version`

#### `roadmap_milestones`

- row riêng cho từng milestone

#### `roadmap_item_images`

- ảnh tách riêng khỏi item payload

#### `roadmap_user_settings`

- user-scoped view state

### Quyết định kỹ thuật cần chốt

- tree query strategy
- reorder strategy
- subtree delete strategy
- derived status/progress tính ở đâu
- permission enforce ở API hay DB hay cả hai

### Done when

- schema được review xong
- migration path được chốt
- không còn mơ hồ ở `parent_id / sort_order / version`

## Phase 8 - Dual-write và migration sang tables

### Mục tiêu

Chuyển dần từ JSON sang rows mà không làm gãy app.

### Việc cần làm

#### 1. Backfill

Viết script:

- đọc `roadmap_data.content`
- tách ra `roadmaps`, `roadmap_items`, `roadmap_milestones`, `roadmap_item_images`

#### 2. Dual-write tạm thời

Trong giai đoạn chuyển tiếp:

- write cả JSON blob và row tables
- so sánh output

#### 3. Read adapter

Client tạm thời vẫn có thể cần tree shape cũ.

Server có thể:

- read rows
- build lại tree JSON shape để không phải rewrite UI toàn bộ ngay

#### 4. Flip read source

Khi dual-write ổn:

- đổi read chính sang tables
- giữ JSON làm fallback ngắn hạn

### Done when

- read path chính chạy từ tables
- JSON blob không còn là source of truth

## Phase 9 - Row-level patch APIs

### Mục tiêu

Khai thác lợi thế concurrency của table model thay vì chỉ đổi storage.

### Việc cần làm

#### 1. Item-level update endpoints

Ví dụ:

- update status
- update quick note
- update dates
- update item meta

Mỗi endpoint update đúng row cần thiết.

#### 2. Conditional row update

Mỗi item update cần kiểm tra:

- `version`
- hoặc `updated_at`

#### 3. Bulk transaction APIs

Cho:

- reorder siblings
- move subtree
- delete subtree
- apply phase dates

### Vấn đề được xử lý

- write scope quá rộng
- conflict toàn-document
- table migration nhưng vẫn snapshot-save

### Done when

- item-level updates không còn đè nhau nếu sửa khác row
- conflict được cô lập đúng theo row / operation

## Phase 10 - Cleanup và deprecate cơ chế cũ

### Mục tiêu

Dọn kiến trúc cũ sau khi hệ mới ổn định.

### Việc cần làm

- bỏ save path full-snapshot không còn dùng
- bỏ shared document settings cũ
- bỏ JSON blob khỏi source of truth
- update docs / setup / test

### Done when

- codebase không còn song song 2 logic cũ mới quá lâu

## Ưu tiên triển khai thực tế

Nếu phải chia thành các mốc làm việc khả thi:

### Milestone A - Chặn mất dữ liệu ngay

Gồm:

- Phase 1
- phần quan trọng của Phase 2

Kết quả:

- stale save bị chặn
- user không còn ghi đè âm thầm

### Milestone B - Loại bỏ conflict do view settings

Gồm:

- Phase 3

Kết quả:

- giảm mạnh conflict không cần thiết

### Milestone C - Awareness và test

Gồm:

- Phase 5
- Phase 6

Kết quả:

- conflict hiếm bị bỏ sót hơn
- có dữ liệu đo lường

### Milestone D - Chuẩn bị migration lớn

Gồm:

- Phase 7
- Phase 8
- Phase 9

Kết quả:

- hệ thống tiến tới row-based collaboration đúng nghĩa

## Thứ tự khuyến nghị

Thứ tự tối ưu:

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 6
5. Phase 5
6. Phase 7
7. Phase 8
8. Phase 9
9. Phase 10

## Những gì không nên làm

- không rewrite toàn bộ sang tables ngay từ đầu
- không thêm realtime trước khi có conflict enforcement
- không giữ shared user settings trong shared document lâu hơn cần thiết
- không để full-save tiếp tục là default path cho mọi thao tác

## Kết luận cuối

Nếu mục tiêu là **xử lý hết các vấn đề trong report**, thì plan đúng không phải chỉ là “thêm realtime” hoặc “đổi sang table”.

Plan đúng là:

1. chặn stale write ngay trên mô hình hiện tại
2. tách shared state sai chỗ
3. cải thiện UX conflict và sync awareness
4. thêm test
5. sau đó mới migrate sang row-based model với row-level patch thực sự

Đây là lộ trình vừa thực dụng, vừa xử lý được cả vấn đề ngắn hạn lẫn gốc rễ dài hạn.
