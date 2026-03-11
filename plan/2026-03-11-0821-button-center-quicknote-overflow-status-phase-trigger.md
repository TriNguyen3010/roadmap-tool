# Plan: Căn giữa button + xử lý tràn Quick Note + trigger dropdown Status/Phase

## Mục tiêu
- Text trong button phải nằm đúng tâm (center) theo cả trục ngang và dọc.
- Nội dung `Quick Note` không bị tràn/đè layout ở các màn review.
- `Status` và `Phase` là 2 vùng bấm rõ ràng để mở dropdown list.

## Phạm vi
1. Cập nhật UI trong `pencil-new.pen` (Main/Viewer/States nếu có button tương tự).
2. Cập nhật behavior mock trong Viewer cho `Status` và `Phase` (cả block đều là trigger).
3. Không đổi dữ liệu nghiệp vụ, chỉ chỉnh UI/interaction.

## Thay đổi chi tiết
1. **Button center alignment**
- Các button dạng pill (`Switch category`, `Open Full Edit`, `Reported`, ...) chuyển sang layout canh giữa.
- Tránh dùng `padding + width fixed` gây lệch chữ về trái khi không có căn giữa.
- Kiểm tra đồng bộ line-height và vertical centering cho text 12/14px.

2. **Quick Note overflow**
- Block note dùng chiều cao cố định + clipping hoặc multiline clamp tùy ngữ cảnh.
- Text dài sẽ xuống dòng hợp lý, không chui ra ngoài card/panel.
- Với viewer: giữ vùng note scroll được khi nội dung dài.

3. **Status/Phase trigger dropdown**
- Biến mỗi cụm `Status` và `Phase` thành 1 vùng bấm rõ ràng (label + value/control trong cùng block).
- Khi bấm block `Status` => mở dropdown status.
- Khi bấm block `Phase` => mở dropdown phase.
- Trạng thái đóng/mở thể hiện bằng caret/visual feedback nhất quán.

## Triển khai bằng Pencil
1. Tìm tất cả button liên quan và set lại alignment center.
2. Chỉnh frame Quick Note để tránh overflow (wrap/clip/scroll theo từng màn).
3. Cập nhật cấu trúc block Status/Phase trong Viewer thành trigger areas.
4. Chụp screenshot để xác nhận:
- Button text centered.
- Quick note không tràn.
- Status/Phase nhìn là vùng bấm dropdown.

## Test checklist
1. Button text nằm giữa trên mọi button cùng style.
2. Quick note dài không phá layout và vẫn đọc được.
3. Click khu vực Status mở đúng dropdown.
4. Click khu vực Phase mở đúng dropdown.
5. Không có chồng lớp hoặc lệch khoảng cách sau khi chỉnh.

## Tiêu chí hoàn tất
1. Không còn button text lệch trái như ảnh bug.
2. Quick note an toàn với text dài.
3. Status/Phase rõ ràng là 2 điểm tương tác dropdown.
