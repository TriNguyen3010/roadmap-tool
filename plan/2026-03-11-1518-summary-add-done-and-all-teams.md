# Plan: Summary by Object thêm `Done` và đủ section team

## Mục tiêu
- Mở rộng logic `Summary by Object` để block `App/Core/Web` nhận thêm status `Done`.
- Bổ sung đủ section theo team workflow (BA/PD/Dev/QC/Growth).
- Giữ tương thích format export hiện tại, không làm vỡ file/report cũ.

## Cập nhật rule Summary by Object
1. `App (Mobile)`
- `type = group`
- thuộc subcategory `App`
- status thuộc `{ Dev Handle, Dev In Progress, Done }`

2. `Core`
- `type = group`
- thuộc subcategory `Core`
- status thuộc `{ Dev Handle, Dev In Progress, Done }`

3. `Web`
- `type = group`
- thuộc subcategory `Web`
- status thuộc `{ Dev Handle, Dev In Progress, Done }`

## Bổ sung section đủ team
Thêm các block mới vào `Summary by Object`:
1. `Team BA`
- `type = item`
- có team descendant chứa `BA`
- status thuộc `{ BA Handle, BA In Progress }`

2. `Team PD (Product Design)`
- `type = item`
- có team descendant chứa `PD`
- status thuộc `{ PD Handle, PD In Progress }`

3. `Team Dev`
- `type = item`
- có team descendant chứa `FE` hoặc `BE`
- status thuộc `{ Dev Handle, Dev In Progress, Done }`

4. `Team QC`
- `type = item`
- có team descendant chứa `QC`
- status thuộc `{ QC Handle, QC In Progress }`

5. `Team Growth`
- `type = item`
- có team descendant chứa `Growth`
- status thuộc `{ Growth Handle, Growth In Progress }`

## Phạm vi ảnh hưởng code
1. `src/utils/exportToExcel.ts`
- Cập nhật `buildSummaryRowsByObject`.
- Thêm constant cho nhóm status:
  - `SUMMARY_DEV_STATUSES`
  - `SUMMARY_BA_STATUSES`
  - `SUMMARY_PD_STATUSES`
  - `SUMMARY_QC_STATUSES`
  - `SUMMARY_GROWTH_STATUSES`
- Thêm block append cho các team mới.

2. `src/types/roadmap.ts`
- Xác nhận `ItemStatus` đã có đủ status mới.
- Xác nhận `TeamRole` có `BA/Growth/PD/BE/FE/QC` để match logic team sections.

3. (Nếu cần) `plan/*` liên quan status trước đó
- Đồng bộ lại rule để tránh mâu thuẫn tài liệu.

## Kế hoạch triển khai
### Phase 1 - Rule constants và lọc dữ liệu summary
1. Định nghĩa các status set dùng cho App/Core/Web và các team block.
2. Refactor filter theo hàm helper để tránh lặp và dễ test.

### Phase 2 - Mở rộng summary sheet blocks
1. Giữ block hiện tại: `App (Mobile)`, `Core`, `Web`.
2. Thêm block team: `Team BA`, `Team PD`, `Team Dev`, `Team QC`, `Team Growth`.
3. Giữ format `ID | Nội dung` và logic prefix `Group: Feature`.

### Phase 3 - QA export compatibility
1. `Export Current View`
- summary có đủ block mới.
- dữ liệu App/Core/Web xuất cả dòng `Done`.
2. `Export Full Data`
- vẫn giữ hành vi hiện tại (không summary) nếu config cũ.
3. Verify không crash khi block rỗng (`Không có dữ liệu`).

## Acceptance criteria
1. App/Core/Web nhận thêm status `Done` trong summary.
2. Summary có đủ section team BA/PD/Dev/QC/Growth.
3. Format sheet không đổi: vẫn `ID | Nội dung`.
4. Export mở bình thường, không lỗi encoding, không vỡ thứ tự dòng.

## Ghi chú xác nhận
- `Team Dev` đang gộp `FE + BE` thành một block. Nếu cần tách riêng `Team FE` và `Team BE`, làm phase tiếp theo.
- `Done` hiện chỉ thêm cho App/Core/Web và Team Dev theo mục tiêu lần này.
