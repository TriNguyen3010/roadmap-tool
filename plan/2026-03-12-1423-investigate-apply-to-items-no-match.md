# Plan điều tra bug: bấm `Apply to items` nhưng báo không có item

## Mục tiêu
- Xác định chính xác vì sao UI báo `Không có item nào cần cập nhật theo phase này.` dù user thấy nhiều item ở `Phase 1`.
- Chỉ điều tra và kết luận nguyên nhân; chưa sửa logic trong bước này.

## Triệu chứng
- User bấm `Apply to items` trong panel `Phases`.
- Hệ thống hiển thị thông báo không có item được cập nhật.
- Kỳ vọng: có nhiều item thuộc phase tương ứng phải được apply date.

## Giả thuyết ưu tiên (theo code hiện tại)
1. `Apply` chỉ quét node `type === 'item'`, không quét `group/subcategory/category`.
- Nếu phase đang gán trên `group` thay vì `item`, kết quả sẽ là 0.
- Tham chiếu: `src/utils/phaseDateApply.ts` dòng check `if (node.type === 'item')`.

2. Item đã có `startDate/endDate` trùng với date phase.
- Logic chỉ đưa vào `affectedItems` khi date thay đổi.
- Nếu đã trùng, hệ thống xem như “không cần cập nhật”.
- Tham chiếu: điều kiện so sánh date trước khi `affectedItems.push(...)`.

3. Phase chọn để apply là `Unscheduled` (thiếu start/end).
- Khi phase chưa đủ lịch, tất cả item match phase sẽ bị skip.
- UI hiện thông báo “không có item nào được cập nhật”.

4. Lệch `phaseId` giữa milestone và item.
- Ví dụ item giữ id cũ/khác chuẩn nên `phaseIds.includes(phaseId)` fail.

## Phạm vi điều tra
1. Luồng `MilestoneEditor -> handleApplyDatesByPhase -> applyDatesByPhase`.
2. Dữ liệu runtime tại thời điểm user bấm apply:
- `phaseId` đang apply
- milestone schedule tương ứng
- số lượng node có phase theo từng type (`item/group/...`)
- số item match nhưng “không đổi date”
- số item skip do unscheduled

## Kế hoạch thực hiện
### Phase 1 - Reproduce có kiểm soát
1. Tạo 4 case mẫu:
- Case A: phase gán trực tiếp trên `item`, date khác phase.
- Case B: phase gán trên `group`, item con không có phase.
- Case C: item có phase nhưng date đã trùng.
- Case D: phase unscheduled.
2. Chạy `Apply to items` cho từng case và ghi lại kết quả toast.

### Phase 2 - Instrumentation tạm thời
1. Log debug trong `handleApplyDatesByPhase`/`applyDatesByPhase` (chỉ local):
- `phaseId`, `phase start/end`, `total item nodes`
- `matchedByPhaseCount`, `affectedCount`, `unchangedCount`, `unscheduledSkipCount`
2. Nếu cần, thêm helper đọc nhanh thống kê cây dữ liệu theo type + phase.

### Phase 3 - Đối chiếu với dữ liệu thực tế user
1. Dump danh sách item/group đang có `phaseId = phase_1` (hoặc id phase user chọn).
2. So sánh:
- số phần tử ở `group`
- số phần tử ở `item`
- số item có date đã trùng
3. Kết luận nguyên nhân chính (1 hoặc nhiều nguyên nhân kết hợp).

### Phase 4 - Kết quả điều tra
1. Trả báo cáo ngắn:
- nguyên nhân gốc
- bằng chứng (count + sample item path)
- mức độ ảnh hưởng
2. Đề xuất hướng fix (chưa code trong plan này).

## Tiêu chí hoàn tất
1. Có nguyên nhân rõ ràng, tái hiện được.
2. Có số liệu định lượng (không chỉ phỏng đoán).
3. Có danh sách item mẫu minh họa cho từng nhóm nguyên nhân.
