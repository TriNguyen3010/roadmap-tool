# Plan: Làm rõ message “item reported chưa có ảnh” trong Reported Image View

## Vấn đề người dùng gặp
- Trong màn hình Reported Image Review vẫn xem được ảnh, nhưng xuất hiện dòng:
  - `1 item reported chưa có ảnh trong scope hiện tại.`
- Người dùng hiểu đây là lỗi hệ thống.

## Nguyên nhân thực tế (từ code)
1. Đây không phải error-state.
2. Message chỉ hiển thị khi:
- `reportedMainState === 'ready'` (tức là vẫn có ảnh để xem)
- và `visibleReportedWithoutImageCount > 0` (vẫn còn item reported thiếu ảnh trong scope/filter hiện tại).
3. Mục đích hiện tại là cảnh báo dữ liệu thiếu ảnh, không phải lỗi render/save.

## Mục tiêu
- Giữ signal nghiệp vụ “còn item thiếu ảnh”.
- Đổi cách diễn đạt để user không hiểu nhầm là bug.
- Nếu cần, cho phép ẩn/tắt thông báo này để giảm nhiễu khi review ảnh.

## Đề xuất UX/message
### Option A (khuyến nghị)
1. Đổi câu sang dạng trung tính:
- `Còn 1 item Reported chưa đính kèm ảnh trong phạm vi lọc hiện tại.`
2. Đổi style thành “info nhẹ” (icon/info tone), tránh cảm giác lỗi.

### Option B
1. Giữ message nhưng thêm CTA:
- `Xem danh sách item thiếu ảnh`
2. Mở danh sách tên item thiếu ảnh (top N) ngay dưới message.

### Option C
1. Thêm toggle:
- `Ẩn cảnh báo thiếu ảnh`
2. Chỉ ảnh hưởng UI session hiện tại (không cần lưu settings).

## Phạm vi code
1. `src/components/SpreadsheetGrid.tsx`
- Khối inline alerts ở Reported mode (vùng hiển thị message hiện tại).
- Wording + style + optional CTA/toggle.

2. `src/utils/reportedImageReviewStates.ts` (chỉ khi cần)
- Không bắt buộc đổi state machine nếu chỉ đổi message.

## Kế hoạch triển khai
### Phase 1 - Message clarification
1. Đổi text sang ngôn ngữ info trung tính.
2. Giữ logic đếm hiện tại.

### Phase 2 - Optional discoverability
1. Thêm “Xem item thiếu ảnh” (nếu chọn Option B).
2. Hiển thị sample tên item thiếu ảnh để user xử lý nhanh.

### Phase 3 - QA
1. Case có cả item có ảnh + thiếu ảnh -> vẫn xem ảnh bình thường, message rõ nghĩa.
2. Case tất cả reported đều thiếu ảnh -> vẫn vào state `reported-no-image` như cũ.
3. Không ảnh hưởng flow save/filter/category.

## Acceptance criteria
1. User không còn hiểu nhầm đây là lỗi hệ thống.
2. Khi còn item thiếu ảnh, vẫn có tín hiệu nhắc phù hợp.
3. Không regression Reported Image Review states hiện tại.
