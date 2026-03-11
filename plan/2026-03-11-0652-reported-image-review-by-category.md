# Plan: Reported Image Review (theo Category, có edit item)

## Mục tiêu
- Tạo màn hình review tập trung vào ảnh cho toàn bộ item `Reported`.
- User có thể duyệt nhanh theo `Category`, thấy đủ thông tin ngắn + toàn bộ ảnh của item.
- Sau review, user có thể chỉnh sửa thông tin item ngay trong luồng review.

## Làm rõ dữ liệu Reported
- Hiện tại hệ thống đang đánh dấu `Reported` ở `priority` (không phải `status`).
- Phiên bản đầu sẽ lọc theo `priority === 'Reported'` để đồng nhất logic hiện có.

## Phạm vi
Bao gồm:
1. Mở popup/panel chuyên cho review ảnh Reported.
2. Filter theo Category trong màn hình review.
3. Hiển thị item card có nhiều ảnh (thumbnail + badge số ảnh).
4. Mở chi tiết để xem gallery ảnh đầy đủ.
5. Chỉnh sửa item từ màn hình review (reuse `EditPopup`).

Không bao gồm:
- Thay đổi schema dữ liệu ảnh.
- Workflow duyệt/approve có lưu trạng thái review riêng.

## UX đề xuất
### 1) Entry point
- Thêm nút mới: `Reported Review` trên toolbar (nhóm action bên phải hoặc trong Settings).

### 2) Bố cục màn hình review
- Trái: danh sách Category + số lượng item Reported.
- Phải: lưới card item đã lọc theo category.
- Card item hiển thị:
  - Tên item + breadcrumb ngắn (Category / Subcategory / Group)
  - Quick note (rút gọn)
  - Ảnh cover (ảnh đầu tiên)
  - Badge số ảnh: `+N` nếu nhiều ảnh

### 3) Xem ảnh chi tiết
- Click card mở viewer chi tiết:
  - Carousel/slider qua toàn bộ ảnh của item
  - Thumb strip để nhảy ảnh nhanh
  - Hiển thị metadata (tên item, priority, status, phase, note)

### 4) Edit item sau review
- Nút `Edit item` trong viewer/card.
- Reuse `EditPopup` hiện có để sửa info + ảnh (upload/delete/sắp xếp theo khả năng hiện tại).
- Sau khi save, màn hình review tự refresh dữ liệu đang mở.

## Thiết kế kỹ thuật
### 1) Component mới
- `src/components/ReportedImageReviewPopup.tsx` (mới)
  - Props: `isOpen`, `onClose`, `items`, `categories`, `onEditItem`.
  - State nội bộ: category đang chọn, item đang chọn, ảnh index hiện tại, search (optional).

### 2) Wiring từ `page.tsx`
- Thêm state: `showReportedImageReview`.
- Tạo selector memo để lấy item Reported có ảnh:
  - `priority === 'Reported'`
  - `images?.length > 0` (có thể thêm toggle hiển thị cả item không ảnh ở phase sau).
- Truyền callback edit sang review popup để gọi luồng sửa item hiện tại.

### 3) Reuse chỉnh sửa
- Dùng `EditPopup` hiện hữu thay vì làm form mới.
- Khi user bấm edit từ review popup:
  - mở `EditPopup` với item tương ứng,
  - save xong cập nhật `data` như flow hiện tại.

### 4) Tối ưu cho item nhiều ảnh
- Lazy load ảnh (`loading="lazy"`).
- Thumbnail strip có scroll ngang.
- Ảnh lớn giới hạn chiều cao theo viewport để tránh tràn.

## Kế hoạch triển khai
1. Thêm entry point mở `Reported Image Review`.
2. Implement popup review + category filter + grid card.
3. Implement viewer ảnh đầy đủ cho item nhiều ảnh.
4. Kết nối nút edit item qua `EditPopup`.
5. Đồng bộ refresh dữ liệu sau khi edit.
6. Test manual các case + chạy `lint/build`.

## Test case bắt buộc
1. Có nhiều Category: filter category đổi đúng tập item.
2. Item có 1 ảnh: viewer hiển thị đúng.
3. Item có nhiều ảnh: chuyển ảnh next/prev và chọn thumbnail đúng.
4. Edit từ review popup: lưu xong quay lại list, dữ liệu cập nhật ngay.
5. Item Reported không có ảnh (nếu cho hiển thị): card fallback không vỡ layout.
6. `npm run lint` và `npm run build` pass.

## Rủi ro và giảm thiểu
1. Nhiều ảnh gây lag:
   - lazy load + giới hạn kích thước hiển thị.
2. Luồng edit lồng popup dễ rối state:
   - dùng single source of truth ở `page.tsx`, đóng/mở theo thứ tự rõ ràng.
3. Hiểu nhầm `status reported` vs `priority reported`:
   - gắn label rõ trong UI (`Reported (Priority)`).

## Tiêu chí hoàn tất
1. User có màn hình review tập trung ảnh cho item Reported.
2. Có filter theo Category.
3. Xem được tất cả ảnh kể cả item có nhiều ảnh.
4. Sửa được item ngay trong flow review.
5. Không phá vỡ luồng filter/edit hiện tại.
