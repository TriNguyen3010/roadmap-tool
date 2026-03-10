# Plan: Đề xuất lại format report (ID thứ tự, Tên tính năng, Group)

## Mục tiêu
- Chuẩn hóa format report theo mẫu ngắn gọn, dễ đọc:
  1. `ID thứ tự`
  2. `Tên tính năng`
  3. `Group`
- Dùng format này cho phần report summary khi export.
- Loại bỏ nhầm lẫn giữa `ID kỹ thuật` (uuid/id node) và `ID báo cáo` (STT).

## Format đề xuất (vòng 1)
- Dạng bảng 3 cột, theo đúng thứ tự:
  - `ID`
  - `Tên tính năng`
  - `Group`
- Ví dụ:
  - `1 | Gỡ bỏ cơ chế Referral cũ | OneID`
  - `2 | Giao diện Banner động | OneID`

## Rule mapping dữ liệu
1. `ID thứ tự`
- Đánh số tăng dần theo từng block report (`App`, `Web`, `Team PD`).
- Mỗi block reset lại từ `1`.
- Không dùng `row.id` của node cho cột này.

2. `Tên tính năng`
- Lấy từ `item.name`.
- Nếu cần ngữ cảnh thêm ở vòng sau, sẽ append trong ngoặc, không đổi cột.

3. `Group`
- Ưu tiên lấy từ ancestor `category` gần nhất (đại diện nhóm sản phẩm trong ví dụ mẫu như `OneID`, `Coin98 Home`).
- Nếu không tìm thấy `category`, fallback về ancestor `group` gần nhất.
- Nếu vẫn không có, fallback `—`.

## Cấu trúc report trong Excel
- Giữ `Roadmap` sheet như hiện tại.
- Sheet summary đổi format thành dạng bảng cho từng block:
  - Tiêu đề block (`App (Mobile)`, `Web`, `Team PD (Product Design)`).
  - Header bảng: `ID | Tên tính năng | Group`.
  - Danh sách dòng dữ liệu.
  - Dòng trống ngăn block.
- Tên sheet summary: `Summary by Object`.

## Phạm vi triển khai
Bao gồm:
1. Cập nhật hàm tạo summary rows theo schema 3 cột.
2. Cập nhật logic tìm `Group` từ cây cha-con theo ưu tiên `category -> group`.
3. Tách rõ `STT` và `ID kỹ thuật` để tránh sai nghĩa cột.
4. Cập nhật test case export theo format mới.

Không bao gồm:
- Thêm cột ghi chú/priority/status ở vòng này.
- Thay đổi logic lọc App/Web/Team PD đã chốt trước đó.

## Kế hoạch triển khai
### Bước 1: Chốt schema output
- Tạo type summary row:
  - `index: number`
  - `featureName: string`
  - `groupName: string`
  - `sourceId: string` (dùng nội bộ để trace/debug, không xuất ra cột ID)

### Bước 2: Cập nhật builder summary
- Từ `visible rows`, lọc item thuộc block tương ứng.
- Dò ancestor để lấy group name theo rule `category -> group -> —`.
- Đánh số lại theo từng block.
- Chốt đối tượng report vòng 1:
  - `App/Web`: lấy task level `group`.
  - `Team PD`: lấy task level `item` có liên kết team `PD`.

### Bước 3: Ghi vào sheet summary
- Render block title.
- Render header `ID | Tên tính năng | Group`.
- Render rows; nếu rỗng thì dòng `Không có dữ liệu`.

### Bước 4: Verify
1. Đúng 3 cột theo thứ tự.
2. ID tăng đúng và reset theo block.
3. Group map đúng với item.
4. Không còn cột `ID` dạng uuid trong sheet summary.
5. `npm run lint` + `npm run build` pass.

## Rủi ro và giảm thiểu
- Rủi ro item nằm sâu, khó xác định group:
  - Dùng helper tìm ancestor theo ưu tiên `category -> group`.
- Rủi ro hiểu khác nhau về nghĩa `Group`:
  - Chốt theo ví dụ mẫu: ưu tiên tên sản phẩm/category.
- Rủi ro trùng tên feature giữa block:
  - Chấp nhận ở vòng 1 vì đã tách theo block.

## Tiêu chí hoàn tất
1. Report summary xuất đúng format 3 cột: `ID, Tên tính năng, Group`.
2. Dữ liệu trong report đọc được ngay, không cần câu mô tả dài.
3. Cột `ID` trong summary là STT, không phải node id kỹ thuật.
4. Không ảnh hưởng sheet export hiện có.
