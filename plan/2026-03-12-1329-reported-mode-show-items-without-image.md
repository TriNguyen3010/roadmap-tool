# Plan: Show luôn item thiếu ảnh trong Report mode

## Mục tiêu
- Trong `Reported Image Review`, vẫn hiển thị các item `Priority = Reported` dù chưa có ảnh.
- Người review nhìn thấy đầy đủ scope item ngay trên màn hình, không chỉ qua cảnh báo text.

## Phạm vi
- Chỉ áp dụng cho màn hình `reportedMode` (không đổi layout roadmap thường).
- Không đổi schema dữ liệu.
- Không đổi logic filter hiện có (category/status/team/phase/subcategory vẫn giữ nguyên).

## Hiện trạng
1. `reportedEntries` đã chứa cả item có ảnh và không ảnh.
2. `visibleReportedCards` chỉ map từ `reportedEntries` có ảnh.
3. Khi còn item thiếu ảnh:
- `ready`: chỉ hiện card có ảnh + cảnh báo số item thiếu ảnh.
- `reported-no-image`: chỉ hiện empty-state + sample list text.

## Đề xuất UX
1. Grid Reported hiển thị cả 2 loại card:
- Card có ảnh: giữ nguyên như hiện tại.
- Card thiếu ảnh: card placeholder (khung ảnh rỗng + label `No image`) nhưng vẫn có metadata/status/phase.
2. Card thiếu ảnh có hành vi:
- Click mở `EditPopup` để thêm ảnh nhanh (thay vì mở viewer ảnh).
3. Header counter giữ đủ:
- `total reported`, `có ảnh`, `thiếu ảnh`.
4. Category badge tiếp tục theo format `withImageCount/reportedCount`.

## Kế hoạch triển khai
### Phase 1 - Data model cho card unified
1. Tạo mảng card unified từ `reportedEntries`:
- `kind: "with-image" | "without-image"`.
- giữ `row`, `categoryName`, `subcategoryName`, `phaseSummary`, `images`.
2. Sort giữ như cũ: category -> item name.
3. `visibleReportedCards` đổi thành `visibleReportedEntries` (bao gồm cả thiếu ảnh).

### Phase 2 - Render card thiếu ảnh trong grid
1. Grid render từ danh sách unified.
2. Với `without-image`:
- khối preview dùng `aspect-[3/4]`, nền sáng, icon/label `No image`.
- không hiện badge `+N`.
3. Metadata/status/phase giữ đồng nhất với card có ảnh.

### Phase 3 - Interaction
1. Click card có ảnh: mở image viewer như hiện tại.
2. Click card thiếu ảnh:
- nếu `canEdit`: mở `EditPopup` vào item đó để upload ảnh.
- nếu viewer mode: chỉ mở quick preview read-only (hoặc toast hướng dẫn unlock editor).

### Phase 4 - State machine và message
1. Cập nhật `resolveReportedImageReviewMainState` để `ready` phản ánh “có item reported trong view”, không bắt buộc có ảnh.
2. `reported-no-image` vẫn giữ cho case đặc biệt nếu cần empty-style riêng, hoặc bỏ state này để đơn giản hóa UI.
3. Message cảnh báo thiếu ảnh chuyển thành info phụ, không chặn hiển thị item.

### Phase 5 - QA & Regression
1. Case mix (có ảnh + thiếu ảnh): grid hiển thị đủ tất cả item.
2. Case toàn bộ thiếu ảnh: vẫn thấy danh sách card placeholder đầy đủ.
3. Case filter category: số lượng và card khớp đúng category.
4. Không regression với:
- đổi status/phase inline ở viewer.
- reported category filter.
- save flow hiện tại.

## File dự kiến tác động
1. `src/components/SpreadsheetGrid.tsx`
- unified card model, render logic, click behavior cho card thiếu ảnh.
2. `src/utils/reportedImageReviewStates.ts`
- điều chỉnh quy tắc `ready/reported-no-image` nếu cần.
3. `src/utils/reportedImageReviewStates.test.ts`
- cập nhật test theo state rule mới.

## Rủi ro
1. Card thiếu ảnh nhiều có thể làm grid dài hơn -> cần giữ lazy render/lazy image như hiện có.
2. Nếu đổi state machine mạnh, có thể ảnh hưởng logic empty-state hiện tại.
3. Flow click card thiếu ảnh phải rõ ràng để user không hiểu nhầm là lỗi tải ảnh.

## Tiêu chí hoàn tất
1. Report mode luôn show đủ item `Priority = Reported` trong scope, kể cả chưa có ảnh.
2. User biết item nào thiếu ảnh ngay trên grid, không cần đọc cảnh báo text mới biết.
3. Không làm hỏng filter/save/viewer flow hiện tại.
