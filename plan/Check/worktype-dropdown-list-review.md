# Review: Cho phép chỉnh WorkType bằng dropdown list

Đã đọc bản plan `2026-03-09-1328-worktype-dropdown-list.md`. Plan này tập trung vào việc thêm tiện ích thao tác nhanh trên Grid (Inline Edit) cho cột WorkType mới được tạo ở Plan trước đó. Các bước xử lý sự kiện click ngoài, đóng/mở dropdown song song đều được tính toán hợp lý.

Dưới đây là một số góp ý để hoàn thiện quá trình code:

### 1. Style và Kích thước của Dropdown
- So với Priority hay Status (thường chỉ rớt xuống các option ngắn gọn), WorkType có các chữ khá dài như `Improvement`, `Growth Camp`.
  - -> **Bổ sung:** Cần quy định trước một block `min-w-[120px]` hoặc rộng hơn cho menu thả xuống của WorkType để tránh chữ bị rớt dòng khó coi. (Chỉnh trong Bước 3).

### 2. Sự tương đồng UX với Priority và Phase
- Nếu anh để ý ở code cũ, khi người dùng click vào cell Priority/Phase, ngoài sự kiện hiện danh sách xổ xuống, nó còn phải đảm bảo tính **Stop Propagation** (như anh đã ghi ở `Rủi ro và giảm thiểu`) để không kích hoạt nhầm sự kiện Edit Row (click vào text tên để bật popup). 
  - -> **Lưu ý:** Ghi rõ hơn ở Bước 3 là cell WorkType phải bắt sự kiện `onClick` (hoặc `onMouseDown`) và bọc bằng `e.stopPropagation()` trước khi set `openWorkTypeId`.

### 3. Vấn đề với thao tác cuộn (Scroll)
- Grid của mình có khả năng cuộn ngang và cuộn dọc. Dropdown mở ra dạng absolute.
- Các dropdown cũ (Priority, Phase) thường được thiết kế để render nổi lên trên (z-index cao). 
  - -> **Lưu ý:** Đảm bảo `z-index` của dropdown menu WorkType đủ lớn (`z-50` hoặc tương đương) để không bị cột cố định bên trái (Fixed Columns) hoặc các dòng bên dưới che khuất.

### 4. Giao diện EditPopup (Bước 4)
- Anh có đề xuất "đồng bộ popup Edit" từ chip buttons sang `<select>`.
- Tuy nhiên, chip buttons (những cái nút bấm click chọn) trên EditPopup hiện đang rất thân thiện với touch và dễ nhìn nhanh hơn là một menu `<select>` truyền thống (thường phải click 2 lần mới chọn được). 
  - -> **Góp ý:** Ở phần Edit Popup, anh cứ giữ giao diện các nút bấm (Chip) như cũ, chỉ cập nhật danh sách chọn thành 4 options mới (Feature, Improvement, Bug, Growth Camp) là đủ. Không cần ép đổi Node Group sang `<select>` làm gì cho giảm trải nghiệm người dùng ạ.

---
**Tóm lại:** Plan rất an toàn và gọn gàng. Khi code dev chỉ cần chú ý: chèn **z-index, stopPropagation**, căn **độ rộng menu nảy ra vừa đủ** và **giữ nguyên thiết kế dạng nút (chip) trong EditPopup** thay vì đổi sang select là hệ thống sẽ mượt mà nhất!
