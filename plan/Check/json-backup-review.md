# Review: Củng cố tính năng Save/Backup JSON

Đã đọc bản plan `2026-03-09-1354-json-backup-review-plan.md`. Plan viết rất sát với thực tế luồng code hiện tại, hướng đến việc tăng cường độ an toàn và trọn vẹn của dữ liệu Backup. Có một số điểm em góp ý thêm để quá trình implement được mượt và tránh lỗi rườm rà:

### 1. Đồng bộ dùng thư viện Format thời gian
- Tại Bước 3, thay đổi tên file thành pattern `..._backup_yyyy-MM-dd_HHmmss.json`. 
  - -> **Lưu ý:** Dự án đang sử dụng thư viện `date-fns`. Developer nên sử dụng hàm `format` của thư viện này (ví dụ `format(new Date(), 'yyyy-MM-dd_HHmmss')`) thay vì viết chay bằng Javascript (`getHours()`, `getMinutes()`...) để code timezone thống nhất và ngắn gọn.

### 2. Validate Type chặt chẽ hơn khi Import
- Tại Bước 1 & Bước 2: Khi khôi phục `expandedIds` và `hiddenRowIds` từ file JSON nạp vào.
  - -> **Bảo mật dữ liệu:** File JSON từ bên ngoài user nhét vào hoàn toàn có thể bị ai đó sửa bậy. Ngoài việc check `Array.isArray()`, developer cần wrap thêm một hàm check nhỏ để đảm bảo tất cả các phần tử bên trong mảng này đều là `string`. Nếu có phần tử nào không phải chuỗi, filter bỏ đi hoặc fallback về mảng rỗng `[]` để tránh gây lỗi React (key error) ở giao diện Grid.

### 3. Xem xét việc gán Version (Tùy chọn cho tương lai)
- Hiện tại việc import chỉ dựa vào việc property có tồn tại hay không. Nếu sau này Data schema thay đổi rất nhiều (Break changes), việc check type if-else sẽ cực kỳ cồng kềnh.
  - -> **Đề xuất mở rộng:** Khi export `buildDocumentSnapshot`, anh thử cân nhắc nhét thêm 1 trường `version: 1` vào JSON. Thêm biến này không mất gì, nhưng sau này qua v2, v3 mình có thể viết migrate code cực kì dễ dựa trên `json.version`. Nếu project nhỏ thì chưa cần ngay, ghi nhận ở mức "nice to have".

---
**Tóm tắt:** Plan đi đúng trọng tâm lỗi thiếu config khi nạp file. Chỉ cần chú ý ép kiểu/cắt lọc an toàn khi parse Mảng (Array của Expanded/Hidden) và dùng `date-fns` để xuất tên file cho chuẩn là duyệt code cái một ạ!
