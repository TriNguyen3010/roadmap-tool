# Plan: Export theo đối tượng App/Web + Team (mẫu tóm tắt)

## Mục tiêu
- Thêm chế độ export theo nhóm đối tượng business, không chỉ export dạng bảng raw.
- Output có cấu trúc giống mẫu:
  - `App (Mobile)`
  - `Web`
  - `Team PD (Product Design)`
- Mỗi nhóm liệt kê danh sách item theo format dễ đọc để báo cáo nhanh.

## Giả định
- `Ex Mẩu` được hiểu là `Ví dụ mẫu output` (không phải một nhóm dữ liệu mới).
- Dữ liệu nguồn lấy từ roadmap hiện tại; có thể ưu tiên theo `current view` để đồng nhất với export hiện tại.
- Mapping nhóm:
  - `App (Mobile)`: item thuộc nhánh subcategory `App` (có thể bao gồm `Core` theo rule hiện tại nếu user bật mode App).
  - `Web`: item thuộc nhánh subcategory `Web` (có thể bao gồm `Core` theo rule hiện tại nếu user bật mode Web).
  - `Team PD (Product Design)`: item có team role `PD`.

## Phạm vi
Bao gồm:
1. Thiết kế cấu trúc export mới theo block text/report.
2. Sinh dữ liệu nhóm App/Web/Team PD từ cây roadmap.
3. Xuất ra 1 sheet riêng trong Excel (hoặc 1 file text download) theo format mẫu.

Không bao gồm:
- Thay đổi logic tính tiến độ/status hiện tại.
- Thêm nhóm team khác ngoài PD ở vòng đầu.

## Thiết kế output đề xuất
- Tên sheet: `Summary by Object`
- Bố cục:
  1. Dòng tiêu đề nhóm (VD: `App (Mobile)`)
  2. Các dòng item đánh số:
     - `1- OneID: Gỡ bỏ cơ chế Referral cũ (Remove old Referral scheme).`
     - `2- OneID: Giao diện Banner động (Dynamic Banner).`
  3. Dòng trống ngăn nhóm.
- Rule ghi chú:
  - Nếu có `quickNote`, append: `- Ghi chú: ...`

## Kế hoạch triển khai
### Bước 1: Chuẩn hóa rule phân nhóm
- Viết helper phân nhóm item theo 3 bucket: `app`, `web`, `teamPd`.
- Chuẩn hóa điều kiện `Core` đi cùng `App/Web` theo toggle/filter hiện tại.

### Bước 2: Trích xuất item cho báo cáo
- Duyệt flattened rows (đã có từ current view helper) và chỉ lấy loại `item`/`group` phù hợp cho summary.
- Sinh chuỗi hiển thị theo format mẫu: `{index}- {context}: {task}{note}`.

### Bước 3: Tích hợp vào export
- Mở rộng `exportRoadmapToExcel` để append thêm sheet `Summary by Object`.
- Giữ nguyên sheet `Roadmap` hiện tại để không phá workflow cũ.

### Bước 4: Nút/tùy chọn export
- Ưu tiên không đổi UI nhiều ở vòng 1:
  - Khi bấm `Export Excel`, luôn kèm thêm sheet summary.
- Nếu cần tách mode sau này: thêm toggle `Include Summary`.

### Bước 5: Test
1. Có item App -> xuất đúng dưới block `App (Mobile)`.
2. Có item Web -> xuất đúng dưới block `Web`.
3. Có team PD -> xuất đúng dưới block `Team PD (Product Design)`.
4. Item có ghi chú -> append `Ghi chú` đúng format.
5. Không có dữ liệu trong 1 block -> vẫn show tiêu đề + `Không có dữ liệu`.
6. `npm run lint` + `npm run build` pass.

## Rủi ro và giảm thiểu
- Rủi ro mapping sai `App/Web/Core`:
  - Giảm thiểu bằng helper mapping tập trung và có test case riêng cho `Core`.
- Rủi ro trùng item giữa nhiều block:
  - Định nghĩa rule ưu tiên rõ ràng (ưu tiên team block hoặc object block) trước khi code.
- Rủi ro output khó đọc khi dữ liệu dài:
  - Giới hạn độ dài dòng và để note ở cột riêng nếu cần.

## Tiêu chí hoàn tất
1. Export có thêm phần summary theo đúng 3 block mẫu.
2. Nội dung từng block đúng với dữ liệu và rule mapping đã chốt.
3. Không ảnh hưởng sheet export hiện hữu.
4. Build/lint pass.
