# Plan: Thiết kế đẹp (high-fidelity) các trang `Reported Image Review` bằng Pencil

## Mục tiêu
- Thiết kế lại toàn bộ trải nghiệm `Reported Image Review` theo hướng trực quan, tập trung ảnh, dễ review nhanh.
- Đảm bảo UI có chất lượng high-fidelity: bố cục rõ, typography nhất quán, màu sắc có chủ đích, dễ mở rộng khi dữ liệu lớn.
- Chuẩn bị đủ màn hình và state để có thể chuyển sang code mà không thiếu đặc tả.

## Phạm vi
Bao gồm:
1. Main page (list theo category + grid ảnh).
2. Viewer page (ưu tiên ảnh dọc, chỉnh trực tiếp status/phase).
3. Edit flow từ viewer (entry point + vùng thông tin chỉnh sửa).
4. Empty/loading/error states.
5. Component set và design tokens dùng lại.

Không bao gồm:
- Code production React/Next.
- Tích hợp API backend.

## Định hướng visual
1. **Visual style**: sáng, sạch, nhấn mạnh nội dung ảnh và trạng thái review.
2. **Typography**:
- Heading rõ cấp độ (màn hình, section, card title).
- Metadata nhỏ hơn nhưng vẫn đọc tốt.
3. **Màu sắc**:
- Màu trung tính cho nền.
- Màu trạng thái rõ ràng cho Status, Priority, Phase.
4. **Spacing**:
- Grid đều, giảm khoảng trống chết.
- Ưu tiên diện tích hiển thị ảnh theo chiều dọc.

## Cấu trúc màn hình cần thiết kế
1. **Reported Image Review - Main**
- Thanh trên: title, total count, search, quick filter, actions.
- Cột trái: danh sách category + count + trạng thái chọn.
- Nội dung chính: masonry/grid ảnh tối ưu cho ảnh dọc.
- Card hiển thị: thumbnail lớn, item name, group prefix, status/phase tags, số lượng ảnh.

2. **Reported Image Review - Viewer**
- Ảnh chính chiếm phần lớn diện tích.
- Dải thumbnail cho item nhiều ảnh.
- Panel thông tin: item info, quick note, status dropdown, phase dropdown.
- Điều hướng: prev/next ảnh và đóng viewer.
- CTA: `Open Full Edit`.

3. **Reported Image Review - States**
- Không có dữ liệu Reported.
- Category được chọn nhưng không có item.
- Item có status Reported nhưng chưa có ảnh.
- Loading skeleton + lỗi tải ảnh.

4. **Reported Image Review - Edit Entry**
- Trạng thái khi mở từ viewer sang popup edit.
- Giữ ngữ cảnh item/category để quay lại viewer nhanh.

## Kế hoạch triển khai bằng Pencil
1. Lấy context hiện tại
- Dùng `get_editor_state` để xác định canvas active.
- Dùng `batch_get` đọc reusable components có thể tái sử dụng.

2. Tạo style foundation
- Dựng frame `Style Guide - Reported Review`.
- Định nghĩa text styles, color chips, spacing scale, radius/shadow.

3. Dựng màn Main (desktop trước)
- Tạo bố cục left rail + content grid.
- Tối ưu số card/category hiển thị trên 1 viewport.
- Tạo card component có biến thể: 1 ảnh / nhiều ảnh / không ảnh.

4. Dựng màn Viewer
- Ưu tiên ảnh dọc lớn nhất có thể.
- Cân đối panel thông tin bên phải, đảm bảo status/phase đổi trực tiếp dễ thao tác.

5. Dựng states và flow edit
- Tạo frame riêng cho empty/loading/error.
- Thêm state khi bấm `Open Full Edit` để mô tả chuyển cảnh.

6. Review và polish
- Chụp screenshot từng màn bằng `get_screenshot`.
- Rà soát alignment, density, contrast, khả năng đọc.
- Chốt phiên bản high-fidelity.

## Component checklist
- `ReportedTopBar`
- `CategoryRailItem`
- `ReportedImageCard`
- `ImageCardMetaRow`
- `ViewerMainImage`
- `ViewerThumbnailStrip`
- `ViewerInfoPanel`
- `InlineStatusSelect`
- `InlinePhaseSelect`
- `EmptyStateBlock`
- `LoadingSkeletonBlock`

## Quy tắc UX bắt buộc
1. Ảnh dọc là ưu tiên số 1 về diện tích hiển thị.
2. User đổi `Status` và `Phase` ngay trong viewer, phản hồi tức thì.
3. Khi hide cột Phase ở grid, tag phase vẫn nhận diện được ở context group/item.
4. Với item nhiều ảnh, luôn có chỉ báo số lượng ảnh rõ ràng.

## Tiêu chí hoàn tất
1. Có đầy đủ Main / Viewer / States / Edit Entry ở mức high-fidelity.
2. Bộ component đủ để tái sử dụng và scale.
3. Bố cục giảm khoảng trống thừa, tăng tối đa vùng hiển thị ảnh.
4. Có screenshot review để đối chiếu trước khi code.

## Deliverables
1. 01 file `.pen` chứa toàn bộ frame thiết kế.
2. 01 frame style foundation.
3. 01 bộ screenshot các màn chính và states.
