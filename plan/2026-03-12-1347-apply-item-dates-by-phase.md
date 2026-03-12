# Plan: Apply Start/End Date cho item theo Phase (có nút Apply All)

## Mục tiêu
- Tự động set `startDate` + `endDate` cho item dựa trên phase đã gán.
- Giảm thao tác nhập tay date cho từng item.
- Có thao tác hàng loạt `Apply all`.

## User story
1. User có phase `Phase 1` với ngày `2026-03-22` đến `2026-03-25`.
2. Item A đã được gán `phaseIds` chứa `Phase 1`.
3. Khi bấm apply, Item A tự nhận:
- `startDate = 2026-03-22`
- `endDate = 2026-03-25`

## Phạm vi
- Áp dụng cho node type `item` (không áp cho `category/subcategory`).
- Dữ liệu phase lấy từ `milestones`.
- Không đổi schema JSON.

## Rule nghiệp vụ
### 1) Apply theo phase cụ thể
- Input: `phaseId` được chọn.
- Update các item có `phaseIds` chứa `phaseId`.
- Chỉ apply nếu phase có đủ `startDate` và `endDate`.
- Nếu phase chưa có lịch (`Unscheduled`) thì bỏ qua.

### 2) Apply All
- Chạy cho toàn bộ phase có lịch.
- Với mỗi item:
  - Lấy các phase mà item đã gán và có lịch.
  - Nếu có >= 1 phase hợp lệ:
    - `startDate` = ngày nhỏ nhất trong các phase hợp lệ.
    - `endDate` = ngày lớn nhất trong các phase hợp lệ.
  - Nếu không có phase hợp lệ: bỏ qua item.

### 3) Item có nhiều phase
- Apply phase cụ thể: dùng chính date của phase đó.
- Apply all: dùng khoảng min-max của toàn bộ phase hợp lệ đã gán.

### 4) Phase chưa có ngày
- Không áp date.
- Trả thống kê số item bị skip do phase chưa có lịch.

## UX đề xuất
1. Trong panel `Phases`:
- Mỗi phase có nút `Apply to items`.
- Footer có nút `Apply all`.
2. Khi bấm apply:
- Hiện confirm: “Sẽ cập nhật date cho X item. Tiếp tục?”
- Trong confirm phải liệt kê **tất cả item** sẽ bị cập nhật (không rút gọn).
- Mỗi dòng nên có: `Category > Subcategory > Item name`.
3. Sau khi chạy:
- Toast kết quả: `Đã cập nhật X item, bỏ qua Y item (phase chưa có lịch).`

## Kế hoạch triển khai
### Phase 1 - Utility xử lý dữ liệu
1. Tạo util cập nhật tree item theo rules:
- `applyDatesByPhase(items, milestones, phaseId)`
- `applyDatesByAllPhases(items, milestones)`
2. Trả về metadata:
- `updatedCount`, `skippedUnscheduledCount`, `skippedNoMatchCount`.

### Phase 2 - Nối vào UI Phase panel
1. Mở rộng `MilestoneEditor`:
- thêm callback `onApplyPhase(phaseId)` và `onApplyAll()`.
2. Thêm nút:
- row-level `Apply to items`
- global `Apply all`.

### Phase 3 - Wiring từ page state
1. Ở `src/app/page.tsx`:
- xử lý apply bằng cách mutate `data.items` qua util.
- gọi `setData` + autosave flow hiện có (`shouldSave=true`).
2. Trước khi apply thật:
- build danh sách item affected và truyền vào `showConfirm`.
- confirm text gồm số lượng + danh sách đầy đủ item.
3. Hiển thị toast thống kê kết quả sau khi user confirm.

### Phase 4 - QA
1. Item gán đúng phase => date được cập nhật đúng.
2. Phase unscheduled => không cập nhật, có thông báo skip.
3. Item multi-phase:
- apply 1 phase => theo phase đó.
- apply all => min-max.
4. Không regression filter, export excel, reported mode.

## File dự kiến tác động
1. `src/components/MilestoneEditor.tsx`
2. `src/app/page.tsx`
3. `src/utils/roadmapHelpers.ts` (hoặc tạo util mới `src/utils/phaseDateApply.ts`)
4. test mới cho util (vitest)

## Rủi ro
1. Ghi đè date đã nhập tay trước đó.
2. Item nhiều phase dễ gây hiểu nhầm nếu không có rule min-max rõ.
3. Apply all trên dataset lớn có thể tốn thời gian nếu không tối ưu traversal.
4. Confirm chứa list quá dài có thể khó đọc.

## Giảm rủi ro
1. Confirm trước khi apply.
2. Toast summary sau apply.
3. Confirm dùng khung scroll (UI) nhưng vẫn hiển thị đủ item.
4. Có thể mở rộng bước sau:
- thêm mode `Overwrite only empty dates` (không nằm trong scope hiện tại).

## Tiêu chí hoàn tất
1. Có thể apply date theo 1 phase cụ thể.
2. Có thể apply all phases.
3. Date item cập nhật đúng theo rule đã định.
4. Không phá flow save/load/export hiện tại.
