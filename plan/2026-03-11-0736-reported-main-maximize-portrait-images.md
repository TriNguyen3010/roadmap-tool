# Plan: Maximize ảnh dọc trên `Reported Image Review - Main`

## Mục tiêu
- Ảnh dọc phải hiển thị **to nhất có thể** trong màn Main.
- Giảm tối đa diện tích trống không phục vụ review.
- Vẫn giữ đủ thông tin tối thiểu để nhận diện item.

## Vấn đề hiện tại
1. Thumbnail ảnh đang quá nhỏ so với mục tiêu review bằng hình.
2. Grid có khoảng trống lớn giữa/ dưới card.
3. Card ưu tiên text nhiều hơn ảnh, làm ảnh mất vai trò chính.

## Nguyên tắc thiết kế cho bản mới
1. Ảnh là trung tâm (image-first), text là phụ.
2. Ưu tiên khung ảnh dọc lớn: `3:4` hoặc `4:5`.
3. Dồn metadata sang badge ngắn để nhường diện tích cho ảnh.
4. Bố cục phải “đầy khung” (high utilization), tránh khoảng trắng lớn.

## Phạm vi
Bao gồm:
1. Refactor grid Main trong Pencil.
2. Refactor card layout theo kiểu ảnh dọc lớn.
3. Rebalance số cột theo viewport để tối ưu diện tích ảnh.

Không bao gồm:
- Thay đổi Viewer detail.
- Thay đổi logic filter/data.

## Hướng triển khai trên Pencil
1. **Đổi grid strategy**
   - Giảm số cột (ưu tiên 2 cột ở desktop chuẩn, 3 cột chỉ cho màn rất rộng).
   - Dùng cột rộng hơn để ảnh dọc lớn hơn.
2. **Đổi card template sang image-first**
   - Ảnh đặt trên cùng, chiếm phần lớn card.
   - Kích thước ảnh mục tiêu: cao ~220-280px/card (tuỳ cột).
   - Text chỉ 1 dòng title + badge dòng dưới.
3. **Giảm khoảng trống dọc**
   - Giảm margin/padding thừa của content wrapper.
   - Giảm gap giữa card theo trục dọc.
   - Bổ sung card mẫu để lấp đầy vùng trống còn lại.
4. **Badge compact**
   - Badge `Reported` + `N imgs` đặt ngay dưới title.
   - Không dùng câu mô tả dài trong card.

## KPI thiết kế (acceptance)
1. Ảnh dọc hiển thị lớn hơn rõ rệt so với bản hiện tại (chiều cao ảnh tăng >= 1.8x).
2. Tỉ lệ diện tích card dành cho ảnh >= 70%.
3. Vùng trống lớn trong content giảm rõ (không còn khoảng trắng “mảng lớn”).
4. Không có lỗi clipping/misalignment theo `snapshot_layout`.

## Rủi ro và giảm thiểu
1. Ảnh lớn quá làm giảm số item thấy cùng lúc:
   - Chốt mức cân bằng: vẫn thấy tối thiểu 6 item/viewport desktop.
2. Text quá ít gây thiếu ngữ cảnh:
   - Giữ title ngắn + 2 badge cố định để scan nhanh.
3. Grid đổi cột gây lệch responsive:
   - Định rõ rule: desktop chuẩn 2 cột, ultra-wide 3 cột.
