# Review: Check tính năng xuất Excel

## Phạm vi review
- Luồng export từ UI (`Toolbar`) -> handler (`page.tsx`) -> generator (`exportToExcel.ts`).
- Kiểm tra workbook đầu ra bằng script gọi trực tiếp `exportRoadmapToExcel` và đọc lại file bằng `xlsx`.

## Kết quả check nhanh
- PASS: Nút `Xuất Excel` có trigger đúng handler.
- PASS: Export tạo được file `.xlsx` và auto-download.
- PASS: Có sheet `Roadmap`; có thêm sheet `Milestones` khi dữ liệu có milestone.
- PASS: Header hiện tại khớp code: `ID, Tên, Loại, Trạng thái, Tiến độ (%), Ngày bắt đầu, Ngày kết thúc`.
- PASS: Số dòng dữ liệu xuất khớp số node flatten trong cây roadmap.
- PASS: Trường hợp không có milestone chỉ còn 1 sheet `Roadmap`.

## Findings cần xử lý
### 1. Major: Thiếu các cột mới theo mô hình hiện tại
- Hiện export chưa có `Priority`, `WorkType`, `Phase`.
- Trong code, headers đang cố định ở 7 cột cũ tại `src/utils/exportToExcel.ts` (dòng 42).
- Ảnh hưởng: báo cáo Excel không phản ánh đủ dữ liệu đã hiển thị trên UI hiện tại.

### 2. Minor: Tên file chưa sanitize ký tự đặc biệt
- File name hiện dùng trực tiếp `releaseName` (chỉ fallback null) tại `src/utils/exportToExcel.ts` (dòng 102).
- Test với tên `Roadmap / QA: Sprint*1?` cho ra đúng chuỗi đó trong tên file.
- Ảnh hưởng: có rủi ro không tương thích trên một số môi trường/hệ điều hành.

### 3. Minor: Cột tiến độ ghi số thường nhưng header ghi phần trăm
- Code chỉ ép kiểu numeric (`cell.t = 'n'`) cho cột tiến độ, chưa có định dạng `%` tại `src/utils/exportToExcel.ts` (dòng 77-82).
- Ảnh hưởng: người nhận file có thể hiểu sai `%` là 0..1 thay vì 0..100.

## Đề xuất fix
1. Bổ sung cột export: `WorkType`, `Priority`, `Phase` (có thể join nhiều phase bằng `, `).
2. Sanitize file name trước khi download (loại `/\\:*?\"<>|`, trim, chuẩn hóa khoảng trắng).
3. Rõ quy ước tiến độ:
- hoặc đổi header thành `Tiến độ` (0-100),
- hoặc format thành percent đúng chuẩn và chuyển đổi dữ liệu tương ứng.

## Tệp liên quan
- `src/components/Toolbar.tsx`
- `src/app/page.tsx`
- `src/utils/exportToExcel.ts`
