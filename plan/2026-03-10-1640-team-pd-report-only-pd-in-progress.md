# Plan: Team PD report chỉ lấy status `PD In Progress`

## Mục tiêu
- Điều chỉnh block `Team PD (Product Design)` trong sheet `Summary by Object`.
- Chỉ giữ các dòng có `status = PD In Progress`.

## Hiện trạng
- Block `Team PD` hiện lấy item có liên kết team `PD` (qua map ancestor teamRole).
- Chưa có filter thêm theo status của item.

## Phạm vi
Bao gồm:
1. Cập nhật logic build block `teamPd` trong `src/utils/exportToExcel.ts`.
2. Chỉ giữ item thỏa đồng thời:
   - thuộc team `PD`
   - `row.status === 'PD In Progress'`
3. Giữ nguyên các block khác (`App`, `Core`, `Web`) và format summary hiện tại.

Không bao gồm:
- Thay đổi status business logic của roadmap.
- Thay đổi sheet `Roadmap` / `Milestones`.

## Kế hoạch triển khai
### Bước 1: Cập nhật filter Team PD
- File: `src/utils/exportToExcel.ts`.
- Trong phần build `teamPd`, thêm điều kiện status:
  - từ: `row.type === 'item' && hasPD`
  - thành: `row.type === 'item' && hasPD && row.status === 'PD In Progress'`

### Bước 2: Giữ format output
- Giữ nguyên format hiện có của summary:
  - Header `ID | Nội dung`
  - Nội dung dạng `Group: Feature`
- Không đổi thứ tự block và quy tắc numbering hiện tại.

### Bước 3: Verify
1. Item team PD nhưng status khác `PD In Progress` -> không xuất trong block Team PD.
2. Item team PD có status `PD In Progress` -> có xuất.
3. Block Team PD rỗng -> vẫn show `Không có dữ liệu`.
4. `npm run lint` + `npm run build` pass.

## Rủi ro và giảm thiểu
- Rủi ro bỏ sót item cần report nếu status không được update chuẩn:
  - Đây là rule mới theo yêu cầu, chấp nhận loại trừ các status khác.
- Rủi ro khác biệt giữa `Current View` và `Full Data`:
  - `Full Data` hiện không include summary mặc định; kiểm tra ở mode Current View.

## Tiêu chí hoàn tất
1. Block Team PD chỉ còn các dòng `PD In Progress`.
2. Các block còn lại không bị ảnh hưởng.
3. Lint/build pass.
