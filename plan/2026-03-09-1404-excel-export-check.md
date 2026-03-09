# Plan: Check tính năng xuất Excel

## Mục tiêu
- Xác nhận luồng xuất Excel hoạt động ổn định, không lỗi khi tải file.
- Đảm bảo dữ liệu xuất phản ánh đúng cấu trúc roadmap hiện tại.
- Làm rõ các điểm lệch giữa UI hiện tại và file Excel để quyết định fix.

## Phạm vi
Bao gồm:
1. Rà soát luồng gọi export từ UI đến file tải xuống.
2. Đối chiếu cột dữ liệu xuất với model roadmap hiện tại.
3. Kiểm tra định dạng file, tên file, sheet và dữ liệu milestone.
4. Lập danh sách bug/gap + đề xuất hướng fix.

Không bao gồm:
- Refactor lớn kiến trúc export.
- Thay đổi business rule roadmap ngoài phạm vi export.

## Hiện trạng nhanh
- Trigger export: `src/app/page.tsx` (`handleExportExcel`).
- Entry UI: `src/components/Toolbar.tsx` (menu `Xuất Excel`).
- Logic export: `src/utils/exportToExcel.ts`.
- Dữ liệu hiện đang xuất các cột: `ID, Tên, Loại, Trạng thái, Tiến độ, Ngày bắt đầu, Ngày kết thúc`.

## Các bước triển khai
### Bước 1: Soát luồng hoạt động thực tế
1. Chạy app local và thao tác `Xuất Excel`.
2. Xác nhận trình duyệt tải `.xlsx` thành công.
3. Xác nhận toast success/error hiển thị đúng khi export thành công/thất bại.

### Bước 2: Kiểm tra nội dung file Excel
1. Mở file xuất và kiểm tra:
- Sheet `Roadmap` có đủ header và số dòng khớp dữ liệu.
- Sheet `Milestones` xuất đúng khi có milestone; không có milestone thì không tạo sheet dư.
2. Kiểm tra thứ tự/phân cấp item (indent) có giữ đúng cây.
3. Kiểm tra giá trị rỗng/thiếu ngày không làm sai format file.

### Bước 3: Đối chiếu với tính năng mới đã thêm
1. So cột export với fields hiện có trong model:
- `phaseIds` (Phase)
- `groupItemType` / WorkType
- `priority`
2. Đánh dấu rõ:
- field nào đang có trong UI nhưng chưa có trong Excel
- field nào cần bổ sung ngay để phục vụ báo cáo

### Bước 4: Kiểm tra edge cases
1. Dữ liệu lớn (nhiều cấp tree) vẫn export được.
2. Tên release có ký tự đặc biệt/khoảng trắng -> tên file hợp lệ.
3. Item thiếu status/progress/date không làm crash export.

### Bước 5: Chốt hướng fix (nếu có)
1. Tạo checklist bug theo mức độ:
- Critical: export lỗi / file hỏng
- Major: thiếu cột quan trọng (Phase/WorkType/Priority) gây mất thông tin
- Minor: format/độ rộng/tên file
2. Chốt thứ tự triển khai fix trong ticket tiếp theo.

## Rủi ro và giảm thiểu
- Rủi ro lệch giữa UI và Excel do model đã mở rộng nhanh:
  - Giảm thiểu: đối chiếu trực tiếp `src/types/roadmap.ts` với `exportToExcel.ts`.
- Rủi ro người dùng hiểu nhầm `%` là percent format:
  - Giảm thiểu: kiểm tra rõ kiểu dữ liệu và format cột tiến độ.
- Rủi ro tên file không an toàn trên một số OS:
  - Giảm thiểu: sanitize tên release trước khi ghép file name.

## Tiêu chí hoàn tất
1. Có report kiểm tra rõ pass/fail cho từng nhóm test.
2. Có danh sách bug/gap cụ thể (nếu có), kèm mức độ ưu tiên.
3. Có đề xuất fix rõ phạm vi cho vòng triển khai tiếp theo.
