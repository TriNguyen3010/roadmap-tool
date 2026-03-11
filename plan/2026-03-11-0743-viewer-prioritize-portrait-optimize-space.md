# Plan: Viewer - ưu tiên ảnh dọc, tối ưu khoảng trống

## Mục tiêu
- Màn `Reported Image Review - Viewer` ưu tiên hiển thị ảnh dọc lớn nhất có thể.
- Giảm diện tích trống không cần thiết trong khung viewer.
- Giữ hành động `Edit Item` rõ ràng, metadata đủ dùng nhưng gọn.

## Vấn đề hiện tại
1. Khu metadata bên phải đang chiếm chỗ nhưng chưa tận dụng hết chiều cao.
2. Vùng ảnh lớn còn chưa tối ưu theo tỷ lệ ảnh dọc (portrait-first).
3. Thumbnail strip và action area chưa tổ chức để lấp đầy không gian hợp lý.

## Phạm vi
Bao gồm:
1. Refactor layout screen `EQZTl` trong Pencil.
2. Tối ưu hero image cho ảnh dọc.
3. Tối ưu panel metadata + actions + thumbnail.

Không bao gồm:
- Thay đổi data/source ảnh.
- Thay đổi logic navigation item.

## Hướng thiết kế mới (Viewer)
1. **Layout split 2 vùng rõ ràng**
   - Trái: vùng ảnh chiếm ưu thế (~70-75%).
   - Phải: metadata/action dạng panel hẹp (~25-30%).
2. **Hero image portrait-first**
   - Khung hiển thị ảnh theo chiều dọc (3:4 hoặc 4:5).
   - Căn giữa ảnh trong vùng ảnh, giảm dead space hai bên.
3. **Thumbnail strip tối ưu**
   - Đặt ngay dưới hero, kích thước thumb đồng nhất dọc.
   - Scroll ngang nếu nhiều ảnh.
4. **Metadata compact**
   - Title 1-2 dòng.
   - Meta ngắn theo dòng label-value.
   - Quick note rút gọn, ưu tiên phần ảnh.
5. **Action hierarchy**
   - `Edit Item` là nút primary.
   - `Next Report` là secondary.

## Kế hoạch triển khai (Pencil)
1. Update frame `EQZTl/lPMgI` để giảm padding thừa và chia lại tỷ lệ trái/phải.
2. Chuyển hero image về khung portrait lớn, tăng chiều cao hiển thị hữu dụng.
3. Tinh chỉnh thumbnail strip theo portrait thumbnail.
4. Nén metadata panel, giảm khoảng trắng dọc.
5. Chụp screenshot + chạy `snapshot_layout(problemsOnly=true)`.

## KPI hoàn tất
1. Ảnh dọc là focal point chính (chiếm phần lớn visual weight).
2. Khoảng trống trong viewer giảm rõ rệt.
3. Metadata/action vẫn rõ và thao tác được ngay.
4. Không có lỗi clipping/misalignment.

## Rủi ro và giảm thiểu
1. Ảnh lớn làm metadata bị chật:
   - Giữ metadata dạng compact + scroll nội bộ nếu cần.
2. Thumb quá nhỏ khó chọn:
   - Chốt kích thước thumb tối thiểu đủ nhận diện.
3. Layout mất cân bằng khi ảnh ngang:
   - Ưu tiên portrait nhưng vẫn giữ fallback hiển thị center-fit.
