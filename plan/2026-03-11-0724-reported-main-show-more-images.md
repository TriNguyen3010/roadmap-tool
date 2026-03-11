# Plan: Tăng số hình ảnh hiển thị trên `Reported Image Review - Main`

## Mục tiêu
- Hiển thị được nhiều ảnh/card hơn trong cùng một viewport.
- Giảm vùng trống lớn ở khu vực content.
- Giữ khả năng đọc thông tin item và thao tác review/edit.

## Vấn đề hiện tại
1. Card ảnh đang cao, nên mỗi cột chỉ chứa ít item.
2. Grid hiện tại chưa tận dụng hết bề ngang vùng content.
3. Metadata trong card chiếm nhiều dòng, làm giảm mật độ ảnh.

## Phạm vi
Bao gồm:
1. Tối ưu layout grid trong màn Main (Pencil).
2. Tối ưu kích thước card/image ratio để tăng density.
3. Tối ưu nội dung card theo chế độ compact.

Không bao gồm:
- Thay đổi logic lọc dữ liệu.
- Thay đổi màn Viewer chi tiết.

## Đề xuất UI
1. Tăng số cột hiển thị card:
   - Desktop chuyển từ 2 cột chính sang 3 cột (hoặc 4 cột ở màn rộng).
2. Giảm chiều cao ảnh cover:
   - Ví dụ 160 -> 128/140px.
   - Ưu tiên ảnh **chữ nhật dọc** (portrait) cho đa số item.
   - Giữ tỉ lệ nhất quán (3:4 hoặc 4:5), hạn chế crop vuông.
3. Compact metadata card:
   - Chỉ giữ 2 dòng: `Title` + `Meta ngắn`.
   - Dùng badge cho `images count` và `Reported` thay vì dòng text dài.
4. Tận dụng vùng trống dưới:
   - Bổ sung thêm sample cards để test mật độ thực tế.

## Kế hoạch triển khai (Pencil)
1. Update `grid` của Main:
   - Chuyển sang bố cục 3 cột đều trong content area.
2. Update card template:
   - Thu gọn padding/gap.
   - Giảm height ảnh và giảm số dòng text.
3. Nhân thêm card mẫu:
   - Đảm bảo cùng viewport thấy nhiều ảnh hơn rõ rệt.
4. Review và cân chỉnh:
   - Kiểm tra readability và sự cân bằng với sidebar category.

## Tiêu chí hoàn tất
1. Trong viewport desktop, số ảnh/card thấy cùng lúc tăng rõ (target: từ ~4 lên >= 8).
2. Không còn khoảng trống lớn trong vùng content.
3. Card vẫn đọc được tên item + ngữ cảnh cơ bản.
4. Không phát sinh lỗi layout/clipping trên canvas.

## Rủi ro và giảm thiểu
1. Quá dày gây khó đọc:
   - Dùng compact vừa phải, giữ contrast tốt.
2. Ảnh nhỏ quá mất giá trị review:
   - Chốt chiều cao tối thiểu (>= 120px).
3. Ảnh nguồn khác tỉ lệ dễ bị méo/cắt:
   - Dùng `object-fit: cover` + crop theo tâm ảnh, ưu tiên khung chữ nhật dọc.
4. Màn hình hẹp bị rối:
   - Giữ responsive logic: hẹp thì 2 cột, rộng thì 3-4 cột.
