# Plan: Layout lại tính năng Week cho phù hợp Side Panel

## Bối cảnh
Ảnh hiện tại cho thấy panel `Quản lý Week` còn các vấn đề:
1. Nội dung từng week bị dàn ngang quá rộng, dễ tràn ở cột `Đến ngày`.
2. Khoảng trắng lớn ở phần body khi số week ít.
3. Mật độ thông tin chưa tối ưu cho side panel (khó quét nhanh).
4. Footer đã tốt nhưng phần content chưa tận dụng chiều cao hợp lý.

## Mục tiêu
1. Tối ưu bố cục theo chiều dọc cho side panel (dễ nhìn, không tràn ngang).
2. Hiển thị đủ trường quan trọng của week: Màu, Tên, Từ ngày, Đến ngày, trạng thái, action.
3. Giảm khoảng trắng rỗng không cần thiết.
4. Giữ luồng thao tác nhanh: thêm week, apply all, lưu.

## Đề xuất layout mới
### 1) Cấu trúc panel
1. Header giữ nguyên: `Quản lý Week` + subtitle ngắn.
2. Body chia thành:
- Thanh action trên list: `+ Thêm week mới`, `Apply all` (đưa lên đầu body, không đặt chỉ ở footer).
- Danh sách week dạng card dọc, mỗi card cao vừa phải, không kéo ngang.
3. Footer giữ 2 nút `Huỷ` / `Lưu` (sticky).

### 2) Cấu trúc card Week (ưu tiên mobile-first trong side panel)
1. Hàng 1:
- Dot màu + tên week (input chiếm full chiều ngang).
- Nút xoá ở góc phải.
2. Hàng 2:
- `Từ ngày` và `Đến ngày` chia 2 cột cân bằng.
3. Hàng 3:
- Badge `Scheduled/Unscheduled`.
- Nút `Apply to groups` nằm phải (hoặc full width nếu panel hẹp).
4. Palette màu chuyển thành 1 hàng compact (hoặc popover), tránh chiếm nhiều chiều ngang.

### 3) Responsive behavior
1. >= 1200px: vẫn ưu tiên layout dọc theo card, không dàn 1 hàng quá dài.
2. < 1200px: mọi field tự wrap hợp lý, tuyệt đối không che/tràn input cuối.
3. Không xuất hiện horizontal scroll ở content chính của panel.

## Chuẩn UI/UX áp dụng
1. Khoảng cách thống nhất: gap 8/12/16.
2. Input cùng chiều cao.
3. Label ngắn gọn (`Tên week`, `Từ ngày`, `Đến ngày`).
4. Trạng thái `Unscheduled` hiển thị rõ nhưng gọn.

## Kế hoạch triển khai
### Phase 1 - Refactor layout card week
1. Chuyển card từ bố cục ngang sang grid dọc 2-3 hàng.
2. Đưa xoá/apply về vị trí dễ thao tác hơn.
3. Đảm bảo không tràn ngang.

### Phase 2 - Tối ưu action + spacing panel
1. Đưa `Thêm week mới` + `Apply all` lên top body.
2. Giảm khoảng trắng thừa bằng spacing/height hợp lý.
3. Giữ footer sticky cho `Huỷ`/`Lưu`.

### Phase 3 - QA layout
1. Test với 0, 1, 2, 10 week.
2. Test có/không có schedule.
3. Test width nhỏ/lớn và zoom 90%-125%.
4. Đảm bảo flow Apply/Save không đổi logic.

## Acceptance criteria
1. Panel không bị tràn ngang ở các trường date.
2. Card week dễ quét, thao tác trong 1 lần nhìn.
3. Khoảng trắng rỗng giảm rõ rệt so với hiện tại.
4. Không ảnh hưởng logic lưu week/apply date hiện có.

## Cập nhật triển khai (2026-03-12)
1. Đã refactor `MilestoneEditor` từ layout ngang sang card dọc:
- Hàng 1: tên week + dot màu + nút xoá.
- Hàng 2: palette màu dạng compact.
- Hàng 3: `Từ ngày`/`Đến ngày` chia 2 cột responsive.
- Hàng 4: badge `Scheduled/Unscheduled` + `Apply to groups`.
2. Đã chuyển `Thêm week mới` và `Apply all` lên top body (sticky theo nội dung panel).
3. Footer hiện chỉ giữ `Huỷ` và `Lưu` để giảm rối thao tác.
4. Đã tăng khả năng thích ứng chiều rộng panel (`max-w`) để tránh tràn trên viewport hẹp.
5. Đã chạy kiểm tra:
- `npm run lint` (pass, còn warning cũ không liên quan tính năng này)
- `npm run test` (pass)
- `npm run build` (pass)
