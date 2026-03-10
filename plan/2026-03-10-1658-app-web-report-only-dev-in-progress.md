# Plan: App/Web report chỉ lấy status `Dev In Progress`

## Mục tiêu
- Cập nhật thêm rule cho block `App (Mobile)` và `Web` trong `Summary by Object`.
- Chỉ giữ các dòng có `status = Dev In Progress` cho 2 block này.
- Giữ nguyên rule của `Team PD` đã chốt trước đó (`PD In Progress`).

## Hiện trạng
- `App/Core/Web` hiện đang lấy theo subcategory (`App`, `Core`, `Web`) mà chưa lọc theo status.
- `Team PD` đang có plan riêng để lọc `PD In Progress`.

## Phạm vi
Bao gồm:
1. Cập nhật logic build summary trong `src/utils/exportToExcel.ts`.
2. Áp dụng điều kiện status cho block:
   - `App`: chỉ `Dev In Progress`
   - `Core`: chỉ `Dev In Progress` (vì đang nối cùng nhánh App theo layout report hiện tại)
   - `Web`: chỉ `Dev In Progress`
3. Không thay đổi format summary (`ID | Nội dung`) và quy tắc numbering hiện tại.

Không bao gồm:
- Thay đổi sheet `Roadmap` / `Milestones`.
- Thay đổi rule status cho block khác ngoài App/Core/Web/Team PD.

## Kế hoạch triển khai
### Bước 1: Cập nhật filter App/Core/Web
- Trong builder summary:
  - từ điều kiện theo subcategory
  - thêm điều kiện `row.status === 'Dev In Progress'`.
- Giữ nguyên logic map nội dung prefix `Group: Feature`.

### Bước 2: Đồng bộ với rule Team PD
- Không đụng logic Team PD đã chốt `PD In Progress`.
- Đảm bảo rule status theo block rõ ràng:
  - App/Core/Web -> `Dev In Progress`
  - Team PD -> `PD In Progress`

### Bước 3: Verify
1. Group thuộc App/Web nhưng status khác `Dev In Progress` -> không xuất trong block tương ứng.
2. Group thuộc App/Web có status `Dev In Progress` -> có xuất.
3. Core vẫn nằm ngay dưới App và đếm nối tiếp App như rule hiện tại.
4. Team PD vẫn theo `PD In Progress` (không bị ảnh hưởng).
5. `npm run lint` + `npm run build` pass.

## Rủi ro và giảm thiểu
- Rủi ro block rỗng khi status chưa cập nhật đúng:
  - Chấp nhận theo business rule mới; hiển thị `Không có dữ liệu`.
- Rủi ro hiểu khác giữa `Dev In Progress` và `PD In Progress`:
  - Chốt rõ theo từng block trong code bằng hằng/điều kiện tường minh.

## Tiêu chí hoàn tất
1. Block `App/Core/Web` chỉ còn dữ liệu `Dev In Progress`.
2. Rule block `Team PD` giữ nguyên theo `PD In Progress`.
3. Format summary và numbering không bị vỡ.
4. Lint/build pass.
