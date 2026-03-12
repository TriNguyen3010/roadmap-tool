# Plan: Update rule cột `Nội dung` của `Summary by Object` kèm `Status`

## Mục tiêu
1. Cột `Nội dung` trong `Summary by Object` phải hiển thị thêm `status`.
2. Rule lọc group cho block `App/Core/Web` mở rộng thêm status `Not Started`.

## Rule mới cần áp dụng
### 1) Format cột `Nội dung`
- Từ:
  - `Category: FeatureName` (hoặc fallback khác)
- Thành:
  - `Category: FeatureName - [Status]`
- Ví dụ:
  - `OneID: Dynamic Banner - [Dev In Progress]`
  - `Coin98 Home: New UI - [Not Started]`

### 2) Status hợp lệ cho group (`App/Core/Web`)
Group status được tính vào summary nếu thuộc 1 trong 4 giá trị:
1. `Dev Handle`
2. `Dev In Progress`
3. `Not Started`
4. `Done`

## Phạm vi tác động
1. `src/utils/exportToExcel.ts`
- update hằng status cho block group.
- update hàm build nội dung summary để append status.
2. Không đổi behavior export mode:
- `Current View`: vẫn có summary.
- `Full Data`: giữ rule hiện tại (không summary nếu `includeSummary: false`).

## Phase triển khai
### Phase 1 - Update rule data
1. Đổi tập `SUMMARY_DEV_STATUSES` để thêm `Not Started`.
2. Đảm bảo `App/Core/Web` dùng đúng tập status mới.

### Phase 2 - Update format hiển thị nội dung
1. Mở rộng model summary row để có `status`.
2. Cập nhật hàm build chuỗi `Nội dung` thành `prefix + feature + status`.
3. Giữ fallback khi thiếu prefix như hiện tại.

### Phase 3 - QA nhanh
1. Case `Dev Handle/Dev In Progress/Not Started/Done` đều xuất hiện ở block `App/Core/Web`.
2. Cột `Nội dung` có status ở cuối cho mọi dòng có dữ liệu.
3. Dòng `Không có dữ liệu` không đổi.
4. Đảm bảo không vỡ thứ tự block và format sheet.

## Kết quả mong đợi
1. User nhìn cột `Nội dung` biết ngay item/group đang ở status nào.
2. Group `Not Started` được tính vào summary của `App/Core/Web`.
