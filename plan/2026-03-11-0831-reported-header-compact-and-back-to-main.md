# Plan: Thu gọn Header tránh overlap + thêm quay lại Main Project

## Mục tiêu
- Header không còn đè/overlap lên phần body trong màn `Reported Image Review`.
- Bổ sung lối thoát rõ ràng để quay về trang main của project vì đây chỉ là 1 tính năng con.

## Phạm vi
1. UI trên `Reported Image Review - Main`.
2. Điều hướng từ tính năng `Reported Image Review` về màn hình main project.
3. Đồng bộ style với guideline vàng-trắng hiện tại.

## Vấn đề hiện tại
1. Header đang chiếm chiều cao lớn, bố cục title/subtitle/actions gây chạm với body.
2. Chưa có control điều hướng để user quay lại context chính của tool.

## Giải pháp đề xuất
1. **Thu gọn header (compact header)**
- Giảm chiều cao header xuống dạng slim bar.
- Rút gọn title + subtitle thành 1 dòng chính + meta ngắn.
- Tinh gọn khoảng cách dọc (`padding`, `gap`) để tránh đẩy body xuống hoặc chồng lấn.
- Tách rõ vùng tabs/filter khỏi header nếu cần (đưa xuống row riêng ngay đầu body).

2. **Thêm “Back to Main Project”**
- Thêm nút `Back to Main` hoặc `← Main Project` ở góc trái header.
- Vị trí ưu tiên: cùng hàng với title, dễ thấy khi vào feature.
- Style: button secondary (nền trắng, border nhẹ), icon mũi tên trái.
- Khi click: thoát khỏi màn `Reported Image Review`, quay về màn hình main của project.

3. **Cấu trúc layout chống overlap**
- Đảm bảo `header` và `body` là 2 block độc lập theo trục dọc.
- Body bắt đầu sau header với khoảng cách cố định, không dùng vị trí chồng lớp.
- Áp dụng quy tắc kiểm tra snapshot để xác nhận không còn giao nhau.

## Kế hoạch triển khai (Pencil + app)
1. Cập nhật frame header thành bản compact trên `pencil-new.pen`.
2. Thêm component/nút `Back to Main` trong header.
3. Chỉnh lại body offset/gap để không overlap.
4. Chụp screenshot trước/sau để confirm.
5. Triển khai code điều hướng trong app:
- thêm action mở main view.
- giữ state filter/view cần thiết nếu user quay lại feature.

## Test checklist
1. Header không đè lên body ở mọi frame liên quan.
2. Nút `Back to Main` hiển thị rõ, bấm được, về đúng màn main project.
3. Không vỡ layout trên viewport desktop hiện tại.
4. Không ảnh hưởng các action khác trong header (search/filter/tab).

## Tiêu chí hoàn tất
1. Layout sạch: không còn overlap header/body.
2. Có luồng quay lại main project rõ ràng và nhất quán UX.
3. Screenshot review đạt yêu cầu trước khi code production.
