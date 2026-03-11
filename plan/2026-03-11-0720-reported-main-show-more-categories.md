# Plan: Tăng số Category hiển thị ở `Reported Image Review - Main`

## Mục tiêu
- Giảm khoảng trống trên màn `Reported Image Review - Main`.
- Hiển thị được nhiều category hơn trong sidebar (thay vì chỉ ~4 mục đang nhìn thấy).
- Vẫn giữ readability và không làm layout rối.

## Vấn đề hiện tại
1. Header và khoảng trắng top đang chiếm nhiều chiều cao.
2. Sidebar category chưa có vùng scroll tối ưu theo chiều cao khung.
3. Row category đang hơi thoáng, làm giảm số dòng nhìn thấy đồng thời.

## Phạm vi
Bao gồm:
1. Tối ưu lại vertical spacing màn Main.
2. Tối ưu layout sidebar Category để tăng mật độ hiển thị.
3. Thêm cơ chế scroll hợp lý cho danh sách category dài.

Không bao gồm:
- Đổi logic filter category.
- Đổi dữ liệu/nguồn category.

## Đề xuất UI
1. Thu gọn phần header:
   - Giảm chiều cao khối header (ví dụ 72 -> 56~64).
   - Giảm margin giữa header và body.
2. Tăng chiều cao hữu dụng cho sidebar:
   - Sidebar chiếm full chiều cao body.
   - Danh sách category đặt trong vùng `overflow-y-auto` rõ ràng.
3. Tăng mật độ list category:
   - Giảm vertical padding mỗi row.
   - Giảm gap giữa rows (ví dụ 8 -> 4/6).
   - Font-size có thể giảm nhẹ nếu cần (14 -> 13) cho list riêng.
4. Giữ UX khi list dài:
   - Có search trong sidebar (tuỳ chọn nâng cấp) để tìm category nhanh.
   - Hiển thị count ngay cạnh category như hiện tại.

## Kế hoạch triển khai (Pencil)
1. Update frame `Reported Image Review - Main` (`bi8Au`):
   - Giảm chiều cao `Header` và khoảng cách `Header -> Body`.
2. Update `sidebar` + `catList`:
   - `catList` dùng vùng cao cố định theo body, bật scroll.
   - Giảm gap/padding của item category.
3. Thêm sample category để kiểm chứng:
   - Dựng ít nhất 10-12 category mẫu, xác nhận có thể thấy nhiều hơn 4 cùng lúc.
4. Review screenshot:
   - Kiểm tra cân bằng giữa sidebar và card grid.
   - Không để chữ bị cắt/clipped.

## Tiêu chí hoàn tất
1. Màn Main hiển thị nhiều category hơn đáng kể (target: >= 8 mục đồng thời trên cùng viewport desktop).
2. Khoảng trắng dư ở phần trên được giảm rõ rệt.
3. Sidebar vẫn dễ đọc và thao tác lọc không bị ảnh hưởng.
4. Không có lỗi layout/clipping trên canvas.

## Rủi ro và giảm thiểu
1. Mật độ quá dày gây khó đọc:
   - Giảm vừa phải, ưu tiên 13-14px và line-height rõ.
2. Scroll list khiến cảm giác nặng:
   - Chỉ scroll trong vùng category list, giữ phần title cố định.
3. Sidebar quá nổi so với main content:
   - Giữ tỷ lệ cột hiện tại, chỉ tối ưu chiều cao và spacing dọc.
