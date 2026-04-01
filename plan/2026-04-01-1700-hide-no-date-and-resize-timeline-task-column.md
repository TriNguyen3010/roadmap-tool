# Plan: Ẩn hoàn toàn `No date` và cho resize cột `Task` trong Timeline Only

## Mục tiêu
- Trong mode `Timeline Only`, nếu row không có date để vẽ timeline thì không hiển thị badge `No date` nữa.
- Giữ label tên task gọn, sạch, không thêm badge gây rối mắt.
- Thêm khả năng chỉnh kích thước cột `Task` trong `Timeline Only`.
- Đảm bảo user có thể tự nới/rút vùng tên task để phù hợp với độ dài nội dung thực tế.

## Vấn đề hiện tại
- Badge `No date` đang làm giao diện nặng và gây nhiễu khi có nhiều row chưa có lịch.
- Wording này không thực sự cần thiết nếu mục tiêu chính là scan task name.
- Cột `Task` trong `Timeline Only` hiện đang dùng width cố định:
  - dễ bị chật khi tên task dài
  - hoặc phí diện tích khi tên task ngắn
- User chưa có cách chủ động cân bằng giữa:
  - không gian cho tên task
  - không gian cho timeline

## Phạm vi
Bao gồm:
1. Bỏ hẳn badge `No date` trong `Timeline Only`.
2. Giữ row không có date vẫn hiển thị tên task bình thường.
3. Thêm resize handle cho cột `Task` trong `Timeline Only`.
4. Persist kích thước cột `Task` qua save/reload giống các setting view khác.

Không bao gồm:
- Thay đổi logic tính `startDate/endDate`.
- Tự động ẩn row không có date.
- Redesign toàn bộ timeline-only layout ngoài phần cột `Task`.

## UX cần đạt
### 1. Với row không có date
- Chỉ hiển thị tên task.
- Không hiển thị badge `No date`.
- Không thêm copy thay thế trong row ở vòng này.
- Nếu cần giải thích sâu hơn, có thể để dành tooltip hoặc thông tin ở bước sau, nhưng default view phải sạch.

### 2. Với cột `Task`
- Có resize handle rõ ràng ở mép phải cột `Task`.
- User có thể kéo để đổi width tương tự các cột khác trong grid.
- Nên có:
  - `default width`
  - `min width`
  - `max width`
- Khi resize:
  - cột `Task` rộng hơn -> timeline hẹp lại
  - cột `Task` hẹp hơn -> timeline rộng ra

### 3. Persistence
- Width của cột `Task` trong timeline-only cần được lưu trong `settings`.
- Khi reload hoặc load JSON:
  - width quay lại đúng giá trị user đã chọn

## File dự kiến tác động
- `src/types/roadmap.ts`
- `src/app/roadmap/[id]/page.tsx`
- `src/components/SpreadsheetGrid.tsx`

## Kế hoạch triển khai
### Bước 1: Bỏ badge `No date`
- File: `src/components/SpreadsheetGrid.tsx`
- Trong sticky task label của `Timeline Only`:
  - bỏ hoàn toàn badge `No date`
- Giữ row không có bar timeline nhưng vẫn render tên task.

### Bước 2: Tạo setting cho width của cột `Task`
- File: `src/types/roadmap.ts`
- Bổ sung field mới trong `settings`, ví dụ:
  - `timelineTaskWidth?: number`
- Chọn range hợp lý, ví dụ:
  - default: `220`
  - min: `140`
  - max: `420`

### Bước 3: Nối state ở page container
- File: `src/app/roadmap/[id]/page.tsx`
- Tạo state cho `timelineTaskWidth`.
- Khi load roadmap / load JSON:
  - đọc field này từ `settings`
- Khi save snapshot:
  - ghi lại vào `settings`

### Bước 4: Cập nhật SpreadsheetGrid để dùng width động
- File: `src/components/SpreadsheetGrid.tsx`
- Thay constant width cứng của cột `Task` bằng prop/state truyền từ page.
- Tính lại:
  - sticky label width
  - timeline left offset
  - timeline canvas width
  - các overlay như today line / milestone shading / bars

### Bước 5: Thêm resize handle cho cột `Task`
- File: `src/components/SpreadsheetGrid.tsx`
- Trong header của timeline-only:
  - thêm resize handle ở mép phải cột `Task`
- Hành vi kéo:
  - giống pattern resize đang có cho các cột khác
  - update width realtime khi kéo
  - clamp theo min/max

### Bước 6: Rà behavior row label sau khi resize
- Kiểm tra:
  - tên task dài có truncate đúng
  - khi cột hẹp, icon expand/collapse vẫn thao tác được
  - sticky label không che hoặc lệch bar timeline

### Bước 7: Test
1. Row không có date không còn hiện badge `No date`.
2. Tên task vẫn hiển thị bình thường trong timeline-only.
3. Có thể kéo resize cột `Task`.
4. Kéo rộng/hẹp không làm vỡ alignment timeline.
5. Reload trang vẫn giữ width đã chỉnh.
6. Save JSON / load JSON vẫn giữ đúng width.
7. `npm run lint` và `npm run build`.

## Rủi ro và giảm thiểu
- Rủi ro row không có date bị user tưởng là đã có timeline:
  - chấp nhận trong vòng này theo ưu tiên “clean UI”, chưa thêm badge/copy phụ.
- Rủi ro resize làm lệch các overlay timeline:
  - gom toàn bộ offset về một biến width duy nhất để tránh lệch từng nơi.
- Rủi ro width quá lớn làm timeline quá hẹp:
  - clamp max width hợp lý.
- Rủi ro width quá nhỏ làm tên task khó đọc:
  - clamp min width hợp lý.

## Tiêu chí hoàn tất
1. Không còn badge `No date` trong `Timeline Only`.
2. Cột `Task` resize được bằng chuột.
3. Kích thước cột `Task` được persist qua save/reload.
4. Timeline bars, today line, milestone shading vẫn align đúng sau resize.
