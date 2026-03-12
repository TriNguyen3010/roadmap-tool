# Update Plan: Apply date theo phase chỉ cho Group

## Mục tiêu
- Đổi rule `Apply to items` thành `Apply to groups`.
- Chỉ cập nhật `startDate/endDate` cho node `type = group`.
- Không áp dụng cho `item/category/subcategory`.

## Bối cảnh bug
- Dữ liệu thực tế đang gán `phaseIds` chủ yếu ở `group`.
- Logic hiện tại apply cho `item` nên luôn báo không có đối tượng cập nhật.

## Scope cập nhật
1. Đổi tên hành động UI:
- `Apply to items` -> `Apply to groups`
- `Apply all` giữ nguyên, nhưng ý nghĩa là apply cho tất cả group có phase hợp lệ.

2. Đổi logic apply:
- Chỉ quét node `group`.
- Match theo `phaseIds` của `group`.

3. Confirm trước khi apply:
- `Sẽ cập nhật date cho X group. Tiếp tục?`
- Liệt kê đầy đủ tất cả group bị ảnh hưởng:
  - `Category > Subcategory > Group name`

## Rule nghiệp vụ mới
### 1) Apply theo phase cụ thể
- Input: `phaseId`.
- Cập nhật các `group` có chứa `phaseId`.
- Nếu phase chưa có lịch (`Unscheduled`): skip.

### 2) Apply all
- Với mỗi `group`:
  - Lấy tất cả phase được gán cho group và có lịch.
  - Nếu có phase hợp lệ:
    - `startDate` = min startDate
    - `endDate` = max endDate
  - Nếu không có phase hợp lệ: skip.

### 3) Group đã có date trùng
- Không ghi đè nếu `startDate/endDate` đã trùng kết quả tính.
- Không đưa vào danh sách affected.

## Kế hoạch triển khai
### Phase 1 - Refactor util
1. Đổi util apply từ target `item` sang target `group`.
2. Đổi metadata:
- `affectedGroups`, `updatedCount`, `skippedUnscheduledCount`, `skippedNoMatchCount`.
3. Bổ sung test cho case group-only.

### Phase 2 - Cập nhật UI + message
1. `MilestoneEditor` đổi text nút sang `Apply to groups`.
2. `ConfirmDialog` hiển thị message theo nhóm `group`.
3. Toast summary dùng từ `group`.

### Phase 3 - Wiring vào page
1. Hàm apply phase/all phase dùng util group-only.
2. Giữ luồng save hiện tại sau khi confirm.

### Phase 4 - QA
1. Group có phase + phase có lịch -> cập nhật đúng.
2. Group có phase nhưng unscheduled -> skip đúng.
3. Group nhiều phase -> min/max đúng.
4. Không regression với filter/export/reported mode.

## File dự kiến tác động
1. `src/utils/phaseDateApply.ts`
2. `src/utils/phaseDateApply.test.ts`
3. `src/components/MilestoneEditor.tsx`
4. `src/app/page.tsx`

## Tiêu chí hoàn tất
1. Bấm apply không còn báo sai “không có item” khi thực tế có group thuộc phase.
2. Confirm list hiển thị đầy đủ danh sách group sẽ cập nhật.
3. Dữ liệu save thành công và reload vẫn giữ đúng date đã apply.
