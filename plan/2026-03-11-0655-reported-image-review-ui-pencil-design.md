# Plan: Thiết kế UI `Reported Image Review` bằng Pencil

## Mục tiêu
- Dùng Pencil để thiết kế hoàn chỉnh UI cho tính năng `Reported Image Review`.
- UI tập trung vào ảnh, review theo `Category`, và có điểm vào để `Edit item`.
- Bao quát case item có nhiều ảnh.

## Phạm vi
Bao gồm:
1. Thiết kế màn chính review ảnh Reported.
2. Thiết kế card item (ảnh + thông tin ngắn + số lượng ảnh).
3. Thiết kế viewer chi tiết ảnh (gallery/thumbnail).
4. Thiết kế trạng thái rỗng, loading, và không có ảnh.

Không bao gồm:
- Code frontend React.
- Logic backend/API.

## Output cần có (trong file .pen)
1. **Screen A - Reported Image Review (Desktop)**
   - Header: title + tổng số item + search + filter chips nhanh.
   - Left rail: danh sách category + count.
   - Main area: grid card ảnh Reported.
2. **Screen B - Image Viewer Detail**
   - Ảnh chính lớn.
   - Thumbnail strip ngang cho item nhiều ảnh.
   - Metadata + quick note + breadcrumb.
   - Nút `Edit item` và điều hướng next/prev item.
3. **Screen C - States**
   - Empty category.
   - Không có item Reported.
   - Item Reported chưa có ảnh (placeholder).
4. **Component set dùng lại**
   - `CategoryFilterItem`
   - `ReportedImageCard`
   - `ImageThumb`
   - `MetadataRow`

## Kiến trúc UI đề xuất
- Bố cục desktop: 12-column grid.
  - Left rail: 3 cột.
  - Content: 9 cột.
- Card ảnh:
  - Ảnh cover tỷ lệ 16:10.
  - Badge góc phải trên: số ảnh (`3`, `5`, ...).
  - Tên item 2 dòng + breadcrumb ngắn + priority/status chip.
- Viewer:
  - Split 70/30 (ảnh / metadata).
  - Thumbnail strip tối đa 8 thumb hiển thị, overflow scroll.

## Kế hoạch thực hiện bằng Pencil
1. **Khởi tạo canvas & lấy context**
   - Dùng `get_editor_state` kiểm tra file/editor hiện tại.
   - Dùng `batch_get` đọc các reusable components đang có để tái sử dụng style.
2. **Dựng frame màn A**
   - Tạo frame `Reported Image Review - Desktop`.
   - Dựng header + sidebar category + grid card.
3. **Tạo reusable component card**
   - Dựng `ReportedImageCard` với biến thể: có ảnh / nhiều ảnh / không ảnh.
4. **Dựng màn B viewer**
   - Tạo modal/frame chi tiết ảnh + metadata + nút edit.
5. **Dựng màn C states**
   - Empty state + no-data + placeholder state.
6. **Polish**
   - Kiểm tra khoảng cách, typography, alignment.
   - Chụp screenshot từng màn bằng `get_screenshot` để review.

## Quy chuẩn nội dung hiển thị
- Label rõ ràng: `Reported (Priority)` để tránh nhầm với Status.
- Metadata item: `Category / Subcategory / Group / Phase / Team / Status / Priority`.
- Với nhiều ảnh: luôn hiển thị số lượng ảnh ở card và viewer.

## Rủi ro và giảm thiểu
1. Không có design system component phù hợp:
   - Dựng component cơ bản trong Pencil, ưu tiên consistency spacing.
2. Mật độ thông tin cao dễ rối:
   - Giới hạn thông tin trên card, dồn chi tiết vào viewer.
3. Nhiều ảnh làm UI nặng:
   - Chỉ render ảnh cover + thumbnail; ảnh full ở viewer.

## Tiêu chí hoàn tất
1. Có đủ 3 màn (Main, Viewer, States) trên canvas.
2. Có component card tái sử dụng cho item nhiều ảnh.
3. Luồng review theo category và điểm vào edit thể hiện rõ trong UI.
4. Screenshot review cho từng màn đạt yêu cầu bố cục và readability.
