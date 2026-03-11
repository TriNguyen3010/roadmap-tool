# Plan: Viewer cho phép chỉnh trực tiếp `Status` và `Phase`

## Mục tiêu
- Trong màn `Reported Image Review - Viewer`, user có thể đổi `Status` và `Phase` ngay tại chỗ.
- Giảm thao tác mở `Edit Item` cho các chỉnh sửa nhanh.
- Cập nhật dữ liệu tức thì và phản ánh ngay trên card/list.

## Phạm vi
Bao gồm:
1. UI inline controls trong viewer cho `Status` và `Phase`.
2. Wiring state + save flow cho 2 trường này.
3. Đồng bộ dữ liệu giữa Viewer, Main list và data gốc.

Không bao gồm:
- Chỉnh sửa các field khác (name/team/note/images) ngoài flow hiện có.
- Thay đổi schema dữ liệu.

## UX đề xuất
1. `Status`:
   - Dùng dropdown single-select (Not Started / PD In Progress / Dev In Progress / Done).
   - Hiển thị giá trị hiện tại như badge + icon dropdown.
2. `Phase`:
   - Dùng dropdown multi-select theo phase list hiện có.
   - Cho phép chọn nhanh `None` (chưa gán phase).
3. Hành vi save:
   - Save-on-select (đổi là lưu ngay) + toast `Đã cập nhật`.
   - Nếu lỗi lưu thì rollback giá trị cũ và báo lỗi.

## Thiết kế kỹ thuật
### 1) Component viewer
- Thêm 2 control mới trong panel phải:
  - `StatusInlineSelect`
  - `PhaseInlineSelect`
- Vị trí: ngay dưới title/metadata, trước phần quick note.

### 2) Data flow
- Viewer nhận `itemId` + current item data từ parent.
- Khi đổi status/phase:
  - clone/update item trong tree,
  - gọi cùng luồng `onDataChange(..., shouldSave=true)` hoặc hàm save tương đương.

### 3) Rule đồng bộ
- Nếu item bị đổi ra khỏi điều kiện filter hiện tại (ví dụ không còn Reported) thì:
  - viewer tự chuyển item kế tiếp hợp lệ hoặc đóng viewer + show toast.
- Phase options lấy từ milestones hiện tại, dùng normalize hiện có.

## Kế hoạch triển khai
1. Update layout viewer (Pencil + component) để chứa inline controls.
2. Implement dropdown status inline.
3. Implement dropdown phase inline (multi-select + none).
4. Kết nối save flow và rollback khi lỗi.
5. Test end-to-end các case đồng bộ list/viewer/filter.

## Test case bắt buộc
1. Đổi Status thành công, UI cập nhật ngay.
2. Đổi Phase (1/multi/none) thành công, UI cập nhật ngay.
3. Save lỗi -> rollback đúng và có thông báo.
4. Đổi xong item không còn trong current view -> viewer xử lý đúng.
5. Reload trang -> dữ liệu status/phase đã lưu chính xác.

## Rủi ro và giảm thiểu
1. Inline save nhiều lần gây conflict:
   - debounce nhẹ hoặc disable control khi đang saving.
2. Dropdown phase dài:
   - thêm search + scroll trong popup.
3. Lệch state giữa viewer và grid:
   - dùng single source of truth từ parent data/state.

## Tiêu chí hoàn tất
1. User đổi được `Status` và `Phase` ngay trong viewer.
2. Dữ liệu lưu thành công và đồng bộ toàn màn hình.
3. Không phát sinh lỗi layout/usability trong viewer.
