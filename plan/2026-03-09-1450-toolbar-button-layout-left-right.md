# Plan: Điều chỉnh vị trí cụm nút Toolbar (Left/Right)

## Mục tiêu
- Đưa cụm nút quick view mới (`Feature`, `Improvement`, `Bug`, `Web`, `App`, `Reported`) sang bên trái toolbar.
- Chuẩn hóa cụm nút bên phải chỉ còn:
  1. `Editor` (hoặc `Viewer`)
  2. `Phases`
  3. `Filter`
  4. `Save`
  5. `Setting`

## Phạm vi
Bao gồm:
1. Sắp xếp lại layout trong `src/components/Toolbar.tsx`.
2. Giữ nguyên logic filter quick view đã triển khai, chỉ đổi vị trí hiển thị.
3. Giữ nguyên behavior của nút phải hiện có (editor lock/unlock, phases, filter, save, settings).

Không bao gồm:
- Đổi logic filter dữ liệu.
- Đổi style tổng thể ngoài phạm vi bố cục nút.

## Kế hoạch triển khai
### Bước 1: Tách rõ 3 vùng của Toolbar
1. `Left`: logo + tên document + cụm quick view.
2. `Center`: đồng hồ realtime (nếu đủ chỗ).
3. `Right`: nhóm nút theo đúng thứ tự yêu cầu.

### Bước 2: Di chuyển cụm quick view sang trái
1. Cắt block quick buttons khỏi cụm action bên phải.
2. Gắn quick buttons vào khu vực bên trái, ngay sau phần tên document.
3. Giữ trạng thái active/inactive và callback `onToggleQuickViewMode` như hiện tại.

### Bước 3: Chuẩn hóa nhóm nút bên phải
1. Đảm bảo thứ tự render: `Editor/Viewer` -> `Phases` -> `Filter` -> `Save` -> `Setting`.
2. Không thêm nút khác vào cụm này.
3. Giữ nguyên tooltip/disabled state theo quyền `canEdit`.

### Bước 4: Responsive kiểm tra chồng lấn
1. Khi chiều ngang hẹp, ưu tiên không làm vỡ nút bên phải.
2. Cho cụm quick view bên trái có thể wrap/thu gọn hợp lý.
3. Đảm bảo đồng hồ không đè lên action area.

### Bước 5: Validation
1. Test click từng quick button sau khi di chuyển.
2. Test các nút phải còn hoạt động đúng.
3. Chạy `npm run lint` và `npm run build`.

## Rủi ro và giảm thiểu
- Rủi ro toolbar quá chật trên màn hình nhỏ:
  - Giảm thiểu: cho quick buttons wrap và giữ nhóm nút phải là `shrink-0`.
- Rủi ro sai thứ tự nút phải sau refactor:
  - Giảm thiểu: render cố định theo list thứ tự yêu cầu.
- Rủi ro mất click area do thay đổi flex:
  - Giảm thiểu: kiểm tra hover/click thực tế sau khi sửa.

## Tiêu chí hoàn tất
1. Quick view buttons hiển thị bên trái.
2. Bên phải chỉ còn đúng 5 nhóm nút: `Editor`, `Phases`, `Filter`, `Save`, `Setting`.
3. Không phát sinh lỗi lint/build.
