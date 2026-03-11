# Plan: Update Summary by Object với bộ status mới

## Mục tiêu
- Đồng bộ `Summary by Object` với bộ status mới theo workflow BA/PD/Dev/QC/Growth.
- Giữ nguyên format report hiện tại (`ID | Nội dung`) và không làm vỡ luồng export cũ.
- Đảm bảo `Export Current View` và `Export Full Data` vẫn tương thích khi status mở rộng.

## Status mục tiêu
1. `Not Started`
2. `BA Handle`
3. `BA In Progress`
4. `PD Handle`
5. `PD In Progress`
6. `Dev Handle`
7. `Dev In Progress`
8. `QC Handle`
9. `QC In Progress`
10. `Growth Handle`
11. `Growth In Progress`
12. `Done`

## Rule Summary by Object (đề xuất cập nhật)
1. `App (Mobile)`:
- lấy `type = group`
- thuộc subcategory `App`
- status thuộc `{ Dev Handle, Dev In Progress }`

2. `Core`:
- lấy `type = group`
- thuộc subcategory `Core`
- status thuộc `{ Dev Handle, Dev In Progress }`

3. `Web`:
- lấy `type = group`
- thuộc subcategory `Web`
- status thuộc `{ Dev Handle, Dev In Progress }`

4. `Team PD (Product Design)`:
- lấy `type = item`
- có team descendant chứa `PD`
- status thuộc `{ PD Handle, PD In Progress }`

5. Không đổi:
- chưa thêm block riêng cho BA/QC/Growth trong summary (giữ cấu trúc sheet gọn như hiện tại).
- dữ liệu không match rule thì không vào summary block tương ứng.

## Phạm vi ảnh hưởng code
1. `src/types/roadmap.ts`
- Mở rộng `ItemStatus`, `STATUS_OPTIONS`, normalize status/filter.

2. `src/components/SpreadsheetGrid.tsx`
- Dropdown inline status + màu badge/bar cho status mới.

3. `src/components/EditPopup.tsx`
- Dropdown status trong popup edit dùng bộ status mới.

4. `src/components/FilterPopup.tsx`
- Filter status hiển thị đủ status mới.

5. `src/utils/roadmapHelpers.ts`
- Update auto-derive status cho parent để không trả về status cũ.

6. `src/utils/exportToExcel.ts`
- Cập nhật rule `Summary by Object` theo mapping status mới (Dev/PD Handle + In Progress).
- Giữ nguyên format `ID | Nội dung`, thứ tự block, và cách đánh số hiện tại.
- Kiểm tra tương thích `Current View` + `Full Data`.

## Kế hoạch triển khai
### Phase 1 - Core status model
1. Cập nhật type/normalize cho 12 status.
2. Map status cũ `In Progress` -> `Dev In Progress`.
3. Status lạ -> `Not Started`.

### Phase 2 - UI status editing/filter
1. Cập nhật dropdown status ở grid + popup edit.
2. Cập nhật filter status.
3. Soát hiển thị text dài không vỡ layout.

### Phase 3 - Summary by Object + Export
1. Thêm hằng rule cho summary:
- `SUMMARY_DEV_STATUSES = ['Dev Handle', 'Dev In Progress']`
- `SUMMARY_PD_STATUSES = ['PD Handle', 'PD In Progress']`
2. Áp dụng rule mới cho các block `App/Core/Web/Team PD`.
3. Giữ nguyên format nội dung: `Group: Feature`.

### Phase 4 - QA tương thích Excel
1. `Export Current View`:
- đúng rows đang thấy + đúng cột show/hide.
- summary phản ánh đúng rule status mới.
2. `Export Full Data`:
- sheet `Roadmap` chứa đủ status mới.
- không sinh summary (giữ logic hiện tại).
3. Mở file Excel trên dataset lớn, không lỗi encoding/format.

## Acceptance criteria
1. UI cho phép chọn/lọc đầy đủ 12 status.
2. `Summary by Object` nhận `Dev Handle` + `Dev In Progress` cho App/Core/Web.
3. `Summary by Object` nhận `PD Handle` + `PD In Progress` cho Team PD.
4. Không đổi format summary và không vỡ export hiện tại.
5. Dữ liệu cũ vẫn load/export được bình thường.

## Ghi chú
- Nếu cần thêm block KPI riêng cho `BA/QC/Growth`, làm phase mở rộng tiếp theo để tránh thay đổi report format trong lần này.
