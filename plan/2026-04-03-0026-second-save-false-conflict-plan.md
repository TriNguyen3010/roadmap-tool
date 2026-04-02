# Second Save False Conflict Plan

## Mục tiêu

Xử lý bug:

1. chỉnh lần 1 -> save thành công
2. chỉnh lần 2 -> save báo "có bản mới hơn"
3. tải bản mới nhất -> chỉnh lại -> save được

Kỳ vọng sau khi fix:

- sau một lần save thành công, local session phải chuyển sang đúng `version` mới ngay
- lần save kế tiếp trong cùng session không bị false conflict nếu không có ai khác thật sự vừa cập nhật roadmap

## Hiện tượng cần xử lý

Bug này trông giống lỗi `stale-version` giả.

Triệu chứng cho thấy:

- server nhận lần save đầu là hợp lệ
- local sau đó vẫn bị đánh dấu là "đang cầm version cũ"
- nhưng khi reload bản mới nhất thì save lại được

Điều đó thường xảy ra khi **version state ở client đã được update một phần**, nhưng một luồng khác vẫn tiếp tục gắn cờ `pendingRemoteVersion` hoặc conflict banner sau save.

## Hiện trạng code

Qua kiểm tra [page.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/app/roadmap/[id]/page.tsx):

- `hydrateRoadmap()` đã set `currentVersionRef.current = version`
- `handleSave()` sau save thành công cũng set `currentVersionRef.current = latestVersion`
- `handleManagerFieldChanges()` sau save thành công cũng set `currentVersionRef.current = payload.updatedAt`
- `handleMilestonesSave()` cũng làm tương tự

Nghĩa là giả thuyết "client không update version sau save" **có thể không phải nguyên nhân trực tiếp**.

Các nguồn đang có khả năng tự đánh dấu local là stale sau save:

- `BroadcastChannel` sync giữa các tab
- polling `checkRemoteVersion()`
- Supabase Realtime invalidation

Đặc biệt, `saveInFlightRef.current` hiện chỉ chặn invalidation **trong lúc request đang bay**. Nếu event realtime đến muộn, sau khi `finally` đã set `saveInFlightRef.current = false`, local vẫn có thể bị gắn `pendingRemoteVersion` dù event đó thực chất là từ chính lần save vừa xong.

## Nhận định kỹ thuật hiện tại

Hướng nghi ngờ mạnh nhất:

- save thành công
- client đã nhận `updatedAt` mới
- nhưng một invalidation event đến sau đó vẫn set `pendingRemoteVersion`
- lần save kế tiếp bị `ensureCanSaveCurrentVersion()` chặn vì app nghĩ remote đã mới hơn local

Nói cách khác:

- bug có khả năng nằm ở **post-save invalidation flow**
- không nằm ở riêng dòng update `currentVersionRef`

## Phase 1 - Reproduce và khoanh đúng nguồn stale

### Việc cần làm

- thêm log tạm thời cho 4 điểm:
  - save success
  - `BroadcastChannel.onmessage`
  - `checkRemoteVersion()`
  - realtime handler
- log các giá trị:
  - `baseVersion`
  - `payload.updatedAt`
  - `currentVersionRef.current`
  - `pendingRemoteVersion`
  - thời điểm `saveInFlightRef` chuyển `true/false`

### Mục tiêu

Xác nhận chính xác sau lần save đầu tiên thì stale flag đến từ:

- broadcast
- poll
- realtime
- hay một save path khác

### Done when

- có thể chỉ rõ nguồn nào làm local bị đánh dấu stale ở lần chỉnh thứ 2

## Phase 2 - Chuẩn hóa "version vừa save thành công"

### Việc cần làm

- thêm một nguồn sự thật rõ ràng cho lần save thành công gần nhất, ví dụ:
  - `lastAcceptedVersionRef`
  - hoặc `lastLocalSaveVersionRef`
- sau mỗi save thành công:
  - update `currentVersionRef.current`
  - update ref "just saved"
  - clear `pendingRemoteVersion`
  - clear `dismissedVersion`
  - clear conflict state

### Mục tiêu

Khi client vừa save xong, app phải biết chắc:

- version nào là version mới nhất local đã chấp nhận
- mọi invalidation trùng với version đó không được coi là "remote mới hơn"

### Done when

- save thành công xong không còn case local tự coi version mới của chính mình là stale

## Phase 3 - Chặn self-invalidations sau save

### Việc cần làm

- siết điều kiện trong các nguồn invalidation:
  - `BroadcastChannel`
  - polling version route
  - realtime payload
- chỉ set `pendingRemoteVersion` khi `incomingVersion` thực sự **mới hơn** version local hiện tại
- bỏ qua event nếu:
  - version bằng `currentVersionRef.current`
  - version bằng `lastAcceptedVersionRef`
  - event đến trong cửa sổ hậu-save ngắn của chính local save

### Gợi ý kỹ thuật

- gom logic so sánh version vào một helper dùng chung thay vì mỗi nơi tự quyết định
- nếu cần, thêm "self-save grace window" rất ngắn để chặn event phản hồi muộn từ chính lần save vừa xong
- ưu tiên compare theo timestamp chuẩn hóa thay vì so string thô

### Done when

- invalidation chỉ bật khi có update thật từ remote hoặc tab khác với version mới hơn local

## Phase 4 - Verify đầy đủ các save path

### Các flow cần test

- full save admin
- manager field save
- milestones patch
- release meta patch
- các flow auto-save hoặc save qua edit popup

### Các case cần verify

1. save lần 1 thành công, save lần 2 tiếp tục thành công trong cùng tab
2. save 2 lần liên tiếp với khoảng cách rất ngắn
3. save xong rồi poll/realtime đến sau
4. 2 tab cùng user:
   - tab A save
   - tab A sửa tiếp và save lại
   - tab B thấy invalidation
5. 2 user khác nhau:
   - user A save
   - user B stale save phải bị chặn thật

### Done when

- false conflict biến mất
- true conflict vẫn còn được chặn đúng

## Phase 5 - Regression coverage

### Việc cần làm

- thêm unit test cho helper compare/suppress invalidation
- thêm test cho state transition:
  - save success -> update current version
  - delayed invalidation cùng version -> ignore
  - invalidation version mới hơn thật -> show pending remote version
- nếu phù hợp, thêm route/client integration test cho case "save twice in same session"

### Done when

- bug này có regression test để không quay lại nữa

## File dự kiến chạm

- [page.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/app/roadmap/[id]/page.tsx)
- [roadmapConcurrency.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/roadmapConcurrency.ts)
- [save.route.test.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/app/api/roadmap/save.route.test.ts)
- các test mới cho version/invalidation flow nếu cần

## Kết quả mong đợi

Sau khi hoàn tất plan này:

- user không còn phải "tải bản mới nhất" chỉ vì vừa save thành công ở ngay lần trước
- conflict banner chỉ xuất hiện khi remote thực sự mới hơn local
- app vẫn giữ được bảo vệ `409 conflict` cho case nhiều người sửa cùng lúc thật
