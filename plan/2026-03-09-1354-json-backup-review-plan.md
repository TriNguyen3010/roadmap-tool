# Plan: Review và harden tính năng Save/Backup JSON

## Mục tiêu
- Đảm bảo file JSON tải xuống dùng được như bản backup khôi phục đầy đủ khi cần.
- Đảm bảo luồng import JSON khôi phục nhất quán dữ liệu + view settings.
- Giảm rủi ro mất state sau khi restore backup.

## Hiện trạng đã kiểm tra
- `Download JSON` đang lấy snapshot từ `buildDocumentSnapshot` (đúng hướng cho backup).
- `Import JSON` hiện mới restore **một phần** settings trong `handleLoadJson`.
- Có lệch round-trip backup -> import ở các field settings.

## Vấn đề cần xử lý
1. Import chưa restore đầy đủ settings backup:
- thiếu `colPriority`, `colStartDate`, `colEndDate`
- thiếu `expandedIds`, `hiddenRowIds`

2. Tên file backup mới có ngày (`yyyy-MM-dd`), chưa có giờ/phút/giây:
- dễ trùng tên khi backup nhiều lần trong ngày

3. Validate import còn mỏng:
- mới check `items` là array, chưa kiểm tra/phủ fallback rõ cho các phần còn lại

## Phạm vi
Bao gồm:
1. Bổ sung restore đầy đủ settings khi import.
2. Chuẩn hóa fallback/validate khi import JSON.
3. Cải thiện naming file backup có timestamp chi tiết.
4. Test round-trip backup/restore.

Không bao gồm:
- Đổi cấu trúc data model roadmap.
- Thêm cơ chế backup versioning trên server/database.

## Kế hoạch triển khai

### Bước 1: Đồng bộ restore settings trong `handleLoadJson`
- `src/app/page.tsx`
  - Bổ sung set state từ `parsed.settings` cho các field còn thiếu:
    - `colPriority`, `colStartDate`, `colEndDate`
    - `expandedIds`, `hiddenRowIds`
  - Giữ normalize cho các filter như hiện tại.

### Bước 2: Củng cố validate + fallback import
- `src/app/page.tsx`
  - Tiếp tục dùng `normalizeDocument(parsed)` làm lớp normalize chính.
  - Thêm guard rõ ràng cho các field không hợp lệ (nếu cần) trước khi `setState`.
  - Đảm bảo không crash khi thiếu `settings` hoặc `milestones`.

### Bước 3: Cải thiện tên file backup
- `src/app/page.tsx`
  - Đổi pattern file name từ:
    - `..._backup_yyyy-MM-dd.json`
  - sang:
    - `..._backup_yyyy-MM-dd_HHmmss.json`

### Bước 4: Review quyền thao tác backup
- `src/components/Toolbar.tsx`
  - Xác nhận chủ đích:
    - Download JSON có thể giữ mở cho Viewer (hợp lý cho backup)
    - Upload JSON vẫn chỉ Editor
  - Nếu cần, cập nhật tooltip để người dùng hiểu rõ hành vi.

### Bước 5: Regression test
- Case 1: Round-trip đầy đủ
  - Download JSON -> Import lại -> Save
  - Kiểm tra cột ẩn/hiện, filter, expanded/hidden rows giữ nguyên
- Case 2: JSON thiếu `settings`
  - Import không crash, dùng default state
- Case 3: JSON có settings lạ/không hợp lệ
  - App bỏ qua an toàn, không vỡ màn hình
- Chất lượng:
  - `npm run lint`
  - `npm run build`

## Rủi ro và giảm thiểu
- Rủi ro ghi đè sai state khi import:
  - Giảm thiểu: chỉ set state khi kiểu dữ liệu hợp lệ (`typeof`, `Array.isArray`)
- Rủi ro mismatch giữa snapshot và state runtime:
  - Giảm thiểu: dùng chung nguồn `buildDocumentSnapshot` + `normalizeDocument`

## Tiêu chí hoàn tất
1. Backup JSON restore lại đầy đủ các settings chính.
2. Không mất trạng thái cột/expand/hide sau khi import backup.
3. Tên file backup có timestamp chi tiết, hạn chế trùng.
4. Lint/build pass.
