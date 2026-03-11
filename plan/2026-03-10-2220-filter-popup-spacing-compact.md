# Plan: Thu gọn khoảng trống popup Filter

## Mục tiêu
- Giảm cảm giác dư khoảng trống trong popup Filter hiện tại.
- Giữ đủ thông tin và thao tác filter, nhưng bố cục gọn, đặc hơn.
- Tránh popup quá cao hoặc quá rộng khi mở trên desktop.

## Vấn đề hiện tại
1. Khoảng cách giữa các block bên phải còn lớn, tạo nhiều vùng trống.
2. Card padding + margin đang rộng, đặc biệt khi số option trong block ít.
3. Tỷ lệ 2 cột chưa cân bằng theo mật độ nội dung thực tế.
4. Danh sách dài ở Scope kéo panel cao, khiến phần còn lại nhìn loãng.

## Phạm vi
Bao gồm:
1. Chỉnh layout và spacing của `FilterPopup`.
2. Tối ưu tỷ lệ cột trái/phải và khoảng cách giữa section.
3. Tinh chỉnh chiều cao scroll cho list dài để giảm tổng chiều cao popup.

Không bao gồm:
- Thay đổi logic filter.
- Thay đổi dữ liệu hoặc schema lưu settings.

## Đề xuất UI/UX
1. Giảm bề ngang popup từ 760 xuống khoảng 680-700 (kèm max width theo viewport).
2. Giảm `gap` giữa các card (ví dụ 12px -> 8px), giảm `padding` card (ví dụ 12px -> 10px).
3. Chia cột phải thành grid 2 cột con cho các block ngắn:
   - Hàng 1: WorkType | Phase
   - Hàng 2: Status   | Priority
   - Teams: full width bên dưới nếu có.
4. Giới hạn chiều cao phần Category list (ví dụ ~260-300px) với scroll để tránh kéo toàn popup.
5. Tinh chỉnh line-height và spacing checkbox item đồng nhất, giảm khoảng trắng dọc.

## Thiết kế kỹ thuật
- File chính: `src/components/FilterPopup.tsx`.
- Giữ nguyên props/state hiện có.
- Chỉ refactor className/layout bằng Tailwind:
  - `widthClassName`
  - outer grid + nested grid ở cột phải
  - spacing tokens (`gap`, `px`, `py`, `mb`, `pt`)
  - `max-h` + `overflow-y-auto` cho list dài.

## Kế hoạch triển khai
1. Điều chỉnh width panel và spacing tổng thể.
2. Refactor cột phải sang nested grid 2 cột cho các section ngắn.
3. Thu gọn padding/margin và chiều cao list ở Scope.
4. Test nhanh các trạng thái:
   - Có/không có phase.
   - Có/không có team.
   - Nhiều category/subcategory.
5. Chạy `npm run lint` và `npm run build`.

## Rủi ro và giảm thiểu
1. Rủi ro quá chật trên màn hình nhỏ:
   - Dùng breakpoint để tự động quay lại 1 cột.
2. Rủi ro giảm spacing quá mạnh gây khó đọc:
   - Giữ khoảng cách tối thiểu nhất quán cho checkbox rows.
3. Rủi ro scroll nested khó thao tác:
   - Chỉ scroll ở vùng list dài, giữ section header cố định trong card.

## Tiêu chí hoàn tất
1. Popup nhìn gọn hơn rõ rệt, giảm vùng trắng thừa.
2. Không mất thao tác filter nào hiện có.
3. Trải nghiệm trên desktop/mobile đều ổn định.
4. `lint` và `build` pass.
