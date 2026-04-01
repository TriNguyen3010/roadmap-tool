# Plan: Timeline Only - Ẩn phần thông tin task nhưng vẫn nhận diện được task

## Mục tiêu
- Thêm 1 nút để chuyển sang chế độ `Timeline Only`.
- Khi bật mode này, ẩn hoàn toàn phần thông tin task ở pane bên trái, chỉ còn timeline ở pane bên phải.
- Dù đã ẩn pane thông tin, user vẫn phải biết rõ mỗi dòng đang là task nào.
- Giữ thao tác bật/tắt mode đơn giản, dễ hiểu, không làm vỡ các filter/view hiện có.

## Vấn đề hiện tại
- Layout hiện tại chia làm 2 pane:
  - pane trái chứa ID, tên task, worktype, priority, status, week, date, actions
  - pane phải chứa timeline
- Nếu chỉ ẩn pane trái mà không bổ sung cơ chế nhận diện trong pane timeline:
  - user sẽ không biết mỗi bar thuộc task nào
  - các dòng chưa có date có thể thành dòng trống gần như không đọc được
- Hệ thống hiện đã có cơ chế lưu `settings` của view, nên mode mới cần đi theo luồng này để giữ state sau reload/save.

## Phạm vi
Bao gồm:
1. Thêm state và persistence cho mode `Timeline Only`.
2. Thêm nút toggle để bật/tắt mode này từ toolbar.
3. Khi bật mode:
   - collapse hoàn toàn pane trái
   - timeline chiếm toàn bộ bề ngang phần content
4. Thêm cơ chế nhận diện task ngay trong timeline pane.
5. Giữ tương thích với save/load settings, JSON backup, reload trang.

Không bao gồm:
- Thiết kế lại toàn bộ giao diện timeline.
- Thay đổi logic filter dữ liệu.
- Thay đổi `Reported mode` trong vòng này ngoài việc xử lý tương thích hiển thị nếu cần.

## Định nghĩa UX cần đạt
### 1. Hành vi của nút
- Nút có thể đặt tên `Timeline Only` hoặc `Hide Task Info`.
- Là toggle 2 trạng thái:
  - `OFF`: giao diện hiện tại
  - `ON`: chỉ còn timeline
- Khi tắt mode, layout quay lại đúng trạng thái pane trái trước đó.

### 2. Hành vi khi bật `Timeline Only`
- Pane trái biến mất hoàn toàn, không để lại cột ID, action hay vùng trống.
- Pane timeline mở rộng full chiều ngang phần content.
- Header timeline giữ nguyên như hiện tại.

### 3. Cách đảm bảo vẫn biết task nào là task gì
- Không dựa vào tooltip alone vì tooltip là thông tin phụ, không đủ cho scan nhanh.
- Cần hiển thị nhãn task trực tiếp trong timeline pane.
- Phương án đề xuất:
  - mỗi dòng timeline có 1 `name chip` hoặc `sticky label` bám mép trái viewport của pane timeline
  - label ưu tiên hiển thị `row.name`
  - nếu có thể, kèm thêm metadata ngắn như `status` hoặc `week`, nhưng tên task phải là ưu tiên số 1
- Với dòng có bar quá ngắn:
  - vẫn giữ label task ở mép trái timeline, không cố nhét full text vào trong bar
- Với dòng chưa có date:
  - vẫn render label task trên dòng đó để user không bị mất ngữ cảnh
  - có thể thêm trạng thái phụ kiểu `No date`

### 4. Tương thích với mode khác
- `Reported mode` là layout riêng.
- Trong vòng này nên chốt 1 trong 2 hướng:
  - Ẩn/disable nút `Timeline Only` khi đang ở `Reported mode`
  - Hoặc giữ nút nhưng không cho bật ở `Reported mode`
- Khuyến nghị: disable hoặc ẩn để tránh chồng layout khác mục đích.

## File dự kiến tác động
- `src/types/roadmap.ts`
- `src/app/roadmap/[id]/page.tsx`
- `src/components/Toolbar.tsx`
- `src/components/SpreadsheetGrid.tsx`

## Kế hoạch triển khai
### Bước 1: Bổ sung setting cho mode mới
- File: `src/types/roadmap.ts`
- Thêm field mới trong `RoadmapDocument.settings`, ví dụ:
  - `timelineOnly?: boolean`
- Mục tiêu:
  - có schema rõ ràng cho save/load
  - tránh nhét state tạm không được persist

### Bước 2: Nối state ở page container
- File: `src/app/roadmap/[id]/page.tsx`
- Tạo state mới cho mode `timelineOnly`.
- Khi load roadmap:
  - đọc `settings.timelineOnly` nếu có
- Khi build snapshot để save:
  - ghi `timelineOnly` vào `settings`
- Khi load JSON:
  - đọc và apply field này giống các setting view khác

### Bước 3: Thêm nút toggle trên Toolbar
- File: `src/components/Toolbar.tsx`
- Bổ sung props:
  - `isTimelineOnly`
  - `onToggleTimelineOnly`
- Đặt nút ở khu vực controls chính, gần filter/view buttons để user đổi mode nhanh.
- UX:
  - active state rõ ràng
  - tooltip/copy ngắn giải thích:
    - `Ẩn toàn bộ thông tin task, chỉ giữ timeline`

### Bước 4: Collapse hoàn toàn pane trái trong SpreadsheetGrid
- File: `src/components/SpreadsheetGrid.tsx`
- Bổ sung prop `timelineOnly`.
- Khi `timelineOnly = true`:
  - không render pane trái
  - timeline pane render full width
  - bỏ phụ thuộc vào `totalLeftW` cho layout chính
- Không dùng cách hide lần lượt từng cột vì:
  - vẫn còn header/actions thừa
  - khó restore đúng view cũ
  - không thật sự là “hide hoàn toàn phần thông tin task”

### Bước 5: Thêm label nhận diện task trong timeline pane
- File: `src/components/SpreadsheetGrid.tsx`
- Thêm 1 lớp label riêng trong mỗi dòng timeline:
  - label đặt ở mép trái pane timeline, sticky theo scroll ngang
  - nội dung chính là `row.name`
- Rule hiển thị đề xuất:
  1. Luôn ưu tiên tên task.
  2. Nếu đủ chỗ, mới thêm metadata ngắn như status hoặc end date.
  3. Với row không có bar, vẫn hiện label task.
- Mục tiêu:
  - user nhìn timeline-only vẫn scan được danh sách task
  - không cần rê chuột mới hiểu đang xem gì

### Bước 6: Chỉnh text trong bar để không cạnh tranh với tên task
- File: `src/components/SpreadsheetGrid.tsx`
- Hiện tại label trong bar thiên về `status`, `end date`, `workdays`.
- Khi có `timelineOnly`, cần ưu tiên hierarchy:
  - tên task là lớp nhận diện chính
  - status/date là phụ
- Có thể giữ tooltip hiện tại cho chi tiết sâu hơn.

### Bước 7: Rà ảnh hưởng lên scroll, sticky và click behavior
- Kiểm tra scroll dọc giữa pane trái/phải khi pane trái bị ẩn.
- Kiểm tra sticky label của task không che mất today line hoặc bar tooltip.
- Kiểm tra click bar, hover info, expand/collapse rows vẫn hoạt động hợp lý.

### Bước 8: Test
1. Bật `Timeline Only` -> pane trái biến mất hoàn toàn.
2. Tắt `Timeline Only` -> pane trái trở lại đúng như cũ.
3. Reload trang -> mode giữ đúng nếu đã save.
4. Save JSON / load JSON -> mode giữ đúng.
5. Trong `Timeline Only`, mọi dòng vẫn nhận diện được task.
6. Dòng có date và không có date đều còn đọc được.
7. `Reported mode` không bị vỡ layout.
8. `npm run lint` và kiểm tra runtime thủ công.

## Rủi ro và giảm thiểu
- Rủi ro label task che lên bar hoặc header timeline:
  - dùng sticky label có width giới hạn, z-index rõ ràng, nền nhẹ/translucent.
- Rủi ro bar ngắn làm chữ chồng chéo:
  - không ép render full text trong bar; label task tách khỏi bar.
- Rủi ro user mất các thao tác nhanh từ pane trái:
  - scope mode này chỉ phục vụ đọc timeline; khi cần edit user có thể tắt mode.
- Rủi ro state mới không được persist đồng bộ:
  - đi qua cùng flow save/load settings hiện có ở page container.
- Rủi ro xung đột với `Reported mode`:
  - chặn hoặc disable rõ từ toolbar.

## Tiêu chí hoàn tất
1. Có nút toggle `Timeline Only` hoạt động ổn định.
2. Khi bật mode, pane trái được ẩn hoàn toàn.
3. Timeline mở rộng full content area.
4. User vẫn nhận diện được từng task ngay trong timeline pane, không cần dựa vào tooltip.
5. Mode được persist qua save/reload/load JSON.
6. Không làm vỡ `Reported mode` và các filter hiện có.
